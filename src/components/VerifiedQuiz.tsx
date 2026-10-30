import { useEffect, useState } from 'react'
import { ArrowRight, CheckCircle2, LoaderCircle, LockKeyhole } from 'lucide-react'
import { useAuth } from './useAuth'
import { supabase } from '../lib/supabase'

type QuizQuestion = {
  assessment_id: string
  assessment_slug: string
  assessment_title: string
  question_id: string
  position: number
  prompt: string
  choices: string[]
}
type QuizResult = {
  attempt_id: string
  score: number
  max_score: number
  correct_count: number
  question_count: number
  duplicate: boolean
}
type DashboardAttempt = QuizResult & {
  id: string
  assessment_slug: string
}
type Props = { onCompleted: (result: QuizResult) => void }

const slug = 'kazakh-history-basics'

function shuffle<T>(items: T[]) {
  const values = [...items]
  for (let i = values.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[values[i], values[j]] = [values[j], values[i]]
  }
  return values
}

export default function VerifiedQuiz({ onCompleted }: Props) {
  const { session } = useAuth()
  const [questions, setQuestions] = useState<QuizQuestion[]>([])
  const [index, setIndex] = useState(0)
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [attemptId] = useState(() => crypto.randomUUID())
  const [result, setResult] = useState<QuizResult | null>(null)
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)

  useEffect(() => {
    let active = true
    const loadQuestions = async () => {
      if (!session) return
      if (!supabase) {
        setError('Supabase ортасының айнымалылары бапталмаған.')
        setIsLoading(false)
        return
      }
      const { data, error: requestError } = await supabase.rpc('list_assessment_questions', { p_slug: slug })
      if (!active) return
      if (requestError) setError('Тест сұрақтарын жүктеу мүмкін болмады. Supabase миграциясын қолданыңыз.')
      else {
        const loadedQuestions = ((data ?? []) as QuizQuestion[]).map((question) => ({
          ...question,
          choices: shuffle(question.choices),
        }))
        setQuestions(loadedQuestions)
        const { data: dashboard, error: dashboardError } = await supabase.rpc('get_my_dashboard')
        if (!active) return
        if (dashboardError) {
          setError('Тест аяқталғанын тексеру мүмкін болмады. Жеке кабинет қызметін тексеріңіз.')
        } else {
          const attempts = (dashboard as { attempts: DashboardAttempt[] }).attempts ?? []
          const previousAttempt = attempts.find((item) => item.assessment_slug === slug)
          if (previousAttempt) {
            const savedResult: QuizResult = {
              attempt_id: previousAttempt.id,
              score: previousAttempt.score,
              max_score: previousAttempt.max_score,
              correct_count: previousAttempt.correct_count,
              question_count: previousAttempt.question_count,
              duplicate: true,
            }
            setResult(savedResult)
          }
        }
      }
      setIsLoading(false)
    }
    void loadQuestions()
    return () => { active = false }
  }, [session])

  const current = questions[index]
  const choices = current?.choices ?? []

  const finishQuiz = async () => {
    if (!supabase || !current || !session || Object.keys(answers).length !== questions.length) return
    setIsSubmitting(true)
    setError('')
    const payload = questions.map((question) => ({
      question_id: question.question_id,
      answer: answers[question.question_id],
    }))
    const { data, error: requestError } = await supabase.rpc('submit_assessment', {
      p_slug: slug,
      p_client_attempt_id: attemptId,
      p_answers: payload,
    })
    if (requestError) {
      setError('Жауаптарды тексеру және сақтау мүмкін болмады. Қайта кіріп, қайталап көріңіз.')
    } else {
      const verified = data as QuizResult
      setResult(verified)
      onCompleted(verified)
    }
    setIsSubmitting(false)
  }

  if (!session) return <div className="quiz-gate"><LockKeyhole size={22} /><h3>Ұпай жинау үшін аккаунтқа кіріңіз</h3><p>Жауаптар тек серверде тексеріледі; нәтиже сіздің профиліңізге жазылады.</p></div>
  if (isLoading) return <div className="quiz-gate"><LoaderCircle className="account-spinner" size={20} />Сұрақтар жүктелуде…</div>
  if (error && questions.length === 0) return <div className="account-message" role="alert">{error}</div>
  if (!questions.length) return <div className="account-message" role="alert">Бұл тест әзірге қолжетімсіз.</div>

  if (result) return (
    <div className="quiz-result">
      <CheckCircle2 size={28} />
      <p className="account-kicker">СЕРВЕР ТЕКСЕРГЕН НӘТИЖЕ</p>
      <h3>{result.score} / {result.max_score} ұпай</h3>
      <p>Дұрыс жауап: {result.correct_count} / {result.question_count}</p>
      {result.duplicate
        ? <p>Бұл тест бұрын аяқталған. Бір тестке бір әрекет есептеледі, ұпай қайта берілмейді.</p>
        : <p>Нәтиже профиліңізге сақталды. Бір тестке бір әрекет беріледі.</p>}
    </div>
  )

  return (
    <div className="verified-quiz">
      <div className="quiz-progress-line"><span>{current.assessment_title}</span><strong>{index + 1} / {questions.length}</strong></div>
      <div className="quiz-progress-track"><span style={{ width: `${((index + 1) / questions.length) * 100}%` }} /></div>
      <h3>{current.prompt}</h3>
      <div className="quiz-choices">
        {choices.map((choice) => <button type="button" key={choice} className={answers[current.question_id] === choice ? 'quiz-choice is-selected' : 'quiz-choice'} onClick={() => setAnswers((previous) => ({ ...previous, [current.question_id]: choice }))} aria-pressed={answers[current.question_id] === choice}>{choice}</button>)}
      </div>
      {error && <p className="account-message" role="alert">{error}</p>}
      <div className="quiz-controls">
        <button type="button" className="account-secondary" disabled={index === 0 || isSubmitting} onClick={() => setIndex((previous) => previous - 1)}>Артқа</button>
        {index < questions.length - 1
          ? <button type="button" className="account-primary" disabled={!answers[current.question_id] || isSubmitting} onClick={() => setIndex((previous) => previous + 1)}>Келесі <ArrowRight size={16} /></button>
          : <button type="button" className="account-primary" disabled={Object.keys(answers).length !== questions.length || isSubmitting} onClick={() => void finishQuiz()}>{isSubmitting ? 'Сервер тексеріп жатыр…' : 'Тапсырып, нәтижені сақтау'} <ArrowRight size={16} /></button>}
      </div>
    </div>
  )
}
