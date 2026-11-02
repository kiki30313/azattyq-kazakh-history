import { createHash, randomInt, randomUUID } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { classroomQuestions, classroomQuestionsById } from './classroomQuestions.js'

type VercelRequest = IncomingMessage & { body: unknown }
type VercelResponse = ServerResponse & {
  status(statusCode: number): VercelResponse
  json(body: unknown): VercelResponse
}

const MAX_BODY_BYTES = 16 * 1024
const MAX_PLAYERS = 100
const TOKEN_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const CODE_PATTERN = /^\d{6}$/

const respondError = (response: VercelResponse, status: number, error: string) => (
  response.status(status).json({ error })
)

const parseBody = (request: VercelRequest): unknown => {
  if (typeof request.body !== 'string') return request.body
  try {
    return JSON.parse(request.body) as unknown
  } catch {
    return null
  }
}

const tokenHash = (token: string) => createHash('sha256').update(token).digest('hex')

function shuffleQuestions() {
  const questions = [...classroomQuestions]
  for (let index = questions.length - 1; index > 0; index -= 1) {
    const swapIndex = randomInt(index + 1)
    ;[questions[index], questions[swapIndex]] = [questions[swapIndex], questions[index]]
  }
  return questions.map((question) => question.id)
}

function setHeaders(request: VercelRequest, response: VercelResponse) {
  response.setHeader('Cache-Control', 'no-store')
  response.setHeader('X-Content-Type-Options', 'nosniff')
  response.setHeader('X-Frame-Options', 'DENY')
  response.setHeader('Referrer-Policy', 'no-referrer')
  response.setHeader('Vary', 'Origin')
  response.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  response.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  const origin = request.headers.origin
  if (typeof origin !== 'string') return true
  const configuredOrigins = (process.env.ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)
  const protocol = request.headers['x-forwarded-proto']?.toString().split(',')[0] ?? 'https'
  const host = request.headers['x-forwarded-host']?.toString().split(',')[0] ?? request.headers.host
  const sameOrigin = host ? origin === `${protocol}://${host}` : false
  if (!configuredOrigins.includes(origin) && !sameOrigin) return false
  response.setHeader('Access-Control-Allow-Origin', origin)
  return true
}

export default async function handler(request: VercelRequest, response: VercelResponse) {
  if (!setHeaders(request, response)) return respondError(response, 403, 'Бұл сайттан ойынға қосылуға рұқсат жоқ.')
  if (request.method === 'OPTIONS') return response.status(204).end()
  if (request.method !== 'GET' && request.method !== 'POST') {
    response.setHeader('Allow', 'GET, POST, OPTIONS')
    return respondError(response, 405, 'Бұл сұрау әдісіне рұқсат жоқ.')
  }
  if (request.method === 'POST' && Number(request.headers['content-length'] ?? 0) > MAX_BODY_BYTES) {
    return respondError(response, 413, 'Сұрау көлемі тым үлкен.')
  }

  const supabaseUrl = process.env.SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceRoleKey) {
    return respondError(response, 503, 'Сынып ойынының қызметі бапталмаған. Vercel-дегі Supabase параметрлерін тексеріңіз.')
  }
  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  if (request.method === 'GET') {
    const url = new URL(request.url ?? '/', 'http://localhost')
    if (url.searchParams.get('action') !== 'state') return respondError(response, 400, 'Ойын күйі сұрауы жарамсыз.')
    const code = url.searchParams.get('code') ?? ''
    const token = url.searchParams.get('token') ?? ''
    const role = url.searchParams.get('role')
    if (!CODE_PATTERN.test(code) || !TOKEN_PATTERN.test(token) || (role !== 'host' && role !== 'player')) {
      return respondError(response, 400, 'Ойын коды немесе қатысу кілті жарамсыз.')
    }

    try {
      const { data: session, error: sessionError } = await supabase
        .from('classroom_quiz_sessions')
        .select('code, host_token_hash, question_ids, question_index, timer_seconds, status, question_ends_at')
        .eq('code', code)
        .maybeSingle()
      if (sessionError) {
        console.error('Classroom session lookup failed', { code: sessionError.code ?? 'UNKNOWN' })
        return respondError(response, 503, 'Ойын сессиясын жүктеу мүмкін болмады.')
      }
      if (!session) return respondError(response, 404, 'Бұл ойын коды табылмады.')

      const isHost = role === 'host' && session.host_token_hash === tokenHash(token)
      const { data: participant, error: participantError } = role === 'player'
        ? await supabase.from('classroom_quiz_participants')
            .select('id')
            .eq('session_code', code)
            .eq('token_hash', tokenHash(token))
            .maybeSingle()
        : { data: null, error: null }
      if (participantError) {
        console.error('Classroom participant lookup failed', { code: participantError.code ?? 'UNKNOWN' })
        return respondError(response, 503, 'Қатысушыны тексеру мүмкін болмады.')
      }
      if (!isHost && !participant) return respondError(response, 403, 'Ойынға қатысу кілті жарамсыз.')

      const [{ data: participants, error: participantsError }, { data: answers, error: answersError }] = await Promise.all([
        supabase.from('classroom_quiz_participants')
          .select('id, display_name, score, correct_count')
          .eq('session_code', code)
          .order('score', { ascending: false })
          .order('joined_at', { ascending: true }),
        session.status === 'finished'
          ? supabase.from('classroom_quiz_answers')
              .select('participant_id, question_index, answer_text')
              .eq('session_code', code)
              .order('question_index', { ascending: true })
          : Promise.resolve({ data: [], error: null }),
      ])
      if (participantsError || answersError) {
        console.error('Classroom state query failed', { code: participantsError?.code ?? answersError?.code ?? 'UNKNOWN' })
        return respondError(response, 503, 'Ойын нәтижелерін жүктеу мүмкін болмады.')
      }

      const questionId = (session.question_ids as string[])[session.question_index]
      const question = questionId ? classroomQuestionsById.get(questionId) : undefined
      let answeredIds: string[] = []
      if (session.status === 'running' && question) {
        const { data: submitted, error: submittedError } = await supabase
          .from('classroom_quiz_answers')
          .select('participant_id')
          .eq('session_code', code)
          .eq('question_index', session.question_index)
        if (submittedError) {
          console.error('Classroom answer progress query failed', { code: submittedError.code ?? 'UNKNOWN' })
          return respondError(response, 503, 'Жауап беру барысын жүктеу мүмкін болмады.')
        }
        answeredIds = (submitted ?? []).map((item) => item.participant_id)
      }

      const answerDetails = isHost && session.status === 'finished'
        ? (answers ?? []).map((answer) => ({
            questionNumber: answer.question_index + 1,
            question: classroomQuestionsById.get((session.question_ids as string[])[answer.question_index])?.prompt ?? '',
            name: participants?.find((item) => item.id === answer.participant_id)?.display_name ?? 'Қатысушы',
            answer: answer.answer_text,
          }))
        : undefined

      return response.status(200).json({
        code,
        status: session.status,
        questionIndex: session.question_index,
        questionCount: (session.question_ids as string[]).length,
        timerSeconds: session.timer_seconds,
        endsAt: session.question_ends_at,
        question: session.status === 'running' && question
          ? { prompt: question.prompt, options: question.options }
          : null,
        participants: (participants ?? []).map((item) => ({
          name: item.display_name,
          score: item.score,
          correctCount: session.status === 'finished' ? item.correct_count : 0,
          hasAnswered: answeredIds.includes(item.id),
        })),
        currentAnsweredCount: answeredIds.length,
        leaderboard: (participants ?? []).map((item) => ({
          name: item.display_name,
          score: item.score,
          correctCount: session.status === 'finished' ? item.correct_count : 0,
        })),
        answerDetails,
        participantId: participant?.id ?? null,
      })
    } catch (error) {
      console.error('Classroom state request failed', { name: error instanceof Error ? error.name : 'UNKNOWN' })
      return respondError(response, 503, 'Ойын деректерін оқу кезінде қате шықты.')
    }
  }

  const body = parseBody(request)
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return respondError(response, 400, 'Сұрау JSON пішімінде болуы керек.')
  }
  if (Buffer.byteLength(JSON.stringify(body), 'utf8') > MAX_BODY_BYTES) {
    return respondError(response, 413, 'Сұрау көлемі тым үлкен.')
  }
  const payload = body as Record<string, unknown>

  try {
    if (payload.action === 'create') {
      if (payload.timerSeconds !== 10 && payload.timerSeconds !== 15 && payload.timerSeconds !== 20) {
        return respondError(response, 400, 'Таймер 10, 15 немесе 20 секунд болуы керек.')
      }
      const { error: cleanupError } = await supabase.from('classroom_quiz_sessions')
        .delete()
        .lt('created_at', new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString())
      if (cleanupError) {
        console.error('Classroom expired session cleanup failed', { code: cleanupError.code ?? 'UNKNOWN' })
        return respondError(response, 503, 'Ескі ойын сессияларын тазарту мүмкін болмады.')
      }

      const hostToken = randomUUID()
      const questionIds = shuffleQuestions()
      for (let attempt = 0; attempt < 5; attempt += 1) {
        const code = String(randomInt(100000, 1000000))
        const { error } = await supabase.from('classroom_quiz_sessions').insert({
          code,
          host_token_hash: tokenHash(hostToken),
          question_ids: questionIds,
          question_index: 0,
          timer_seconds: payload.timerSeconds,
          status: 'waiting',
        })
        if (!error) return response.status(201).json({ code, hostToken, questionCount: questionIds.length })
        if (error.code !== '23505') {
          console.error('Classroom session creation failed', { code: error.code ?? 'UNKNOWN' })
          return respondError(response, 503, 'Ойын сессиясын ашу мүмкін болмады.')
        }
      }
      return respondError(response, 503, 'Ойын коды жасалмады. Қайталап көріңіз.')
    }

    const code = typeof payload.code === 'string' ? payload.code : ''
    if (!CODE_PATTERN.test(code)) return respondError(response, 400, 'Алты таңбалы ойын кодын енгізіңіз.')

    const { data: session, error: sessionError } = await supabase
      .from('classroom_quiz_sessions')
      .select('code, host_token_hash, question_ids, question_index, timer_seconds, status, question_ends_at')
      .eq('code', code)
      .maybeSingle()
    if (sessionError) {
      console.error('Classroom session lookup failed', { code: sessionError.code ?? 'UNKNOWN' })
      return respondError(response, 503, 'Ойын сессиясын табу мүмкін болмады.')
    }
    if (!session) return respondError(response, 404, 'Бұл ойын коды табылмады.')

    if (payload.action === 'join') {
      const name = typeof payload.name === 'string' ? payload.name.trim() : ''
      if (name.length < 2 || name.length > 40) return respondError(response, 400, 'Атыңызды 2–40 таңба аралығында енгізіңіз.')
      if (session.status !== 'waiting') return respondError(response, 409, 'Ойын басталып кетті. Мұғалімнен жаңа код сұраңыз.')
      const { count, error: countError } = await supabase.from('classroom_quiz_participants')
        .select('id', { count: 'exact', head: true })
        .eq('session_code', code)
      if (countError) {
        console.error('Classroom participant count failed', { code: countError.code ?? 'UNKNOWN' })
        return respondError(response, 503, 'Қатысушылар санын тексеру мүмкін болмады.')
      }
      if ((count ?? 0) >= MAX_PLAYERS) return respondError(response, 409, 'Бұл ойынға қатысушылардың ең көп саны толды.')

      const token = randomUUID()
      const { data: participant, error } = await supabase.from('classroom_quiz_participants').insert({
        session_code: code,
        display_name: name,
        token_hash: tokenHash(token),
      }).select('id').single()
      if (error) {
        if (error.code === '23505') return respondError(response, 409, 'Бұл атпен қатысушы бар. Атыңызға тегіңізді қосып көріңіз.')
        console.error('Classroom participant join failed', { code: error.code ?? 'UNKNOWN' })
        return respondError(response, 503, 'Ойынға қосылу мүмкін болмады.')
      }
      return response.status(201).json({ code, token, participantId: participant.id })
    }

    if (typeof payload.token !== 'string' || !TOKEN_PATTERN.test(payload.token)) {
      return respondError(response, 400, 'Ойынға қатысу кілті жарамсыз.')
    }
    const isHost = session.host_token_hash === tokenHash(payload.token)
    if (payload.action === 'start') {
      if (!isHost) return respondError(response, 403, 'Тек мұғалім ойынды бастай алады.')
      if (session.status !== 'waiting') return respondError(response, 409, 'Ойын басталған немесе аяқталған.')
      const { count, error: countError } = await supabase.from('classroom_quiz_participants')
        .select('id', { count: 'exact', head: true })
        .eq('session_code', code)
      if (countError) return respondError(response, 503, 'Қатысушылар санын тексеру мүмкін болмады.')
      if (!count) return respondError(response, 409, 'Ойынды бастау үшін кемінде бір студент қосылуы керек.')
      const now = new Date()
      const { data: started, error } = await supabase.from('classroom_quiz_sessions')
        .update({
          status: 'running',
          question_index: 0,
          question_ends_at: new Date(now.getTime() + session.timer_seconds * 1000).toISOString(),
        })
        .eq('code', code)
        .eq('status', 'waiting')
        .select('code')
        .maybeSingle()
      if (error || !started) return respondError(response, 409, 'Ойынды бастау мүмкін болмады. Сессия күйін жаңартыңыз.')
      return response.status(200).json({ status: 'running' })
    }

    if (payload.action === 'advance') {
      if (!isHost) return respondError(response, 403, 'Тек мұғалім келесі сұраққа өткізе алады.')
      if (session.status !== 'running' || !Number.isInteger(payload.questionIndex) || payload.questionIndex !== session.question_index) {
        return respondError(response, 409, 'Сұрақ күйі өзгерді. Экранды жаңартыңыз.')
      }
      const { count: totalPlayers, error: playerCountError } = await supabase.from('classroom_quiz_participants')
        .select('id', { count: 'exact', head: true })
        .eq('session_code', code)
      const { count: answeredPlayers, error: answerCountError } = await supabase.from('classroom_quiz_answers')
        .select('id', { count: 'exact', head: true })
        .eq('session_code', code)
        .eq('question_index', session.question_index)
      if (playerCountError || answerCountError) return respondError(response, 503, 'Жауап беру күйін тексеру мүмкін болмады.')
      const timeExpired = !session.question_ends_at || Date.parse(session.question_ends_at) <= Date.now()
      if (!timeExpired && (answeredPlayers ?? 0) < (totalPlayers ?? 0)) {
        return respondError(response, 409, 'Таймер біткенше немесе бәрі жауап бергенше күтіңіз.')
      }

      const lastQuestion = session.question_index >= (session.question_ids as string[]).length - 1
      const nextEnd = new Date(Date.now() + session.timer_seconds * 1000).toISOString()
      const { data: advanced, error } = await supabase.from('classroom_quiz_sessions')
        .update(lastQuestion
          ? { status: 'finished' }
          : { question_index: session.question_index + 1, question_ends_at: nextEnd })
        .eq('code', code)
        .eq('status', 'running')
        .eq('question_index', session.question_index)
        .select('status')
        .maybeSingle()
      if (error || !advanced) return respondError(response, 409, 'Сұрақты ауыстыру мүмкін болмады. Экранды жаңартыңыз.')
      return response.status(200).json({ status: advanced.status })
    }

    if (payload.action === 'answer') {
      if (isHost) return respondError(response, 403, 'Мұғалім қатысушы ретінде жауап бере алмайды.')
      const questionIndex = payload.questionIndex
      if (session.status !== 'running' || !Number.isInteger(questionIndex) || questionIndex !== session.question_index) {
        return respondError(response, 409, 'Бұл сұраққа жауап қабылданбайды.')
      }
      if (!session.question_ends_at || Date.parse(session.question_ends_at) <= Date.now()) {
        return respondError(response, 409, 'Уақыт аяқталды. Келесі сұрақты күтіңіз.')
      }
      const questionId = (session.question_ids as string[])[session.question_index]
      const question = classroomQuestionsById.get(questionId)
      if (!question || typeof payload.answer !== 'string' || !question.options.includes(payload.answer)) {
        return respondError(response, 400, 'Жауап нұсқасы жарамсыз.')
      }
      const { data: participant, error: participantError } = await supabase.from('classroom_quiz_participants')
        .select('id')
        .eq('session_code', code)
        .eq('token_hash', tokenHash(payload.token))
        .maybeSingle()
      if (participantError || !participant) return respondError(response, 403, 'Қатысушыны тексеру мүмкін болмады.')

      const { data: priorAnswer, error: priorError } = await supabase.from('classroom_quiz_answers')
        .select('id')
        .eq('participant_id', participant.id)
        .eq('question_index', session.question_index)
        .maybeSingle()
      if (priorError) return respondError(response, 503, 'Алдыңғы жауабыңызды тексеру мүмкін болмады.')
      if (priorAnswer) return respondError(response, 409, 'Бұл сұраққа жауабыңыз қабылданған.')

      const isCorrect = payload.answer === question.correctOption
      const remainingRatio = Math.max(0, Date.parse(session.question_ends_at) - Date.now())
        / (session.timer_seconds * 1000)
      const points = isCorrect ? 100 + Math.floor(50 * remainingRatio) : 0
      const { error: answerError } = await supabase.rpc('submit_classroom_quiz_answer', {
        p_session_code: code,
        p_participant_id: participant.id,
        p_question_index: session.question_index,
        p_answer_text: payload.answer,
        p_is_correct: isCorrect,
        p_points: points,
      })
      if (answerError) {
        if (answerError.code === '23505' || answerError.code === 'P0001') {
          return respondError(response, 409, 'Бұл сұраққа жауабыңыз қабылданбады немесе уақыт аяқталды.')
        }
        console.error('Classroom answer insert failed', { code: answerError.code ?? 'UNKNOWN' })
        return respondError(response, 503, 'Жауапты сақтау мүмкін болмады.')
      }
      return response.status(201).json({ accepted: true, points })
    }

    return respondError(response, 400, 'Ойын әрекеті белгісіз.')
  } catch (error) {
    console.error('Classroom API request failed', { name: error instanceof Error ? error.name : 'UNKNOWN' })
    return respondError(response, 503, 'Ойын қызметінде уақытша қате шықты.')
  }
}
