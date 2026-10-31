import { createClient } from '@supabase/supabase-js'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { surveyQuestions, type SurveyAnswer } from '../shared/survey.js'

type VercelRequest = IncomingMessage & { body: unknown }
type VercelResponse = ServerResponse & {
  status(statusCode: number): VercelResponse
  json(body: unknown): VercelResponse
}
type SurveySubmission = {
  id: string
  respondent_name: string
  answers: Record<string, SurveyAnswer>
  created_at: string
}

const MAX_BODY_BYTES = 16 * 1024
const MAX_NAME_LENGTH = 100
const MAX_OPEN_ANSWER_LENGTH = 1000
const RATE_WINDOW_MS = 10 * 60 * 1000
const RATE_LIMIT = 5
const rateBuckets = new Map<string, { count: number; resetAt: number }>()

const setSecurityHeaders = (response: VercelResponse) => {
  response.setHeader('Cache-Control', 'no-store')
  response.setHeader('X-Content-Type-Options', 'nosniff')
  response.setHeader('X-Frame-Options', 'DENY')
  response.setHeader('Referrer-Policy', 'no-referrer')
  response.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')
  response.setHeader('Vary', 'Origin')
}

const respondError = (response: VercelResponse, status: number, error: string) => (
  response.status(status).json({ error })
)

const allowRequestOrigin = (request: VercelRequest, response: VercelResponse) => {
  const requestOrigin = request.headers.origin
  const configuredOrigins = (process.env.ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean)

  if (typeof requestOrigin !== 'string') return true
  if (!configuredOrigins.includes(requestOrigin)) return false
  response.setHeader('Access-Control-Allow-Origin', requestOrigin)
  return true
}

const getClientKey = (request: VercelRequest) => {
  const forwardedFor = request.headers['x-forwarded-for']
  return typeof forwardedFor === 'string'
    ? forwardedFor.split(',').pop()?.trim() || 'unknown'
    : 'unknown'
}

const isRateLimited = (request: VercelRequest) => {
  const clientKey = getClientKey(request)
  const now = Date.now()
  for (const [key, bucket] of rateBuckets) {
    if (bucket.resetAt <= now) rateBuckets.delete(key)
  }

  const bucket = rateBuckets.get(clientKey)
  if (!bucket || bucket.resetAt <= now) {
    rateBuckets.set(clientKey, { count: 1, resetAt: now + RATE_WINDOW_MS })
    return false
  }
  if (bucket.count >= RATE_LIMIT) return true
  bucket.count += 1
  return false
}

const parseBody = (request: VercelRequest): unknown => {
  if (typeof request.body !== 'string') return request.body
  try {
    return JSON.parse(request.body) as unknown
  } catch {
    return null
  }
}

const validateAnswers = (value: unknown): value is Record<string, SurveyAnswer> => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  const answers = value as Record<string, unknown>
  if (Object.keys(answers).length !== surveyQuestions.length) return false

  return surveyQuestions.every((question) => {
    const answer = answers[String(question.id)]
    if (question.type === 'open') {
      return typeof answer === 'string'
        && answer.trim().length >= 2
        && answer.length <= MAX_OPEN_ANSWER_LENGTH
    }

    if (!Array.isArray(question.options)) return false
    if (question.type === 'closed') {
      return typeof answer === 'string' && question.options.includes(answer)
    }

    return Array.isArray(answer)
      && answer.length > 0
      && answer.length <= question.options.length
      && answer.every((option) => typeof option === 'string' && question.options?.includes(option))
      && new Set(answer).size === answer.length
  })
}

export default async function handler(request: VercelRequest, response: VercelResponse) {
  setSecurityHeaders(response)
  response.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  response.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')

  if (!allowRequestOrigin(request, response)) {
    return respondError(response, 403, 'Бұл сайттан сауалнама жіберуге рұқсат жоқ.')
  }

  if (request.method === 'OPTIONS') return response.status(204).end()
  if (request.method !== 'GET' && request.method !== 'POST') {
    response.setHeader('Allow', 'GET, POST, OPTIONS')
    return respondError(response, 405, 'Бұл сұрау әдісіне рұқсат жоқ.')
  }
  if (request.method === 'POST' && Number(request.headers['content-length'] ?? 0) > MAX_BODY_BYTES) {
    return respondError(response, 413, 'Сауалнама жауабы тым үлкен.')
  }
  if (request.method === 'POST' && !request.headers['content-type']?.toLowerCase().includes('application/json')) {
    return respondError(response, 415, 'Сауалнама жауабы JSON пішімінде болуы керек.')
  }

  const supabaseUrl = process.env.SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceRoleKey) {
    return respondError(response, 503, 'Сауалнаманы сақтау қызметі әлі бапталмаған.')
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  if (request.method === 'GET') {
    try {
      const requestUrl = new URL(request.url ?? '/', 'http://localhost')
      if (requestUrl.searchParams.get('view') === 'responses') {
        const authorization = request.headers.authorization
        const accessToken = typeof authorization === 'string' && authorization.startsWith('Bearer ')
          ? authorization.slice('Bearer '.length).trim()
          : ''
        if (!accessToken) return respondError(response, 401, 'Жеке жауаптарды көру үшін жүйеге кіріңіз.')

        const { data: userData, error: authError } = await supabase.auth.getUser(accessToken)
        if (authError || !userData.user) {
          return respondError(response, 401, 'Сессия жарамсыз. Қайта кіріп көріңіз.')
        }

        const { data: profile, error: profileError } = await supabase
          .from('profiles')
          .select('role')
          .eq('id', userData.user.id)
          .maybeSingle()
        if (profileError) {
          console.error('Survey admin role query failed', { code: profileError.code ?? 'UNKNOWN' })
          return respondError(response, 503, 'Әкімші құқығын тексеру мүмкін болмады.')
        }
        if (profile?.role !== 'admin') {
          return respondError(response, 403, 'Жеке сауалнама жауаптарын тек әкімші көре алады.')
        }

        const requestedOffset = Number(requestUrl.searchParams.get('offset') ?? 0)
        const offset = Number.isSafeInteger(requestedOffset) && requestedOffset >= 0 ? requestedOffset : 0
        const pageSize = 100
        const { data: submissions, error: submissionsError, count } = await supabase
          .from('survey_submissions')
          .select('id, respondent_name, answers, created_at', { count: 'exact' })
          .order('created_at', { ascending: false })
          .range(offset, offset + pageSize - 1)
        if (submissionsError) {
          console.error('Survey response details query failed', { code: submissionsError.code ?? 'UNKNOWN' })
          return respondError(response, 503, 'Жеке жауаптарды жүктеу мүмкін болмады.')
        }

        return response.status(200).json({
          responses: (submissions ?? []) as SurveySubmission[],
          totalCount: count ?? 0,
          hasMore: offset + (submissions?.length ?? 0) < (count ?? 0),
        })
      }

      const { data, error } = await supabase.rpc('get_public_survey_results')
      if (error) {
        console.error('Survey results query failed', { code: error.code ?? 'UNKNOWN' })
        return respondError(response, 503, 'Сауалнама нәтижелерін жүктеу мүмкін болмады.')
      }
      return response.status(200).json(data)
    } catch (error) {
      console.error('Survey results request failed', {
        code: error instanceof Error ? error.name : 'UNKNOWN',
      })
      return respondError(response, 503, 'Сауалнама нәтижелерін жүктеу мүмкін болмады.')
    }
  }

  if (isRateLimited(request)) {
    response.setHeader('Retry-After', String(RATE_WINDOW_MS / 1000))
    return respondError(response, 429, 'Жауап жіберу шегіне жеттіңіз. Кейінірек қайталап көріңіз.')
  }

  const body = parseBody(request)
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return respondError(response, 400, 'Сұрау JSON пішімінде болуы керек.')
  }
  if (Buffer.byteLength(JSON.stringify(body), 'utf8') > MAX_BODY_BYTES) {
    return respondError(response, 413, 'Сауалнама жауабы тым үлкен.')
  }
  const payload = body as { name?: unknown; answers?: unknown }
  if (typeof payload.name !== 'string' || payload.name.trim().length < 2 || payload.name.trim().length > MAX_NAME_LENGTH) {
    return respondError(response, 400, 'Атыңызды 2–100 таңба аралығында енгізіңіз.')
  }
  if (!validateAnswers(payload.answers)) {
    return respondError(response, 400, 'Барлық сұраққа жарамды жауап беріңіз.')
  }

  try {
    const { error } = await supabase
      .from('survey_submissions')
      .insert({ respondent_name: payload.name.trim(), answers: payload.answers })
    if (error) {
      console.error('Survey response insert failed', { code: error.code ?? 'UNKNOWN' })
      return respondError(response, 503, 'Жауапты сақтау мүмкін болмады. Кейінірек қайталап көріңіз.')
    }
    return response.status(201).json({ message: 'Жауап сақталды.' })
  } catch (error) {
    console.error('Survey submission request failed', {
      code: error instanceof Error ? error.name : 'UNKNOWN',
    })
    return respondError(response, 503, 'Жауапты сақтау мүмкін болмады. Кейінірек қайталап көріңіз.')
  }
}
