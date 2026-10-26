import { useEffect, useRef, useState, type Dispatch, type FormEvent, type KeyboardEvent, type SetStateAction } from 'react'
import { AlertCircle, LoaderCircle, Send, Trash2 } from 'lucide-react'

export type ChatMessage = {
  role: 'user' | 'assistant'
  content: string
}

type HistoryTutorProps = {
  messages: ChatMessage[]
  setMessages: Dispatch<SetStateAction<ChatMessage[]>>
}

const exampleQuestions = [
  'Кенесары Қасымұлы көтерілісінің негізгі себептері қандай?',
  'Көтеріліс неліктен жеңілді?',
  'Ресей империясының отарлау саясаты қазақ халқына қалай әсер етті?',
  'Кенесары мен Сырым Датұлы көтерілістерінің айырмашылығы неде?',
  '1916 жылғы көтерілістің тарихи маңызы қандай?',
]

const renderInline = (text: string) => text.split(/(\*\*[^*]+\*\*)/g).map((part, index) => (
  part.startsWith('**') && part.endsWith('**')
    ? <strong key={index}>{part.slice(2, -2)}</strong>
    : part
))

function FormattedAnswer({ content }: { content: string }) {
  const blocks = content.trim().split(/\n\s*\n/)

  return (
    <div className="history-tutor-answer">
      {blocks.map((block, index) => {
        const lines = block.split('\n').map((line) => line.trim()).filter(Boolean)
        const isList = lines.every((line) => /^([-*]|\d+\.)\s/.test(line))

        if (isList) {
          return (
            <ul key={index}>
              {lines.map((line, lineIndex) => <li key={lineIndex}>{renderInline(line.replace(/^([-*]|\d+\.)\s/, ''))}</li>)}
            </ul>
          )
        }

        return <p key={index}>{lines.map((line, lineIndex) => <span key={lineIndex}>{lineIndex > 0 && <br />}{renderInline(line.replace(/^#{1,3}\s/, ''))}</span>)}</p>
      })}
    </div>
  )
}

function getErrorMessage(status: number) {
  if (status === 400) return 'Сұрау пішімі дұрыс емес. Сұрақты қысқартып, қайта жіберіңіз.'
  if (status === 403) return 'Бұл сайттың API қолдануына рұқсат берілмеген. Backend origin баптауын тексеріңіз.'
  if (status === 413) return 'Хабарлама көлемі тым үлкен. Қысқалау сұрақ қойып көріңіз.'
  if (status === 429) return 'Сұрау шегі уақытша аяқталды. Біраздан кейін қайталап көріңіз.'
  if (status === 503) return 'Gemini қызметінің кілті, моделі немесе жобаға қолжетімділігі бапталмаған. Vercel және Google AI Studio параметрлерін тексеріңіз.'
  if (status === 504) return 'AI жауабы тым ұзақ күтілді. Қысқалау сұрақпен қайта көріңіз.'
  return 'Жауап алу мүмкін болмады. Интернетті тексеріп, кейінірек қайталап көріңіз.'
}

export default function HistoryTutor({ messages, setMessages }: HistoryTutorProps) {
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)
  const busyRef = useRef(false)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [messages, isLoading, error])

  const sendMessage = async (event?: FormEvent) => {
    event?.preventDefault()
    const question = input.trim()
    if (!question || busyRef.current) return

    busyRef.current = true
    setIsLoading(true)
    setError('')
    setInput('')
    const userMessage: ChatMessage = { role: 'user', content: question }
    const conversation = [...messages, userMessage]
    setMessages(conversation)

    try {
      const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/+$/, '')
      const response = await fetch(`${apiBaseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: conversation.slice(-19) }),
        signal: AbortSignal.timeout(40_000),
      })

      if (!response.ok) {
        setError(getErrorMessage(response.status))
        return
      }

      const data: unknown = await response.json()
      const answer = data && typeof data === 'object' && 'answer' in data ? data.answer : null
      if (typeof answer !== 'string' || !answer.trim()) {
        setError('AI қызметінен жарамды жауап келмеді. Кейінірек қайталап көріңіз.')
        return
      }

      setMessages((previous) => [...previous, { role: 'assistant', content: answer.trim() }])
    } catch {
      setError('Серверге қосылу мүмкін болмады. Backend адресі мен интернет байланысын тексеріңіз.')
    } finally {
      busyRef.current = false
      setIsLoading(false)
    }
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      void sendMessage()
    }
  }

  const clearChat = () => {
    if (busyRef.current) return
    setMessages([])
    setError('')
    setInput('')
  }

  const setExampleQuestion = (question: string) => {
    setInput(question)
    setError('')
  }

  return (
    <div className="history-tutor">
      <div className="history-tutor-heading">
        <div>
          <p className="text-xs uppercase tracking-[0.25em] text-slate-400">AI ТАРИХШЫ · ВИРТУАЛДЫ ОҚЫТУШЫ</p>
          <h2 className="mt-2 text-3xl font-bold text-white">Тарих туралы сұраңыз</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300">Қазақ немесе орыс тілінде сұрақ қойыңыз — жауап сол тілде беріледі. Тарихи түсіндірулерді сенімді дереккөздермен салыстырып тексеріңіз.</p>
        </div>
        <button type="button" onClick={clearChat} disabled={isLoading || messages.length === 0} className="history-tutor-clear" aria-label="Чатты тазалау">
          <Trash2 size={16} /> <span>Чатты тазалау</span>
        </button>
      </div>

      <div className="history-tutor-thread" aria-live="polite" aria-busy={isLoading}>
        {messages.length === 0 ? (
          <div className="history-tutor-empty">
            <span className="history-tutor-empty-mark">АЗ</span>
            <p className="text-lg font-semibold text-white">Әңгімеңізді бастаңыз</p>
            <p className="mt-1 text-sm text-slate-400">Төмендегі сұрақтардың бірін таңдаңыз немесе өз сұрағыңызды жазыңыз.</p>
            <div className="history-tutor-examples">
              {exampleQuestions.map((question) => <button type="button" key={question} onClick={() => setExampleQuestion(question)}>{question}</button>)}
            </div>
          </div>
        ) : messages.map((message, index) => (
          <article className={`history-tutor-message ${message.role === 'user' ? 'history-tutor-message-user' : 'history-tutor-message-assistant'}`} key={`${index}-${message.role}`}>
            <span className="history-tutor-message-label">{message.role === 'user' ? 'СІЗ' : 'AI ТАРИХШЫ'}</span>
            <div className="history-tutor-message-content">
              {message.role === 'assistant' ? <FormattedAnswer content={message.content} /> : <p>{message.content}</p>}
            </div>
          </article>
        ))}
        {isLoading && <div className="history-tutor-loading"><LoaderCircle size={17} className="history-tutor-spinner" /><span>Тарихшы жауап дайындап жатыр…</span></div>}
        {error && <div className="history-tutor-error" role="alert"><AlertCircle size={17} /><span>{error}</span></div>}
        <div ref={bottomRef} />
      </div>

      {messages.length > 0 && messages.length < 3 && !isLoading && !error && (
        <div className="history-tutor-followups" aria-label="Мысал сұрақтар">
          {exampleQuestions.slice(0, 3).map((question) => <button type="button" key={question} onClick={() => setExampleQuestion(question)}>{question}</button>)}
        </div>
      )}

      <form className="history-tutor-form" onSubmit={(event) => void sendMessage(event)}>
        <label className="sr-only" htmlFor="history-tutor-input">Тарих туралы сұрағыңыз</label>
        <textarea id="history-tutor-input" value={input} onChange={(event) => setInput(event.target.value.slice(0, 2000))} onKeyDown={handleKeyDown} maxLength={2000} rows={2} placeholder="Сұрағыңызды жазыңыз… (Enter — жіберу, Shift+Enter — жаңа жол)" disabled={isLoading} />
        <button type="submit" disabled={isLoading || !input.trim()} aria-label="Хабарламаны жіберу"><Send size={18} /><span>{isLoading ? 'Жіберілуде…' : 'Жіберу'}</span></button>
        <span className="history-tutor-counter">{input.length}/2000</span>
      </form>
    </div>
  )
}
