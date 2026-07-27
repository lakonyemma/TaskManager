import { useEffect, useState } from 'react'
import { CheckCircle2, Pause, Play, RotateCcw, X } from 'lucide-react'

const FOCUS_SECONDS = 25 * 60
const BREAK_SECONDS = 5 * 60

const formatTime = (s: number) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`

export type FocusTask = {
  id: string
  title: string
  description?: string | null
  status: string
  subtasks: { id: string; title: string; status: string }[]
}

// Full-screen, distraction-free single-task workspace: the task, its
// subtasks, a Pomodoro timer, and a one-click complete action. Nothing else
// from the app chrome renders while this is open.
export default function FocusMode({ task, onClose, onComplete, onSubtaskToggle, onMessage }: {
  task: FocusTask
  onClose: () => void
  onComplete: () => void
  onSubtaskToggle: (subtaskId: string, completed: boolean) => void
  onMessage: (msg: string, type?: 'info' | 'success' | 'error') => void
}) {
  const [mode, setMode] = useState<'focus' | 'break'>('focus')
  const [secondsLeft, setSecondsLeft] = useState(FOCUS_SECONDS)
  const [running, setRunning] = useState(false)

  useEffect(() => {
    if (!running) return
    const id = setInterval(() => setSecondsLeft((s) => Math.max(0, s - 1)), 1000)
    return () => clearInterval(id)
  }, [running])

  useEffect(() => {
    if (secondsLeft !== 0 || !running) return
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setRunning(false)
    if (mode === 'focus') {
      onMessage('Focus session complete — take a 5 minute break.', 'success')
      setMode('break')
      setSecondsLeft(BREAK_SECONDS)
    } else {
      onMessage('Break over — back to it.', 'info')
      setMode('focus')
      setSecondsLeft(FOCUS_SECONDS)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [secondsLeft])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  const resetTimer = () => { setRunning(false); setSecondsLeft(mode === 'focus' ? FOCUS_SECONDS : BREAK_SECONDS) }

  const completedSubtasks = task.subtasks.filter((s) => s.status === 'COMPLETED').length
  const progress = task.subtasks.length > 0
    ? Math.round((completedSubtasks / task.subtasks.length) * 100)
    : (task.status === 'COMPLETED' ? 100 : 0)

  return (
    <div className="focus-mode-overlay" role="dialog" aria-modal="true" aria-label={`Focus mode: ${task.title}`}>
      <button type="button" className="focus-mode-exit" onClick={onClose} aria-label="Exit focus mode (Esc)"><X size={20} /></button>

      <div className="focus-mode-content">
        <p className="focus-mode-eyebrow">Focus Mode</p>
        <h1>{task.title}</h1>
        {task.description && <p className="focus-mode-notes">{task.description}</p>}

        <div className="focus-mode-progress" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}>
          <div className="focus-mode-progress-bar" style={{ width: `${progress}%` }} />
        </div>
        {task.subtasks.length > 0 && <p className="focus-mode-progress-label">{completedSubtasks} of {task.subtasks.length} subtasks complete</p>}

        {task.subtasks.length > 0 && (
          <div className="focus-mode-subtasks">
            {task.subtasks.map((s) => (
              <label key={s.id} className="remember-row">
                <input type="checkbox" checked={s.status === 'COMPLETED'} onChange={() => onSubtaskToggle(s.id, s.status !== 'COMPLETED')} />
                <span style={{ textDecoration: s.status === 'COMPLETED' ? 'line-through' : 'none' }}>{s.title}</span>
              </label>
            ))}
          </div>
        )}

        <div className="focus-mode-timer">
          <span className={`focus-mode-timer-mode ${mode}`}>{mode === 'focus' ? 'Focus session' : 'Break'}</span>
          <span className="focus-mode-timer-display">{formatTime(secondsLeft)}</span>
          <div className="focus-mode-timer-controls">
            <button type="button" className="mini-btn" onClick={() => setRunning((r) => !r)}>
              {running ? <><Pause size={13} /> Pause</> : <><Play size={13} /> Start</>}
            </button>
            <button type="button" className="mini-btn secondary-btn" onClick={resetTimer}><RotateCcw size={13} /> Reset</button>
          </div>
        </div>

        <button type="button" className="primary-btn focus-mode-complete" onClick={onComplete} disabled={task.status === 'COMPLETED'}>
          <CheckCircle2 size={16} /> {task.status === 'COMPLETED' ? 'Task complete' : 'Mark task complete'}
        </button>
      </div>
    </div>
  )
}
