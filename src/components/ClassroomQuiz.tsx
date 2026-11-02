import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { ArrowRight, Check, Copy, LoaderCircle, QrCode, Trophy, Users, X } from 'lucide-react'

type Role = 'host' | 'player'
type TimerSeconds = 10 | 15 | 20
type Participant = { name: string; score: number; correctCount: number; hasAnswered: boolean }
type AnswerDetail = { questionNumber: number; question: string; name: string; answer: string }
type GameState = {
  code: string
  status: 'waiting' | 'running' | 'finished'
  questionIndex: number
  questionCount: number
  timerSeconds: number
  endsAt: string | null
  question: { prompt: string; options: string[] } | null
  participants: Participant[]
  currentAnsweredCount: number
  leaderboard: Participant[]
  answerDetails?: AnswerDetail[]
}
type StoredGame = { role: Role; code: string; token: string; name?: string }
type ApiFailure = { error?: string }

const STORAGE_KEY = 'azattyq-classroom-quiz'
const CLASSROOM_API_URL = `${(import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, '')}/api/classroom`

function getStoredGame(): StoredGame | null {
  try {
    const stored = sessionStorage.getItem(STORAGE_KEY)
    if (!stored) return null
    const parsed = JSON.parse(stored) as Partial<StoredGame>
    if ((parsed.role === 'host' || parsed.role === 'player')
      && typeof parsed.code === 'string'
      && typeof parsed.token === 'string') return parsed as StoredGame
  } catch {
    return null
  }
  return null
}

function getJoinCodeFromHash() {
  const query = window.location.hash.split('?')[1] ?? ''
  const code = new URLSearchParams(query).get('join') ?? ''
  return /^\d{6}$/.test(code) ? code : ''
}

async function postGame(payload: Record<string, unknown>) {
  const response = await fetch(CLASSROOM_API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(payload),
  })
  const data = await response.json() as ApiFailure & Record<string, unknown>
  if (!response.ok) throw new Error(data.error || 'Ойын сұрауын орындау мүмкін болмады.')
  return data
}

export default function ClassroomQuiz() {
  const [game, setGame] = useState<StoredGame | null>(getStoredGame)
  const [gameState, setGameState] = useState<GameState | null>(null)
  const [joinCode, setJoinCode] = useState(getJoinCodeFromHash)
  const [studentName, setStudentName] = useState('')
  const [timerSeconds, setTimerSeconds] = useState<TimerSeconds>(20)
  const [qrDataUrl, setQrDataUrl] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [isBusy, setIsBusy] = useState(false)
  const [isCopied, setIsCopied] = useState(false)
  const [submittedAnswer, setSubmittedAnswer] = useState<{ questionIndex: number; answer: string } | null>(null)
  const [clockNow, setClockNow] = useState(() => Date.now())
  const advancedQuestion = useRef(-1)
  const selectedAnswer = gameState && submittedAnswer?.questionIndex === gameState.questionIndex
    ? submittedAnswer.answer
    : ''
  const isQrJoin = Boolean(joinCode)

  const refreshState = useCallback(async (active: boolean) => {
    if (!game) return
    try {
      const params = new URLSearchParams({
        action: 'state',
        code: game.code,
        token: game.token,
        role: game.role,
      })
      const response = await fetch(`${CLASSROOM_API_URL}?${params}`, { headers: { Accept: 'application/json' } })
      const data = await response.json() as GameState & ApiFailure
      if (!response.ok) throw new Error(data.error || 'Ойын күйін жаңарту мүмкін болмады.')
      if (!active) return
      setGameState(data)
      setError('')
    } catch (requestError) {
      if (active) setError(requestError instanceof Error ? requestError.message : 'Ойын серверіне қосылу мүмкін болмады.')
    }
  }, [game])

  useEffect(() => {
    const updateJoinCode = () => {
      setJoinCode(getJoinCodeFromHash())
      setError('')
      setNotice('')
    }
    window.addEventListener('hashchange', updateJoinCode)
    return () => window.removeEventListener('hashchange', updateJoinCode)
  }, [])

  useEffect(() => {
    let active = true
    if (game) {
      const initialRequest = window.setTimeout(() => void refreshState(active), 0)
      const interval = window.setInterval(() => void refreshState(active), 1000)
      return () => {
        active = false
        window.clearTimeout(initialRequest)
        window.clearInterval(interval)
      }
    }
    return () => { active = false }
  }, [game, refreshState])

  useEffect(() => {
    const endsAt = gameState?.endsAt
    if (gameState?.status !== 'running' || !endsAt) return
    const interval = window.setInterval(() => setClockNow(Date.now()), 200)
    return () => window.clearInterval(interval)
  }, [gameState?.endsAt, gameState?.status])

  const remainingSeconds = gameState?.endsAt
    ? Math.max(0, Math.ceil((Date.parse(gameState.endsAt) - clockNow) / 1000))
    : gameState?.timerSeconds ?? 20

  useEffect(() => {
    if (game?.role !== 'host' || gameState?.status !== 'running' || !gameState.question) return
    const timeExpired = remainingSeconds <= 0
    const everyoneAnswered = gameState.participants.length > 0
      && gameState.currentAnsweredCount >= gameState.participants.length
    if ((!timeExpired && !everyoneAnswered) || advancedQuestion.current === gameState.questionIndex) return
    advancedQuestion.current = gameState.questionIndex
    void postGame({
      action: 'advance',
      code: game.code,
      token: game.token,
      questionIndex: gameState.questionIndex,
    }).then(() => refreshState(true))
      .catch((requestError: unknown) => {
        advancedQuestion.current = -1
        setError(requestError instanceof Error ? requestError.message : 'Келесі сұраққа өту мүмкін болмады.')
      })
  }, [game, gameState, remainingSeconds, refreshState])

  useEffect(() => {
    if (game?.role !== 'host') return
    let active = true
    const joinUrl = `${window.location.origin}/#games?join=${game.code}`
    void import('qrcode')
      .then(({ default: QRCode }) => QRCode.toDataURL(joinUrl, { width: 280, margin: 2, errorCorrectionLevel: 'M' }))
      .then((dataUrl) => { if (active) setQrDataUrl(dataUrl) })
      .catch(() => { if (active) setError('QR-кодты жасау мүмкін болмады. Сілтемені көшіріп таратыңыз.') })
    return () => { active = false }
  }, [game])

  useEffect(() => {
    if (!isQrJoin) return
    const timeout = window.setTimeout(() => {
      document.getElementById('classroom-quiz')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 100)
    return () => window.clearTimeout(timeout)
  }, [isQrJoin])

  const createGame = async () => {
    setIsBusy(true)
    setError('')
    try {
      const result = await postGame({ action: 'create', timerSeconds }) as { code: string; hostToken: string }
      const nextGame: StoredGame = { role: 'host', code: result.code, token: result.hostToken }
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(nextGame))
      setQrDataUrl('')
      setGame(nextGame)
      setNotice('Ойын бөлмесі ашылды. Студенттер QR кодпен қосылсын.')
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Ойын бөлмесін ашу мүмкін болмады.')
    } finally {
      setIsBusy(false)
    }
  }

  const joinGame = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setIsBusy(true)
    setError('')
    try {
      const result = await postGame({
        action: 'join',
        code: joinCode.trim(),
        name: studentName.trim(),
      }) as { code: string; token: string }
      const nextGame: StoredGame = { role: 'player', code: result.code, token: result.token, name: studentName.trim() }
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(nextGame))
      setGame(nextGame)
      setNotice('Ойынға қосылдыңыз. Мұғалімнің бастауын күтіңіз.')
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Ойынға қосылу мүмкін болмады.')
    } finally {
      setIsBusy(false)
    }
  }

  const startGame = async () => {
    if (!game) return
    setIsBusy(true)
    setError('')
    try {
      await postGame({ action: 'start', code: game.code, token: game.token })
      await refreshState(true)
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Ойынды бастау мүмкін болмады.')
    } finally {
      setIsBusy(false)
    }
  }

  const submitAnswer = async (answer: string) => {
    if (!game || !gameState || game.role !== 'player' || selectedAnswer) return
    setSubmittedAnswer({ questionIndex: gameState.questionIndex, answer })
    setError('')
    try {
      await postGame({
        action: 'answer',
        code: game.code,
        token: game.token,
        questionIndex: gameState.questionIndex,
        answer,
      })
      setNotice('Жауабыңыз қабылданды. Келесі сұрақты күтіңіз.')
      await refreshState(true)
    } catch (requestError) {
      setSubmittedAnswer(null)
      setError(requestError instanceof Error ? requestError.message : 'Жауапты жіберу мүмкін болмады.')
    }
  }

  const copyJoinUrl = async () => {
    if (!game) return
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/#games?join=${game.code}`)
      setIsCopied(true)
      window.setTimeout(() => setIsCopied(false), 1800)
    } catch {
      setError('Сілтемені көшіру мүмкін болмады. QR кодын пайдаланыңыз.')
    }
  }

  const leaveGame = () => {
    sessionStorage.removeItem(STORAGE_KEY)
    setGame(null)
    setGameState(null)
    setError('')
    setNotice('')
    setSubmittedAnswer(null)
  }

  const progress = gameState?.question
    ? Math.max(0, Math.min(100, (remainingSeconds / gameState.timerSeconds) * 100))
    : 100
  const playerHasAnswered = gameState?.participants.find((participant) => participant.name === game?.name)?.hasAnswered ?? Boolean(selectedAnswer)

  return (
    <section id="classroom-quiz" className="classroom-quiz" aria-labelledby="classroom-quiz-title">
      <header className="classroom-quiz-heading">
        <div>
          <p className="survey-kicker"><Users size={15} /> СЫНЫППЕН БІРГЕ · 15 СҰРАҚ</p>
          <h2 id="classroom-quiz-title">Ортақ тарихи<br /><em>ойын.</em></h2>
          <p>Мұғалім экранда бөлме ашады, студенттер QR кодпен телефоннан қосылады. Әр сұраққа 10, 15 немесе 20 секунд беріледі.</p>
        </div>
        <div className="classroom-quiz-stats"><strong>15</strong><span>сұрақ</span><strong>10–20</strong><span>секунд / сұрақ</span></div>
      </header>

      {error && <p className="classroom-message is-error" role="alert">{error}</p>}
      {notice && <p className="classroom-message" role="status">{notice}</p>}

      {!game && isQrJoin ? (
        <div className="classroom-entry-grid is-join-flow">
          <form className="classroom-entry-card" onSubmit={(event) => void joinGame(event)}>
            <p className="classroom-card-kicker">ОЙЫНҒА ҚОСЫЛУ · {joinCode}</p>
            <h3>Атыңызды жазыңыз</h3>
            <p>Ойын коды QR сілтемесінен автоматты алынды. Атыңыз мұғалімнің экранында көрсетіледі.</p>
            <label className="classroom-field">Атыңыз
              <input value={studentName} onChange={(event) => setStudentName(event.target.value)} minLength={2} maxLength={40} autoComplete="name" autoFocus required placeholder="Мысалы, Айдана" />
            </label>
            <button type="submit" className="classroom-primary" disabled={isBusy}>{isBusy ? 'Қосылуда…' : 'Ойынға қосылу'} <ArrowRight size={17} /></button>
          </form>
        </div>
      ) : !game ? (
        <div className="classroom-entry-grid">
          <form className="classroom-entry-card" onSubmit={(event) => { event.preventDefault(); void createGame() }}>
            <p className="classroom-card-kicker">ИНТЕРАКТИВТІ ТАҚТА</p>
            <h3>Мұғалімге</h3>
            <p>Ойын бөлмесін ашып, QR кодты тақтаға көрсетіңіз. Сұрақтар бәріне бір уақытта шығады.</p>
            <label className="classroom-field">Әр сұраққа уақыт
              <select value={timerSeconds} onChange={(event) => setTimerSeconds(Number(event.target.value) as TimerSeconds)}>
                <option value={10}>10 секунд</option>
                <option value={15}>15 секунд</option>
                <option value={20}>20 секунд</option>
              </select>
            </label>
            <button type="submit" className="classroom-primary" disabled={isBusy}>{isBusy ? 'Ашылуда…' : 'Жаңа ойын ашу'} <ArrowRight size={17} /></button>
          </form>

        </div>
      ) : !gameState ? (
        <div className="classroom-wait"><LoaderCircle size={22} className="account-spinner" /> Ойын бөлмесіне қосылуда…</div>
      ) : (
        <div className="classroom-live">
          <div className="classroom-live-top">
            <div><p className="classroom-card-kicker">{game.role === 'host' ? 'МҰҒАЛІМ ЭКРАНЫ' : 'СТУДЕНТ ЭКРАНЫ'}</p><h3>Ойын коды: <strong>{game.code}</strong></h3></div>
            <button type="button" className="classroom-quiet" onClick={leaveGame}><X size={16} /> Шығу</button>
          </div>

          {gameState.status === 'waiting' && (
            <div className="classroom-lobby">
              {game.role === 'host' && (
                <div className="classroom-qr-card">
                  {qrDataUrl ? <img src={qrDataUrl} alt={`Ойынға қосылу QR коды, ${game.code}`} /> : <div className="classroom-qr-placeholder"><QrCode size={38} /></div>}
                  <p>Телефон камерасымен сканерлеңіз</p>
                  <button type="button" className="classroom-quiet" onClick={() => void copyJoinUrl()}><Copy size={15} /> {isCopied ? 'Көшірілді' : 'Сілтемені көшіру'}</button>
                </div>
              )}
              <div className="classroom-lobby-info">
                <p className="classroom-player-count"><Users size={18} /> Қосылған студенттер: <strong>{gameState.participants.length}</strong></p>
                {gameState.participants.length
                  ? <ol className="classroom-name-list">{gameState.participants.map((participant) => <li key={participant.name}>{participant.name}</li>)}</ol>
                  : <p className="classroom-muted">QR кодты көрсетіңіз немесе ойын кодын бөлісіңіз.</p>}
                {game.role === 'host'
                  ? <button type="button" className="classroom-primary" onClick={() => void startGame()} disabled={isBusy || gameState.participants.length === 0}>{isBusy ? 'Басталуда…' : 'Студенттер дайын — бастау'} <ArrowRight size={17} /></button>
                  : <p className="classroom-wait-note">Мұғалім бастаған сәтте бірінші сұрақ ашылады.</p>}
              </div>
            </div>
          )}

          {gameState.status === 'running' && gameState.question && (
            <div className="classroom-question-panel">
              <div className="classroom-question-meta"><span>{gameState.questionIndex + 1} / {gameState.questionCount} сұрақ</span><strong className={remainingSeconds <= 5 ? 'is-urgent' : ''}>{remainingSeconds} сек</strong></div>
              <div className="classroom-timer-track" role="progressbar" aria-label="Сұраққа қалған уақыт" aria-valuemin={0} aria-valuemax={gameState.timerSeconds} aria-valuenow={remainingSeconds}><span style={{ width: `${progress}%` }} /></div>
              <h3>{gameState.question.prompt}</h3>
              {game.role === 'host' ? (
                <div className="classroom-host-progress">
                  <p>Жауап берді: <strong>{gameState.currentAnsweredCount}</strong> / {gameState.participants.length}</p>
                  <div className="classroom-option-board">{gameState.question.options.map((option, index) => <div key={option}><span>{String.fromCharCode(65 + index)}</span>{option}</div>)}</div>
                  <p className="classroom-muted">Дұрыс жауап жарияланбайды; әр студенттің таңдауы ойын соңында мұғалімге көрінеді.</p>
                </div>
              ) : (
                <div className="classroom-answer-options">
                  {gameState.question.options.map((option, index) => <button type="button" key={option} disabled={playerHasAnswered || remainingSeconds <= 0} className={selectedAnswer === option ? 'is-selected' : ''} onClick={() => void submitAnswer(option)}><span>{String.fromCharCode(65 + index)}</span>{option}</button>)}
                  {playerHasAnswered && <p className="classroom-wait-note"><Check size={16} /> Жауабыңыз қабылданды. Мұғалім келесі сұраққа өткізгенше күтіңіз.</p>}
                </div>
              )}
              <p className="classroom-player-count"><Users size={16} /> {gameState.participants.length} студент · {gameState.currentAnsweredCount} жауап берді</p>
            </div>
          )}

          {gameState.status === 'finished' && (
            <div className="classroom-results">
              <div className="classroom-results-heading"><Trophy size={25} /><div><p className="classroom-card-kicker">ОЙЫН АЯҚТАЛДЫ</p><h3>Сынып нәтижесі</h3></div></div>
              {gameState.leaderboard.length
                ? <ol className="classroom-leaderboard">{gameState.leaderboard.map((participant, index) => <li key={participant.name}><span className="classroom-rank">{index + 1}</span><strong>{participant.name}</strong><span>{participant.score} ұпай</span><small>{participant.correctCount} дұрыс</small></li>)}</ol>
                : <p className="classroom-muted">Нәтиже табылмады.</p>}
              {game.role === 'host' && gameState.answerDetails && (
                <details className="classroom-answer-review">
                  <summary>Әр студенттің жауаптарын көру</summary>
                  <div>{Array.from({ length: gameState.questionCount }, (_, index) => {
                    const first = gameState.answerDetails?.find((answer) => answer.questionNumber === index + 1)
                    return (
                      <section key={index}>
                        <h4>{index + 1}. {first?.question ?? 'Сұрақ'}</h4>
                        <ul>{gameState.leaderboard.map((participant) => {
                          const answer = gameState.answerDetails?.find((item) => item.questionNumber === index + 1 && item.name === participant.name)
                          return <li key={participant.name}><strong>{participant.name}:</strong> {answer?.answer ?? 'Жауап бермеді'}</li>
                        })}</ul>
                      </section>
                    )
                  })}</div>
                </details>
              )}
              {game.role === 'host' && <button type="button" className="classroom-primary" onClick={leaveGame}>Жаңа ойын ашу <ArrowRight size={17} /></button>}
              {game.role === 'player' && <p className="classroom-wait-note">Нәтижелер интерактивті тақтада да көрсетілді.</p>}
            </div>
          )}
        </div>
      )}
    </section>
  )
}
