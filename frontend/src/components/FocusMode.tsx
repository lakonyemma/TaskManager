import { useEffect, useRef, useState } from 'react'
import { CheckCircle2, Pause, Play, RotateCcw, X } from 'lucide-react'

const FOCUS_SECONDS = 25 * 60
const BREAK_SECONDS = 5 * 60
const NOTES_SAVE_DEBOUNCE_MS = 800

const formatTime = (s: number) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`

export type FocusTask = {
  id: string
  title: string
  description?: string | null
  notes?: string | null
  status: string
  subtasks: { id: string; title: string; status: string }[]
}

// Full-screen, distraction-free single-task workspace: the task, its
// notes, subtasks, a Pomodoro timer, and a one-click complete action.
// Nothing else from the app chrome renders while this is open. Active
// focus time (never break time) is tracked locally and logged as one
// FocusSession record when the user exits, powering focus history/
// analytics.
export default function FocusMode({ task, onClose, onComplete, onSubtaskToggle, onSaveNotes, onLogSession, onMessage }: {
  task: FocusTask
  onClose: () => void
  onComplete: () => void
  onSubtaskToggle: (subtaskId: string, completed: boolean) => void
  onSaveNotes: (notes: string) => void
  onLogSession: (durationSeconds: number, pomodoroCount: number, startedAt: string) => void
  onMessage: (msg: string, type?: 'info' | 'success' | 'error') => void
}) {
  const [mode, setMode] = useState<'focus' | 'break'>('focus')
  const [secondsLeft, setSecondsLeft] = useState(FOCUS_SECONDS)
  const [running, setRunning] = useState(false)
  const [notes, setNotes] = useState(task.notes || '')

  const focusSecondsElapsedRef = useRef(0)
  const pomodoroCountRef = useRef(0)
  const sessionStartRef = useRef<string | null>(null)
  const notesSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!running) return
    if (mode === 'focus' && !sessionStartRef.current) sessionStartRef.current = new Date().toISOString()
    const id = setInterval(() => {
      setSecondsLeft((s) => Math.max(0, s - 1))
      if (mode === 'focus') focusSecondsElapsedRef.current += 1
    }, 1000)
    return () => clearInterval(id)
  }, [running, mode])

  useEffect(() => {
    if (secondsLeft !== 0 || !running) return
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setRunning(false)
    if (mode === 'focus') {
      pomodoroCountRef.current += 1
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

  // Flush whatever focus time accumulated as a single session record —
  // fires on Escape/exit-button and on unmount (e.g. navigating away
  // without explicitly closing), so time is never silently lost.
  useEffect(() => {
    return () => {
      if (focusSecondsElapsedRef.current > 0 && sessionStartRef.current) {
        onLogSession(focusSecondsElapsedRef.current, pomodoroCountRef.current, sessionStartRef.current)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleClose = () => {
    if (focusSecondsElapsedRef.current > 0 && sessionStartRef.current) {
      onLogSession(focusSecondsElapsedRef.current, pomodoroCountRef.current, sessionStartRef.current)
      focusSecondsElapsedRef.current = 0
      sessionStartRef.current = null
    }
    onClose()
  }

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') handleClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleNotesChange = (value: string) => {
    setNotes(value)
    if (notesSaveTimer.current) clearTimeout(notesSaveTimer.current)
    notesSaveTimer.current = setTimeout(() => onSaveNotes(value), NOTES_SAVE_DEBOUNCE_MS)
  }

  const resetTimer = () => { setRunning(false); setSecondsLeft(mode === 'focus' ? FOCUS_SECONDS : BREAK_SECONDS) }

  const completedSubtasks = task.subtasks.filter((s) => s.status === 'COMPLETED').length
  const progress = task.subtasks.length > 0
    ? Math.round((completedSubtasks / task.subtasks.length) * 100)
    : (task.status === 'COMPLETED' ? 100 : 0)

  return (
    <div className="focus-mode-overlay" role="dialog" aria-modal="true" aria-label={`Focus mode: ${task.title}`}>
      <button type="button" className="focus-mode-exit" onClick={handleClose} aria-label="Exit focus mode (Esc)"><X size={20} /></button>

      <div className="focus-mode-content">
        <p className="focus-mode-eyebrow">Focus Mode</p>
        <h1>{task.title}</h1>
        {task.description && <p className="focus-mode-notes">{task.description}</p>}

        <div className="focus-mode-progress" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}>
          <div className="focus-mode-progress-bar" style={{ width: `${progress}%` }} />
        </div>
        {task.subtasks.length > 0 && <p className="focus-mode-progress-label">{completedSubtasks} of {task.subtasks.length} subtasks complete</p>}

        <div className="focus-mode-notes-field">
          <label htmlFor="focus-notes-textarea" className="focus-mode-notes-label">Notes</label>
          <textarea
            id="focus-notes-textarea"
            value={notes}
            onChange={(e) => handleNotesChange(e.target.value)}
            placeholder="Jot down anything while you work…"
            rows={3}
          />
        </div>

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
