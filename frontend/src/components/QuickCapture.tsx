import { useEffect, useRef, useState } from 'react'
import { Plus, Sparkles } from 'lucide-react'
import { authFetch, jsonHeaders } from '../lib/api'
import Modal from './Modal'

type ParsedTask = {
  title: string
  dueDate: string | null
  hasExplicitTime: boolean
  isRecurring: boolean
  recurrenceRule: 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY' | null
  recurrenceInterval: number | null
  recurrenceDaysOfWeek: number[]
  recurrenceBusinessDaysOnly: boolean
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
}

const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

// Universal quick capture: a floating action button plus a global "c" / ⌘K
// shortcut open a single-field modal anywhere in the app. Typing free text
// gets parsed (debounced) into a structured task preview the user confirms
// before it's actually created — natural-language task creation end to end.
export default function QuickCapture({ workspaces, selectedWorkspaceId, onCreated, onMessage }: {
  workspaces: { id: string; name: string }[]
  selectedWorkspaceId: string
  onCreated: () => void
  onMessage: (msg: string, type?: 'info' | 'success' | 'error') => void
}) {
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const [parsed, setParsed] = useState<ParsedTask | null>(null)
  const [parsing, setParsing] = useState(false)
  const [workspaceId, setWorkspaceId] = useState(selectedWorkspaceId)
  const [saving, setSaving] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { if (open) setWorkspaceId(selectedWorkspaceId) }, [open, selectedWorkspaceId])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      const typing = !!target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setOpen(true)
      } else if (!typing && !open && e.key.toLowerCase() === 'c') {
        e.preventDefault()
        setOpen(true)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open])

  useEffect(() => {
    if (!open) return
    const id = setTimeout(() => inputRef.current?.focus(), 50)
    return () => clearTimeout(id)
  }, [open])

  useEffect(() => {
    if (!text.trim()) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setParsed(null); setParsing(false); return
    }
    setParsing(true)
    const timer = setTimeout(async () => {
      try {
        const d = await authFetch('/api/capture/parse', { method: 'POST', headers: jsonHeaders, body: JSON.stringify({ text }) }) as { parsed: ParsedTask }
        setParsed(d.parsed)
      } catch {
        setParsed(null)
      } finally {
        setParsing(false)
      }
    }, 400)
    return () => clearTimeout(timer)
  }, [text])

  const close = () => { setOpen(false); setText(''); setParsed(null) }

  const handleSave = async () => {
    if (!parsed || !workspaceId) return
    setSaving(true)
    try {
      await authFetch('/api/tasks', {
        method: 'POST', headers: jsonHeaders,
        body: JSON.stringify({
          title: parsed.title, workspaceId, dueDate: parsed.dueDate, priority: parsed.priority,
          isRecurring: parsed.isRecurring, recurrenceRule: parsed.recurrenceRule,
          recurrenceInterval: parsed.recurrenceInterval, recurrenceDaysOfWeek: parsed.recurrenceDaysOfWeek,
          recurrenceBusinessDaysOnly: parsed.recurrenceBusinessDaysOnly,
        }),
      })
      onMessage('Task created', 'success')
      close()
      onCreated()
    } catch (err) {
      onMessage(err instanceof Error ? err.message : 'Unable to create task', 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <button type="button" className="quick-capture-fab" onClick={() => setOpen(true)} aria-label="Quick add task (press C, or ⌘K)" title="Quick add (C)">
        <Plus size={22} strokeWidth={2.2} />
      </button>

      {open && (
        <Modal title="Quick capture" onClose={close}>
          <p style={{ color: '#94a3b8', fontSize: '0.8rem', marginTop: 0 }}>
            Describe the task in plain language — due dates, times, recurrence, and priority are picked up automatically.
          </p>
          <input
            ref={inputRef}
            value={text}
            onChange={e => setText(e.target.value)}
            placeholder='e.g. "Submit assignment next Friday" or "Call Sarah every Monday at 9 AM"'
            aria-label="Task description"
          />

          {parsing && <p className="quick-capture-status">Parsing…</p>}

          {parsed && !parsing && (
            <div className="quick-capture-preview">
              <div className="quick-capture-preview-head"><Sparkles size={14} strokeWidth={1.8} /> Preview</div>
              <div className="quick-capture-field"><span>Title</span><strong>{parsed.title}</strong></div>
              {parsed.dueDate && (
                <div className="quick-capture-field">
                  <span>Due</span>
                  <strong>{parsed.hasExplicitTime ? new Date(parsed.dueDate).toLocaleString() : new Date(parsed.dueDate).toLocaleDateString()}</strong>
                </div>
              )}
              <div className="quick-capture-field"><span>Priority</span><strong className={`priority-badge ${parsed.priority.toLowerCase()}`}>{parsed.priority}</strong></div>
              {parsed.isRecurring && (
                <div className="quick-capture-field">
                  <span>Repeats</span>
                  <strong>
                    Every {parsed.recurrenceInterval && parsed.recurrenceInterval > 1 ? `${parsed.recurrenceInterval} ` : ''}{parsed.recurrenceRule?.toLowerCase()}
                    {parsed.recurrenceDaysOfWeek.length > 0 ? ` (${parsed.recurrenceDaysOfWeek.map(d => WEEKDAY_NAMES[d].slice(0, 3)).join(', ')})` : ''}
                  </strong>
                </div>
              )}
              <label className="quick-capture-field">
                <span>Workspace</span>
                <select value={workspaceId} onChange={e => setWorkspaceId(e.target.value)}>
                  {workspaces.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                </select>
              </label>
              <button type="button" className="primary-btn" onClick={handleSave} disabled={saving || !parsed.title}>
                {saving ? 'Creating…' : 'Create task'}
              </button>
            </div>
          )}
        </Modal>
      )}
    </>
  )
}
