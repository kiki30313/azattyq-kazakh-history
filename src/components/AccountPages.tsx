import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { ArrowRight, LogOut, Search, ShieldCheck, UserRound, Users } from 'lucide-react'
import { useAuth } from './useAuth'
import { supabase, supabaseConfigured } from '../lib/supabase'
import { surveyApiUrl } from '../lib/surveyApi'
import { surveyQuestions, type SurveyAnswer } from '../../shared/survey'

type AuthMode = 'login' | 'register' | 'forgot' | 'reset'
type StudentRow = {
  id: string
  display_name: string
  email: string
  role: 'student' | 'admin'
  total_points: number
  attempt_count: number
  average_percent: number
}
type AttemptRow = {
  id: string
  assessment_title: string
  score: number
  max_score: number
  correct_count: number
  question_count: number
  created_at: string
}
type AdjustmentRow = {
  id: string
  delta: number
  reason: string
  comment: string | null
  created_at: string
  actor_name: string
}
type DashboardData = {
  profile: { display_name: string; email: string; role: string }
  total_points: number
  attempts: AttemptRow[]
}
type AdminDetail = {
  profile: StudentRow
  attempts: AttemptRow[]
  adjustments: AdjustmentRow[]
}
type SurveySubmission = {
  id: string
  respondent_name: string
  answers: Record<string, SurveyAnswer>
  created_at: string
}
type AdminSurveyResponses = {
  responses: SurveySubmission[]
  totalCount: number
  hasMore: boolean
}

async function fetchAdminSurveyResponses(accessToken: string, offset: number): Promise<AdminSurveyResponses> {
  const response = await fetch(`${surveyApiUrl}?view=responses&offset=${offset}`, {
    headers: { Accept: 'application/json', Authorization: `Bearer ${accessToken}` },
  })
  const data = await response.json() as AdminSurveyResponses & { error?: string }
  if (!response.ok) throw new Error(data.error || 'Сауалнама жауаптарын жүктеу мүмкін болмады.')
  return data
}

const cardClass = 'account-card'
const controlClass = 'account-control'

function AccountMessage({ children }: { children: string }) {
  return <p className="account-message" role="alert">{children}</p>
}

function getAuthError(message: string) {
  if (/invalid login credentials/i.test(message)) return 'Email немесе құпиясөз дұрыс емес.'
  if (/user already registered/i.test(message)) return 'Бұл email бойынша аккаунт бұрыннан бар.'
  if (/password should be at least/i.test(message)) return 'Құпиясөз кемінде 8 таңбадан тұруы керек.'
  if (/email not confirmed/i.test(message)) return 'Алдымен email-ді растаңыз.'
  return 'Сұрауды орындау мүмкін болмады. Email мен құпиясөзді тексеріп, қайталап көріңіз.'
}

export function AuthPage({ initialMode = 'login', onNavigate }: { initialMode?: AuthMode; onNavigate: (page: 'home' | 'profile') => void }) {
  const [mode, setMode] = useState<AuthMode>(initialMode)
  const [displayName, setDisplayName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const { session } = useAuth()

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!supabase) return
    setIsSubmitting(true)
    setError('')
    setMessage('')

    try {
      if (mode === 'register') {
        const { error: requestError } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            data: { display_name: displayName.trim() },
            emailRedirectTo: `${window.location.origin}${window.location.pathname}#login`,
          },
        })
        if (requestError) throw requestError
        setMessage('Тіркелу сәтті. Email-ге келген сілтеме арқылы аккаунтты растаңыз.')
      } else if (mode === 'login') {
        const { error: requestError } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
        if (requestError) throw requestError
        onNavigate('profile')
      } else if (mode === 'forgot') {
        const { error: requestError } = await supabase.auth.resetPasswordForEmail(email.trim(), {
          redirectTo: `${window.location.origin}${window.location.pathname}#reset-password`,
        })
        if (requestError) throw requestError
        setMessage('Егер осы email аккаунтқа тіркелген болса, қалпына келтіру сілтемесі жіберілді.')
      } else {
        const { error: requestError } = await supabase.auth.updateUser({ password })
        if (requestError) throw requestError
        setMessage('Құпиясөз жаңартылды. Жеке кабинетке өтуге болады.')
      }
    } catch (requestError) {
      setError(getAuthError(requestError instanceof Error ? requestError.message : 'unknown'))
    } finally {
      setIsSubmitting(false)
    }
  }

  if (!supabaseConfigured) {
    return <section className={cardClass}><h1>Аккаунтты баптау қажет</h1><p>Supabase қосылымы жоқ. Vercel/жергілікті ортада `VITE_SUPABASE_URL` және `VITE_SUPABASE_PUBLISHABLE_KEY` параметрлерін орнатыңыз.</p></section>
  }

  if (session && mode !== 'reset') {
    return <section className={cardClass}><h1>Аккаунтқа кірдіңіз</h1><p>Жеке кабинетіңізді ашыңыз.</p><button className="account-primary" onClick={() => onNavigate('profile')} type="button">Жеке кабинет <ArrowRight size={16} /></button></section>
  }

  const title = mode === 'register' ? 'Студент ретінде тіркелу' : mode === 'forgot' ? 'Құпиясөзді қалпына келтіру' : mode === 'reset' ? 'Жаңа құпиясөз' : 'Аккаунтқа кіру'
  return (
    <section className={cardClass}>
      <p className="account-kicker">AI ТАРИХШЫ · ЖЕКЕ КАБИНЕТ</p>
      <h1>{title}</h1>
      <p className="account-intro">Тіркелгіңізді Supabase қорғайды. Әкімші рөлін бұл беттен тағайындау мүмкін емес.</p>
      {error && <AccountMessage>{error}</AccountMessage>}
      {message && <p className="account-success" role="status">{message}</p>}
      <form className="account-form" onSubmit={(event) => void submit(event)}>
        {mode === 'register' && <label>Аты-жөні<input className={controlClass} value={displayName} onChange={(event) => setDisplayName(event.target.value)} required minLength={2} maxLength={100} autoComplete="name" /></label>}
        {mode !== 'reset' && <label>Email<input className={controlClass} type="email" value={email} onChange={(event) => setEmail(event.target.value)} required maxLength={254} autoComplete="email" /></label>}
        {(mode === 'login' || mode === 'register' || mode === 'reset') && <label>Құпиясөз<input className={controlClass} type="password" value={password} onChange={(event) => setPassword(event.target.value)} required minLength={8} maxLength={128} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} /></label>}
        <button className="account-primary" type="submit" disabled={isSubmitting}>{isSubmitting ? 'Өңделуде…' : mode === 'register' ? 'Тіркелу' : mode === 'forgot' ? 'Сілтеме жіберу' : mode === 'reset' ? 'Құпиясөзді сақтау' : 'Кіру'} <ArrowRight size={16} /></button>
      </form>
      <div className="account-links">
        {mode === 'login' && <><button type="button" onClick={() => { setMode('register'); setError(''); setMessage('') }}>Тіркелу</button><button type="button" onClick={() => { setMode('forgot'); setError(''); setMessage('') }}>Құпиясөзді ұмыттыңыз ба?</button></>}
        {mode !== 'login' && mode !== 'reset' && <button type="button" onClick={() => { setMode('login'); setError(''); setMessage('') }}>Кіру бетіне қайту</button>}
      </div>
    </section>
  )
}

export function StudentDashboard({ onNavigate }: { onNavigate: (page: 'games' | 'home') => void }) {
  const { session, profile } = useAuth()
  const [dashboard, setDashboard] = useState<DashboardData | null>(null)
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    let active = true
    const load = async () => {
      if (!supabase || !session) return
      const { data, error: requestError } = await supabase.rpc('get_my_dashboard')
      if (!active) return
      if (requestError) setError('Нәтижелерді жүктеу мүмкін болмады. Supabase SQL миграциясын тексеріңіз.')
      else setDashboard(data as DashboardData)
      setIsLoading(false)
    }
    void load()
    return () => { active = false }
  }, [session])

  const signOut = async () => {
    if (!supabase) return
    const { error: signOutError } = await supabase.auth.signOut()
    if (signOutError) setError('Аккаунттан шығу мүмкін болмады.')
    else onNavigate('home')
  }

  if (!session) return <section className={cardClass}><h1>Кіру қажет</h1><p>Жеке нәтижелерді көру үшін аккаунтқа кіріңіз.</p><button type="button" className="account-primary" onClick={() => onNavigate('home')}>Басты бетке қайту</button></section>
  if (isLoading) return <section className={cardClass}><p>Профиль жүктелуде…</p></section>

  const attempts = dashboard?.attempts ?? []
  const average = attempts.length ? Math.round(attempts.reduce((sum, row) => sum + (row.question_count ? row.correct_count / row.question_count : 0), 0) * 100 / attempts.length) : 0
  return (
    <section className={cardClass}>
      <div className="account-heading"><div><p className="account-kicker">СТУДЕНТ ПРОФИЛІ</p><h1>{dashboard?.profile.display_name || profile?.display_name || 'Студент'}</h1><p>{dashboard?.profile.email || session.user.email}</p></div><button type="button" className="account-secondary" onClick={() => void signOut()}><LogOut size={16} /> Шығу</button></div>
      {error && <AccountMessage>{error}</AccountMessage>}
      <div className="account-stat-grid">
        <article><span>Жалпы ұпай</span><strong>{dashboard?.total_points ?? 0}</strong></article>
        <article><span>Тест әрекеті</span><strong>{attempts.length}</strong></article>
        <article><span>Орташа нәтиже</span><strong>{average}%</strong></article>
      </div>
      <div className="account-section-heading"><h2>Тест тапсыру тарихы</h2><button type="button" className="account-text-link" onClick={() => onNavigate('games')}>Сауалнама мен тест бөліміне өту <ArrowRight size={15} /></button></div>
      {attempts.length === 0 ? <p className="account-empty">Әзірге аяқталған тест жоқ. Тарихи викторинаны бастап, алғашқы нәтижені сақтаңыз.</p> : (
        <div className="account-table-wrap"><table className="account-table"><thead><tr><th>Тест</th><th>Күні</th><th>Ұпай</th><th>Дұрыс</th></tr></thead><tbody>{attempts.map((attempt) => <tr key={attempt.id}><td>{attempt.assessment_title}</td><td>{new Date(attempt.created_at).toLocaleDateString('kk-KZ')}</td><td>{attempt.score}/{attempt.max_score}</td><td>{attempt.question_count ? Math.round(attempt.correct_count / attempt.question_count * 100) : 0}%</td></tr>)}</tbody></table></div>
      )}
    </section>
  )
}

export function AdminDashboard() {
  const { session } = useAuth()
  const [search, setSearch] = useState('')
  const [students, setStudents] = useState<StudentRow[]>([])
  const [surveyResponses, setSurveyResponses] = useState<SurveySubmission[]>([])
  const [surveyResponseCount, setSurveyResponseCount] = useState(0)
  const [hasMoreSurveyResponses, setHasMoreSurveyResponses] = useState(false)
  const [isLoadingSurveyResponses, setIsLoadingSurveyResponses] = useState(true)
  const [surveyResponseError, setSurveyResponseError] = useState('')
  const [selected, setSelected] = useState<AdminDetail | null>(null)
  const [reason, setReason] = useState('')
  const [comment, setComment] = useState('')
  const [delta, setDelta] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [isAdjusting, setIsAdjusting] = useState(false)

  const loadStudents = useCallback(async (searchTerm: string) => {
    if (!supabase || !session) return
    setIsLoading(true)
    setError('')
    const { data, error: requestError } = await supabase.rpc('admin_search_students', { p_search: searchTerm.trim() || null })
    if (requestError) setError('Студенттерді жүктеу мүмкін болмады. Әкімші құқығын және RLS саясатын тексеріңіз.')
    else setStudents((data ?? []) as StudentRow[])
    setIsLoading(false)
  }, [session])

  const searchStudents = (event?: FormEvent) => {
    event?.preventDefault()
    void loadStudents(search)
  }

  useEffect(() => {
    if (!supabase || !session) return
    const client = supabase
    let active = true
    const loadInitialStudents = async () => {
      const { data, error: requestError } = await client.rpc('admin_search_students', { p_search: null })
      if (!active) return
      if (requestError) setError('Студенттерді жүктеу мүмкін болмады. Әкімші құқығын және RLS саясатын тексеріңіз.')
      else setStudents((data ?? []) as StudentRow[])
      setIsLoading(false)
    }
    void loadInitialStudents()
    return () => { active = false }
  }, [session])

  useEffect(() => {
    if (!session) return
    let active = true
    void fetchAdminSurveyResponses(session.access_token, 0)
      .then((data) => {
        if (!active) return
        setSurveyResponses(data.responses)
        setSurveyResponseCount(data.totalCount)
        setHasMoreSurveyResponses(data.hasMore)
        setSurveyResponseError('')
      })
      .catch((requestError: unknown) => {
        if (active) {
          setSurveyResponseError(requestError instanceof Error
            ? requestError.message
            : 'Сауалнама жауаптарын жүктеу мүмкін болмады.')
        }
      })
      .finally(() => {
        if (active) setIsLoadingSurveyResponses(false)
      })
    return () => { active = false }
  }, [session])

  const loadMoreSurveyResponses = async () => {
    if (!session || isLoadingSurveyResponses) return
    setIsLoadingSurveyResponses(true)
    setSurveyResponseError('')
    try {
      const data = await fetchAdminSurveyResponses(session.access_token, surveyResponses.length)
      setSurveyResponses((previous) => [...previous, ...data.responses])
      setSurveyResponseCount(data.totalCount)
      setHasMoreSurveyResponses(data.hasMore)
    } catch (requestError) {
      setSurveyResponseError(requestError instanceof Error
        ? requestError.message
        : 'Сауалнама жауаптарын жүктеу мүмкін болмады.')
    } finally {
      setIsLoadingSurveyResponses(false)
    }
  }

  const loadStudent = async (studentId: string) => {
    if (!supabase) return
    setError('')
    const { data, error: requestError } = await supabase.rpc('admin_student_detail', { p_user_id: studentId })
    if (requestError) {
      setError('Студент деректерін жүктеу мүмкін болмады.')
      return
    }
    setSelected(data as AdminDetail)
    setDelta('')
    setReason('')
    setComment('')
    setNotice('')
  }

  const adjustPoints = async (event: FormEvent) => {
    event.preventDefault()
    if (!supabase || !selected || isAdjusting) return
    const amount = Number(delta)
    if (!Number.isInteger(amount) || amount === 0 || !reason.trim()) {
      setError('Нөлден өзге бүтін ұпай мен түзету себебін енгізіңіз.')
      return
    }
    setError('')
    setNotice('')
    setIsAdjusting(true)
    try {
      const { error: requestError } = await supabase.rpc('admin_adjust_points', {
        p_user_id: selected.profile.id,
        p_delta: amount,
        p_reason: reason.trim(),
        p_comment: comment.trim() || null,
      })
      if (requestError) {
        setError('Ұпайды түзету мүмкін болмады. Әкімші құқығын және енгізілген мәндерді тексеріңіз.')
        return
      }
      setNotice('Ұпай түзетуі журналға тіркелді.')
      await loadStudent(selected.profile.id)
      await loadStudents(search)
    } catch {
      setError('Ұпай түзету сұрауын орындау мүмкін болмады. Әрекеттің журналға жазылғанын тексеріңіз.')
    } finally {
      setIsAdjusting(false)
    }
  }

  if (!session) return <section className={cardClass}><h1>Әкімшіге кіру қажет</h1><p>Әкімші рөлін сервер мен Supabase RLS тексереді.</p></section>

  return (
    <section className={cardClass}>
      <p className="account-kicker"><ShieldCheck size={14} /> ҚОРҒАЛҒАН ӘКІМШІ БӨЛІМ</p>
      <div className="account-heading"><div><h1>Студенттер</h1><p>Рөл және балл операциялары дерекқорда тексеріледі.</p></div><strong className="account-count"><Users size={16} /> {students.length}</strong></div>
      {error && <AccountMessage>{error}</AccountMessage>}
      {notice && <p className="account-success" role="status">{notice}</p>}
      <section className="admin-survey-responses">
        <div className="account-section-heading">
          <div><h2>Сауалнама жауаптары</h2><p>Қатысушының аты және барлық жауаптары әкімшіге ғана көрсетіледі.</p></div>
          <strong className="account-count">{surveyResponseCount} жауап</strong>
        </div>
        {surveyResponseError && <AccountMessage>{surveyResponseError}</AccountMessage>}
        {isLoadingSurveyResponses && surveyResponses.length === 0
          ? <p className="account-empty">Жауаптар жүктелуде…</p>
          : surveyResponses.length === 0
            ? <p className="account-empty">Әзірге сауалнама жауабы жоқ.</p>
            : <div className="admin-survey-response-list">{surveyResponses.map((submission) => (
              <details className="admin-survey-response" key={submission.id}>
                <summary>
                  <strong>{submission.respondent_name}</strong>
                  <span>{new Date(submission.created_at).toLocaleString('kk-KZ')}</span>
                </summary>
                <dl>
                  {surveyQuestions.map((question) => {
                    const answer = submission.answers[String(question.id)]
                    const answerText = Array.isArray(answer) ? answer.join(' · ') : answer
                    return (
                      <div className="admin-survey-answer" key={question.id}>
                        <dt>{question.id}. {question.prompt}</dt>
                        <dd className={question.type === 'open' ? 'is-open-answer' : ''}>
                          {answerText || 'Жауап берілмеген'}
                        </dd>
                      </div>
                    )
                  })}
                </dl>
              </details>
            ))}</div>}
        {hasMoreSurveyResponses && <button type="button" className="account-secondary admin-survey-load-more" onClick={() => void loadMoreSurveyResponses()} disabled={isLoadingSurveyResponses}>{isLoadingSurveyResponses ? 'Жүктелуде…' : 'Тағы жауап жүктеу'}</button>}
      </section>
      <form className="account-search" onSubmit={(event) => void searchStudents(event)}><Search size={17} /><input className={controlClass} value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Аты немесе email арқылы іздеу" /><button type="submit" className="account-secondary" disabled={isLoading}>{isLoading ? 'Іздеу…' : 'Іздеу'}</button></form>
      <div className="admin-student-list">{students.map((student) => <button type="button" className={`admin-student-row ${selected?.profile.id === student.id ? 'is-selected' : ''}`} onClick={() => void loadStudent(student.id)} key={student.id}><UserRound size={18} /><span><strong>{student.display_name}</strong><small>{student.email}</small></span><span className="admin-student-metrics">{student.total_points} ұпай · {student.attempt_count} тест</span></button>)}</div>
      {selected && <div className="admin-detail">
        <h2>{selected.profile.display_name}</h2><p>{selected.profile.email} · {selected.profile.total_points} ұпай · {selected.profile.attempt_count} тест · орташа {selected.profile.average_percent}%</p>
        <h3>Тест нәтижелері</h3>
        {selected.attempts.length ? <div className="account-table-wrap"><table className="account-table"><thead><tr><th>Тест</th><th>Күні</th><th>Ұпай</th><th>Дұрыс</th></tr></thead><tbody>{selected.attempts.map((attempt) => <tr key={attempt.id}><td>{attempt.assessment_title}</td><td>{new Date(attempt.created_at).toLocaleDateString('kk-KZ')}</td><td>{attempt.score}/{attempt.max_score}</td><td>{Math.round(attempt.correct_count / attempt.question_count * 100)}%</td></tr>)}</tbody></table></div> : <p className="account-empty">Тест нәтижесі жоқ.</p>}
        <form className="admin-adjust-form" onSubmit={(event) => void adjustPoints(event)}>
          <h3>Ұпайды түзету</h3>
          <label>Ұпай өзгерісі (+/-)<input className={controlClass} type="number" step="1" min="-10000" max="10000" value={delta} onChange={(event) => setDelta(event.target.value)} required /></label>
          <label>Міндетті себеп<input className={controlClass} value={reason} onChange={(event) => setReason(event.target.value)} minLength={3} maxLength={500} required /></label>
          <label>Қосымша түсініктеме (міндетті емес)<textarea className={controlClass} value={comment} onChange={(event) => setComment(event.target.value)} maxLength={1000} rows={2} /></label>
          <button className="account-primary" type="submit" disabled={isAdjusting}>{isAdjusting ? 'Сақталуда…' : 'Түзетуді журналға жазу'} <ArrowRight size={16} /></button>
        </form>
        <h3>Қолмен түзету журналы</h3>
        {selected.adjustments.length ? <ul className="adjustment-list">{selected.adjustments.map((entry) => <li key={entry.id}><strong>{entry.delta > 0 ? '+' : ''}{entry.delta} ұпай</strong><span>{entry.reason}{entry.comment ? ` · ${entry.comment}` : ''}</span><small>{entry.actor_name} · {new Date(entry.created_at).toLocaleString('kk-KZ')}</small></li>)}</ul> : <p className="account-empty">Түзету журналы бос.</p>}
      </div>}
    </section>
  )
}
