import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { ArrowRight, BarChart3, CheckCircle2, FileQuestion, LoaderCircle } from 'lucide-react'
import { surveyQuestions, type SurveyAnswer, type SurveyQuestionResult, type SurveyResults } from '../../shared/survey'
import { surveyApiUrl } from '../lib/surveyApi'

const questionTypeLabels = {
  open: 'Ашық сұрақ',
  closed: 'Жабық сұрақ',
  multiple: 'Бірнеше жауап таңдауға болады',
} as const

const emptyResults: SurveyResults = {
  respondentCount: 0,
  questions: surveyQuestions.map((question) => ({
    id: question.id,
    responseCount: 0,
    correctCount: question.correctAnswers ? 0 : null,
    options: (question.options ?? []).map((label) => ({ label, count: 0 })),
  })),
}

const DEVICE_ID_STORAGE_KEY = 'azattyq-survey-device-id'
const DEVICE_SUBMITTED_STORAGE_KEY = 'azattyq-survey-submitted'
const DEVICE_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function percentage(count: number, total: number) {
  if (total === 0) return 0
  return Math.round((count / total) * 1000) / 10
}

function createDeviceId() {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID()

  const bytes = crypto.getRandomValues(new Uint8Array(16))
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

function getDeviceRegistration() {
  try {
    let deviceId = localStorage.getItem(DEVICE_ID_STORAGE_KEY)
    if (!deviceId || !DEVICE_ID_PATTERN.test(deviceId)) {
      deviceId = createDeviceId()
      localStorage.setItem(DEVICE_ID_STORAGE_KEY, deviceId)
    }
    return {
      deviceId,
      status: localStorage.getItem(DEVICE_SUBMITTED_STORAGE_KEY) === 'true' ? 'submitted' as const : 'ready' as const,
    }
  } catch {
    return { deviceId: '', status: 'unavailable' as const }
  }
}

async function fetchSurveyResults() {
  const response = await fetch(surveyApiUrl, { headers: { Accept: 'application/json' } })
  if (!response.ok) throw new Error('Сауалнама нәтижелерін жүктеу мүмкін болмады.')
  return await response.json() as SurveyResults
}

export default function SurveyExperience() {
  const [activeView, setActiveView] = useState<'form' | 'results'>('form')
  const [respondentName, setRespondentName] = useState('')
  const [answers, setAnswers] = useState<Record<number, SurveyAnswer>>({})
  const [results, setResults] = useState<SurveyResults>(emptyResults)
  const [isLoadingResults, setIsLoadingResults] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [previewComplete, setPreviewComplete] = useState(false)
  const [validationMessage, setValidationMessage] = useState('')
  const [submitError, setSubmitError] = useState('')
  const [deviceRegistration, setDeviceRegistration] = useState(getDeviceRegistration)

  const hardestQuestion = useMemo(
    () => results.questions
      .filter((result) => result.correctCount !== null && result.responseCount > 0)
      .map((result) => ({
        result,
        errors: result.responseCount - (result.correctCount ?? 0),
      }))
      .sort((left, right) => right.errors / right.result.responseCount - left.errors / left.result.responseCount)[0] ?? null,
    [results],
  )

  const loadResults = async () => {
    try {
      setResults(await fetchSurveyResults())
      setSubmitError('')
    } catch {
      setSubmitError('Сақталған нәтижелерді жүктеу мүмкін болмады. Интернет байланысын тексеріңіз.')
    } finally {
      setIsLoadingResults(false)
    }
  }

  useEffect(() => {
    let active = true
    void fetchSurveyResults()
      .then((data) => {
        if (!active) return
        setResults(data)
        setSubmitError('')
      })
      .catch(() => {
        if (active) setSubmitError('Сақталған нәтижелерді жүктеу мүмкін болмады. Интернет байланысын тексеріңіз.')
      })
      .finally(() => {
        if (active) setIsLoadingResults(false)
      })
    return () => { active = false }
  }, [])

  const submitSurvey = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (isSubmitting) return
    setValidationMessage('')
    setSubmitError('')

    const unanswered = surveyQuestions.find((question) => {
      const answer = answers[question.id]
      if (question.type === 'multiple') return !Array.isArray(answer) || answer.length === 0
      return typeof answer !== 'string' || answer.trim().length < 2
    })
    if (unanswered) {
      setValidationMessage(`№${unanswered.id} сұраққа жауап беріңіз.`)
      document.getElementById(`survey-question-${unanswered.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      return
    }

    setIsSubmitting(true)
    try {
      const response = await fetch(surveyApiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ name: respondentName.trim(), answers, deviceId: deviceRegistration.deviceId }),
      })
      const result = await response.json() as { error?: string }
      if (response.status === 409) {
        setDeviceRegistration((previous) => ({ ...previous, status: 'submitted' }))
        localStorage.setItem(DEVICE_SUBMITTED_STORAGE_KEY, 'true')
      }
      if (!response.ok) throw new Error(result.error || 'Жауапты сақтау мүмкін болмады.')

      setDeviceRegistration((previous) => ({ ...previous, status: 'submitted' }))
      localStorage.setItem(DEVICE_SUBMITTED_STORAGE_KEY, 'true')
      setPreviewComplete(true)
      setRespondentName('')
      setAnswers({})
      setIsLoadingResults(true)
      await loadResults()
      setActiveView('results')
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : 'Жауапты сақтау мүмкін болмады. Кейінірек қайталап көріңіз.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const setMultipleChoice = (questionId: number, option: string, checked: boolean) => {
    setAnswers((previous) => {
      const currentAnswer = previous[questionId]
      const selected: string[] = Array.isArray(currentAnswer) ? currentAnswer : []
      const next = checked
        ? [...selected, option]
        : selected.filter((answer) => answer !== option)
      return { ...previous, [questionId]: next }
    })
  }

  return (
    <section className="survey-experience">
      <header className="survey-heading">
        <div>
          <p className="survey-kicker"><FileQuestion size={15} /> ТАРИХИ ЗЕРТТЕУ · 10 СҰРАҚ</p>
          <h1>Интерактивті<br /><em>сауалнама.</em></h1>
          <p className="survey-intro">Ұлт-азаттық көтерілістер туралы білім мен пікірді зерттеуге арналған сауалнама.</p>
        </div>
        <div className="survey-respondent-stat">
          <span>НАҚТЫ ҚАТЫСУШЫЛАР</span>
          <strong>{results.respondentCount}<small> / 100</small></strong>
          <p>Серверде сақталған жауаптар саны</p>
        </div>
      </header>

      <div className="survey-view-switch" role="tablist" aria-label="Сауалнама көрінісі">
        <button type="button" role="tab" aria-selected={activeView === 'form'} className={activeView === 'form' ? 'is-active' : ''} onClick={() => setActiveView('form')}>Сауалнама <span>10 сұрақ</span></button>
        <button type="button" role="tab" aria-selected={activeView === 'results'} className={activeView === 'results' ? 'is-active' : ''} onClick={() => setActiveView('results')}><BarChart3 size={16} /> Нақты нәтижелер</button>
      </div>

      {activeView === 'form' ? (
        <div className="survey-form-view">
          <div className="survey-form-note">
            <div><strong>Сұрақтардың үш түрі</strong><p>Ашық, жабық және бірнеше жауап таңдауға болатын сұрақтар.</p></div>
            <p>Бір браузерден бір рет қатысуға болады. Статистика сақталған жауаптардан есептеледі.</p>
          </div>
          {deviceRegistration.status === 'submitted' ? (
            <div className="survey-device-complete" role="status">
              <CheckCircle2 size={22} />
              <div><strong>Бұл құрылғыдан сауалнама өтілді</strong><p>Бір құрылғыдан бір жауап қабылданады. Нәтижелерді бөлек бөлімнен көре аласыз.</p></div>
            </div>
          ) : deviceRegistration.status === 'unavailable' ? (
            <p className="survey-validation-message" role="alert">Құрылғыны белгілеу мүмкін болмады. Браузердің жергілікті сақтауын қосып, бетті жаңартыңыз.</p>
          ) : (
          <form onSubmit={(event) => void submitSurvey(event)}>
            <label className="survey-name-field">
              <span>Атыңыз</span>
              <input value={respondentName} onChange={(event) => setRespondentName(event.target.value)} required minLength={2} maxLength={100} autoComplete="name" placeholder="Атыңызды жазыңыз" />
            </label>
            <div className="survey-question-list">
              {surveyQuestions.map((question) => (
                <fieldset className="survey-question" id={`survey-question-${question.id}`} key={question.id}>
                  <legend><span className="survey-question-number">{String(question.id).padStart(2, '0')}</span><span>{question.prompt}</span></legend>
                  <span className={`survey-type survey-type-${question.type}`}>{questionTypeLabels[question.type]}</span>
                  {question.type === 'open' ? (
                    <textarea required minLength={2} maxLength={1000} value={typeof answers[question.id] === 'string' ? answers[question.id] : ''} onChange={(event) => setAnswers((previous) => ({ ...previous, [question.id]: event.target.value }))} placeholder="Жауабыңызды жазыңыз…" rows={3} />
                  ) : (
                    <div className="survey-option-list">
                      {question.options?.map((option) => (
                        <label className="survey-option" key={option}>
                          <input
                            type={question.type === 'multiple' ? 'checkbox' : 'radio'}
                            name={`question-${question.id}`}
                            value={option}
                            required={question.type === 'closed'}
                            checked={question.type === 'multiple'
                              ? Array.isArray(answers[question.id]) && answers[question.id].includes(option)
                              : answers[question.id] === option}
                            onChange={(event) => {
                              if (question.type === 'multiple') setMultipleChoice(question.id, option, event.target.checked)
                              else setAnswers((previous) => ({ ...previous, [question.id]: option }))
                            }}
                          />
                          <span>{option}</span>
                        </label>
                      ))}
                    </div>
                  )}
                </fieldset>
              ))}
            </div>
            <div className="survey-submit-row">
              <p>Бір құрылғыдан бір жауап қабылданады. Атыңыз құпия сақталады; жария түрде тек жиынтық статистика көрсетіледі.</p>
              <button type="submit" className="survey-submit" disabled={isSubmitting || deviceRegistration.status !== 'ready'}>
                {isSubmitting ? <><LoaderCircle className="account-spinner" size={16} /> Сақталуда…</> : <>Жауапты жіберу <ArrowRight size={17} /></>}
              </button>
            </div>
          {validationMessage && <p className="survey-validation-message" role="alert">{validationMessage}</p>}
          {submitError && <p className="survey-validation-message" role="alert">{submitError}</p>}
          {previewComplete && <p className="survey-preview-success" role="status"><CheckCircle2 size={18} /> Жауаптарыңыз сақталды. Қатысқаныңызға рақмет!</p>}
          </form>
          )}
        </div>
      ) : (
        <div className="survey-results-view">
          {previewComplete && <p className="survey-preview-success" role="status"><CheckCircle2 size={18} /> Жауаптарыңыз сақталды. Қатысқаныңызға рақмет!</p>}
          {submitError && <p className="survey-validation-message" role="alert">{submitError}</p>}
          <div className="survey-results-summary">
            <div><span>ҚАТЫСУШЫЛАР</span><strong>{results.respondentCount}</strong><p>нақты сақталған жауап</p></div>
            <div><span>СҰРАҚ САНЫ</span><strong>{surveyQuestions.length}</strong><p>3 түрлі формат</p></div>
            <div className="survey-hardest">
              <span>ҚАТЕ ҮЛЕСІ ЕҢ ЖОҒАРЫ</span>
              {hardestQuestion
                ? <><strong>№{hardestQuestion.result.id} · {percentage(hardestQuestion.errors, hardestQuestion.result.responseCount)}%</strong><p>{surveyQuestions.find((question) => question.id === hardestQuestion.result.id)?.prompt}</p></>
                : <><strong>Дерек жоқ</strong><p>Жауаптар жиналғаннан кейін қате үлесі есептеледі.</p></>}
            </div>
          </div>
          {isLoadingResults ? (
            <p className="survey-loading"><LoaderCircle className="account-spinner" size={18} /> Нақты нәтижелер жүктелуде…</p>
          ) : (
            <div className="survey-result-list">
              {surveyQuestions.map((question) => {
                const result: SurveyQuestionResult = results.questions.find((item) => item.id === question.id) ?? {
                  id: question.id,
                  responseCount: 0,
                  correctCount: question.correctAnswers ? 0 : null,
                  options: (question.options ?? []).map((label) => ({ label, count: 0 })),
                }
                const errors = result.correctCount === null ? null : result.responseCount - result.correctCount
                const responseRate = percentage(result.responseCount, results.respondentCount)
                return (
                  <article className="survey-result-question" key={question.id}>
                    <div className="survey-result-heading">
                      <span className="survey-question-number">{String(question.id).padStart(2, '0')}</span>
                      <div><span className={`survey-type survey-type-${question.type}`}>{questionTypeLabels[question.type]}</span><h2>{question.prompt}</h2></div>
                      {errors !== null && result.responseCount > 0 && <strong className="survey-error-rate">{percentage(errors, result.responseCount)}% қате</strong>}
                    </div>
                    <div className="survey-question-participation">
                      <div><span>Жауап саны</span><strong>{result.responseCount} / {results.respondentCount} адам · {responseRate}%</strong></div>
                      <div className="survey-result-track" role="progressbar" aria-label={`${question.id}-сұраққа жауап бергендер үлесі`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={responseRate}>
                        <span style={{ width: `${responseRate}%` }} />
                      </div>
                    </div>
                    {question.type === 'open' ? (
                      <div className="survey-theme-list">
                        {result.options.length > 0 ? result.options.map((option) => (
                          <div className="survey-result-row" key={option.label}>
                            <div className="survey-result-row-label"><span>{option.label}</span><strong>{percentage(option.count, result.responseCount)}% <small>({option.count} жауап)</small></strong></div>
                            <div className="survey-result-track" role="progressbar" aria-label={option.label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={percentage(option.count, result.responseCount)}><span style={{ width: `${percentage(option.count, result.responseCount)}%` }} /></div>
                          </div>
                        )) : (
                          <>
                            <div className="survey-result-row-label"><span>Жауап бергендер</span><strong>{responseRate}% <small>({result.responseCount} жауап)</small></strong></div>
                            <p className="survey-result-footnote">Ашық жауаптар жеке дерек ретінде сақталады және жарияланбайды.</p>
                          </>
                        )}
                      </div>
                    ) : (
                      <div className="survey-theme-list">
                        {question.options?.map((option) => {
                          const optionResult = result.options.find((item) => item.label === option)
                          const count = optionResult?.count ?? 0
                          const isCorrect = question.correctAnswers?.includes(option) ?? false
                          const optionRate = percentage(count, result.responseCount)
                          return <div className={`survey-result-row ${isCorrect ? 'is-correct' : ''}`} key={option}><div className="survey-result-row-label"><span>{option}{isCorrect ? ' · дұрыс жауап' : ''}</span><strong>{optionRate}% <small>({count} жауап)</small></strong></div><div className="survey-result-track" role="progressbar" aria-label={option} aria-valuemin={0} aria-valuemax={100} aria-valuenow={optionRate}><span style={{ width: `${optionRate}%` }} /></div></div>
                        })}
                        {question.type === 'multiple' && <p className="survey-result-footnote">Пайыз әр нұсқаны таңдағандар санының осы сұраққа жауап бергендер санына қатынасын көрсетеді. Бірнеше нұсқа таңдауға болатындықтан, пайыздардың қосындысы 100%-дан асуы мүмкін. Барлық дұрыс нұсқаны дәл таңдағандар: {percentage(result.correctCount ?? 0, result.responseCount)}%.</p>}
                        {question.type === 'closed' && result.responseCount > 0 && <p className="survey-result-footnote">Қате жауап: {percentage(errors ?? 0, result.responseCount)}%.</p>}
                      </div>
                    )}
                  </article>
                )
              })}
            </div>
          )}
          <p className="survey-disclaimer-bottom">Нәтижелер серверге жіберілген нақты жауаптардан есептеледі. Ашық жауаптар мен қатысушылардың есімдері жарияланбайды.</p>
        </div>
      )}
    </section>
  )
}
