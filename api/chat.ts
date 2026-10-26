import { ApiError, FinishReason, GoogleGenAI } from '@google/genai'
import type { IncomingMessage, ServerResponse } from 'node:http'

type VercelRequest = IncomingMessage & { body: unknown }
type VercelResponse = ServerResponse & {
  status(statusCode: number): VercelResponse
  json(body: unknown): VercelResponse
}

type ChatMessage = {
  role: 'user' | 'assistant'
  content: string
}

const MAX_BODY_BYTES = 32 * 1024
const MAX_MESSAGES = 20
const MAX_MESSAGE_LENGTH = 4000
const RATE_WINDOW_MS = 10 * 60 * 1000
const RATE_LIMIT = 12
const MAX_OUTPUT_TOKENS = 2048
const GENERATION_BUDGET_MS = 31_000
const MAX_REQUEST_TIMEOUT_MS = 25_000
const RETRY_DELAYS_MS = [300, 700]
const rateBuckets = new Map<string, { count: number; resetAt: number }>()

const instructions = `Сен — Қазақстан тарихынан сабақ беретін виртуалды оқытушысың. Қазақ жеріндегі ұлт-азаттық көтерілістерді ғылыми тұрғыда түсіндір. Қазақ және орыс тілдерінде сауатты жауап бер; әрдайым соңғы пайдаланушы хабарламасының тілін анықтап, сол тілде жауап бер. Әңгіме тілін алдыңғы хабарламаларға қарап өзгертпе: соңғы хабарламадағы тіл басым болсын, ал тіл қысқа не екіұшты болса, алдыңғы диалогтың тілін сақта. «Сәлем», «привет», «ало», «хм», «кімсің?» сияқты қысқа тұрмыстық хабарламаларға сол тілде табиғи әрі қысқа жауап бер; өз мүмкіндіктеріңді ұзақ тізбелеме және бірдей таныстыруды қайталама. Тарихи сұрақтарға даталарды, тұлғаларды, себептерді, оқиғалар барысын, нәтижелер мен салдарды түсінікті әрі құрылымды түсіндір. Нақты факт пен тарихи интерпретацияны ажырат, сенімді дерек болмаса ашық айт, факт ойдан шығарма. Қажет кезде қысқаша қорытынды мен тексеруге болатын дереккөздерді ұсын.`

const isRetryableError = (error: unknown) => {
  if (error instanceof ApiError) {
    return error.status === 408 || error.status === 429 || (error.status >= 500 && error.status <= 599)
  }
  return error instanceof Error
    && ['AbortError', 'TimeoutError', 'TypeError'].includes(error.name)
}

const getSafeErrorCode = (error: unknown) => {
  if (error instanceof ApiError) {
    if (error.status === 401) return 'INVALID_CREDENTIALS'
    if (error.status === 403) return 'PERMISSION_DENIED'
    if (error.status === 404) return 'MODEL_NOT_FOUND'
    if (error.status === 408) return 'UPSTREAM_TIMEOUT'
    if (error.status === 429) return 'RATE_LIMITED'
    if (error.status >= 500) return 'UPSTREAM_ERROR'
    return 'API_ERROR'
  }
  if (error instanceof Error && ['AbortError', 'TimeoutError'].includes(error.name)) return 'TIMEOUT'
  if (error instanceof Error && error.name === 'TypeError') return 'NETWORK_ERROR'
  return 'UNKNOWN_ERROR'
}

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

const isChatMessage = (value: unknown): value is ChatMessage => (
  typeof value === 'object'
  && value !== null
  && 'role' in value
  && (value.role === 'user' || value.role === 'assistant')
  && 'content' in value
  && typeof value.content === 'string'
  && value.content.trim().length > 0
  && value.content.length <= MAX_MESSAGE_LENGTH
)

const allowRequestOrigin = (request: VercelRequest, response: VercelResponse) => {
  const requestOrigin = request.headers.origin
  const configuredOrigins = (process.env.ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean)

  if (typeof requestOrigin !== 'string') return true
  if (configuredOrigins.includes(requestOrigin)) {
    response.setHeader('Access-Control-Allow-Origin', requestOrigin)
    return true
  }
  return false
}

const isRateLimited = (request: VercelRequest) => {
  const forwardedFor = request.headers['x-forwarded-for']
  const clientIp = typeof forwardedFor === 'string'
    ? forwardedFor.split(',').pop()?.trim() || 'unknown'
    : 'unknown'
  const now = Date.now()

  for (const [key, bucket] of rateBuckets) {
    if (bucket.resetAt <= now) rateBuckets.delete(key)
  }

  const bucket = rateBuckets.get(clientIp)
  if (!bucket || bucket.resetAt <= now) {
    rateBuckets.set(clientIp, { count: 1, resetAt: now + RATE_WINDOW_MS })
    return false
  }
  if (bucket.count >= RATE_LIMIT) return true

  bucket.count += 1
  return false
}

export default async function handler(request: VercelRequest, response: VercelResponse) {
  setSecurityHeaders(response)
  response.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  response.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (!allowRequestOrigin(request, response)) {
    return respondError(response, 403, 'Бұл сайттан сұрау жіберуге рұқсат жоқ.')
  }

  if (request.method === 'OPTIONS') return response.status(204).end()
  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST, OPTIONS')
    return respondError(response, 405, 'Бұл сұрау әдісіне рұқсат жоқ.')
  }

  const contentLength = Number(request.headers['content-length'] ?? 0)
  if (contentLength > MAX_BODY_BYTES) {
    return respondError(response, 413, 'Сұрау көлемі шектен асып кетті.')
  }

  let body: unknown = request.body
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body) as unknown
    } catch {
      return respondError(response, 400, 'Сұрау JSON пішімінде болуы керек.')
    }
  }

  if (!body || typeof body !== 'object' || !('messages' in body) || !Array.isArray(body.messages)) {
    return respondError(response, 400, 'Хабарламалар тізімі берілмеген немесе дұрыс емес.')
  }
  if (Buffer.byteLength(JSON.stringify(body), 'utf8') > MAX_BODY_BYTES) {
    return respondError(response, 413, 'Сұрау көлемі шектен асып кетті.')
  }

  const messages: unknown[] = body.messages
  const chatMessages = messages.filter(isChatMessage)
  if (messages.length === 0 || messages.length > MAX_MESSAGES || chatMessages.length !== messages.length) {
    return respondError(response, 400, 'Хабарламалар саны немесе мазмұны рұқсат етілген шектен тыс.')
  }
  if (chatMessages[chatMessages.length - 1]?.role !== 'user') {
    return respondError(response, 400, 'Әңгіме соңғы пайдаланушы хабарламасымен аяқталуы керек.')
  }

  if (isRateLimited(request)) {
    response.setHeader('Retry-After', String(RATE_WINDOW_MS / 1000))
    return respondError(response, 429, 'Сұрау шегіне жеттіңіз. Кейінірек қайталап көріңіз.')
  }

  const apiKey = process.env.GEMINI_API_KEY
  const model = process.env.GEMINI_MODEL || 'gemini-3.1-flash-lite'
  if (!apiKey) {
    return respondError(response, 503, 'AI қызметі әлі конфигурацияланбаған.')
  }

  try {
    const gemini = new GoogleGenAI({
      apiKey,
      httpOptions: {
        retryOptions: { attempts: 1 },
      },
    })
    const contents = chatMessages.map((message) => ({
      role: message.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: message.content }],
    }))
    const deadline = Date.now() + GENERATION_BUDGET_MS
    let result

    for (let attempt = 0; ; attempt += 1) {
      const remainingMs = deadline - Date.now()
      const timeout = Math.min(MAX_REQUEST_TIMEOUT_MS, remainingMs - 1_000)
      if (timeout <= 0) {
        const timeoutError = new Error('Gemini request time budget exhausted')
        timeoutError.name = 'TimeoutError'
        throw timeoutError
      }

      try {
        result = await gemini.models.generateContent({
          model,
          contents,
          config: {
            systemInstruction: instructions,
            maxOutputTokens: MAX_OUTPUT_TOKENS,
            httpOptions: {
              timeout,
              retryOptions: { attempts: 1 },
            },
          },
        })
        break
      } catch (error) {
        const delay = RETRY_DELAYS_MS[attempt]
        if (!isRetryableError(error) || delay === undefined || Date.now() + delay + 1_000 >= deadline) {
          throw error
        }
        await new Promise((resolve) => setTimeout(resolve, delay))
      }
    }

    const answer = result.text?.trim()
    if (!answer) return respondError(response, 502, 'AI қызметі бос жауап қайтарды.')
    if (result.candidates?.[0]?.finishReason === FinishReason.MAX_TOKENS) {
      console.warn('History tutor response reached output token limit', {
        code: 'MAX_OUTPUT_TOKENS_REACHED',
        finishReason: FinishReason.MAX_TOKENS,
      })
    }
    return response.status(200).json({ answer })
  } catch (error) {
    console.error('History tutor Gemini request failed', {
      code: getSafeErrorCode(error),
      status: error instanceof ApiError ? error.status : null,
    })
    if (error instanceof ApiError) {
      if (error.status === 400 && /api[\s_-]*key.*(?:invalid|not valid)|(?:invalid|not valid).*api[\s_-]*key/i.test(error.message)) {
        return respondError(response, 503, 'Gemini API кілті жарамсыз. Vercel-дегі GEMINI_API_KEY параметрін тексеріңіз.')
      }
      if (error.status === 401) {
        return respondError(response, 503, 'Gemini API кілті жарамсыз немесе мерзімі өткен. Vercel-дегі GEMINI_API_KEY параметрін тексеріңіз.')
      }
      if (error.status === 403) {
        return respondError(response, 503, 'Gemini API бұл жобаға рұқсат бермеді. API баптауын және қолжетімділікті тексеріңіз.')
      }
      if (error.status === 404) {
        return respondError(response, 503, 'Көрсетілген Gemini моделі табылмады. GEMINI_MODEL мәнін тексеріңіз.')
      }
      if (error.status === 429) {
        return respondError(response, 429, 'Gemini сұрау немесе тегін квота шегіне жетті. AI Studio квотасын тексеріп, кейінірек қайталап көріңіз.')
      }
      if (error.status === 408 || error.status === 504) {
        return respondError(response, 504, 'Gemini API жауабын күту уақыты аяқталды. Қысқалау сұрақпен қайталап көріңіз.')
      }
      if (error.status >= 500) {
        return respondError(response, 502, 'Gemini API уақытша қолжетімсіз. Кейінірек қайталап көріңіз.')
      }
      return respondError(response, 502, 'Gemini сұрауын орындау мүмкін болмады. Сұрақты тексеріп, қайталап көріңіз.')
    }
    if (error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError')) {
      return respondError(response, 504, 'AI қызметінен жауап күту уақыты аяқталды.')
    }
    return respondError(response, 502, 'AI қызметінен жауап алу мүмкін болмады.')
  }
}
