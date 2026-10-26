import OpenAI from 'openai'
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
const rateBuckets = new Map<string, { count: number; resetAt: number }>()

const instructions = `Сен — Қазақстан тарихы бойынша виртуалды оқытушысың. Қазақ жеріндегі ұлт-азаттық көтерілістерді ғылыми тұрғыда түсіндіресің. Қазақ және орыс тілдерінде сауатты жауап бересің. Тарихи даталарды, тұлғаларды, себептерді, оқиғалар барысын, нәтижелер мен салдарды түсіндіресің. Нақты факт пен тарихи интерпретацияны ажыратасың. Сенімді дерек болмаса, оны ашық айтасың. Тарихи деректерді ойдан шығармайсың. Жауаптарың түсінікті, құрылымды және студентке пайдалы болсын. Қажет кезде қысқаша қорытынды мен тексеруге болатын дереккөздерді ұсын. Пайдаланушы қазақша сұраса — қазақша, орысша сұраса — орысша жауап бер.`

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

  const apiKey = process.env.OPENAI_API_KEY
  const model = process.env.OPENAI_MODEL
  if (!apiKey || !model) {
    return respondError(response, 503, 'AI қызметі әлі конфигурацияланбаған.')
  }

  try {
    const openai = new OpenAI({ apiKey, timeout: 25_000, maxRetries: 0 })
    const result = await openai.responses.create({
      model,
      instructions,
      input: chatMessages,
      max_output_tokens: 900,
    })
    const answer = result.output_text.trim()
    if (!answer) return respondError(response, 502, 'AI қызметі бос жауап қайтарды.')
    return response.status(200).json({ answer })
  } catch (error) {
    if (error instanceof OpenAI.APIConnectionTimeoutError) {
      return respondError(response, 504, 'AI қызметінен жауап күту уақыты аяқталды.')
    }
    if (error instanceof OpenAI.APIError && error.status === 429) {
      return respondError(response, 429, 'AI сұрау шегі аяқталды. Кейінірек қайталап көріңіз.')
    }
    console.error('History tutor request failed', error instanceof OpenAI.APIError ? { status: error.status, code: error.code } : { name: error instanceof Error ? error.name : 'UnknownError' })
    return respondError(response, 502, 'AI қызметінен жауап алу мүмкін болмады.')
  }
}
