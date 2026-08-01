import { useEffect, useRef, useState, type FormEvent } from 'react'
import { FolderPlus, Plus, Sparkles, X } from 'lucide-react'
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
const PRIORITIES: ParsedTask['priority'][] = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']

// Universal quick-create: a floating action button that expands into a
// short glass menu (Task / Workspace — the two entities Taskly actually
// lets you create) rather than jumping straight into task capture. The
// global "c" / ⌘K shortcut still opens task capture directly, unchanged,
// for people who already rely on it — the menu is additive, not a
// replacement for that fast path.
export default function QuickCapture({
  workspaces, selectedWorkspaceId, onCreated, onMessage,
  workspaceName, setWorkspaceName, workspaceDescription, setWorkspaceDescription,
  workspaceTemplates, workspaceTemplateId, setWorkspaceTemplateId, onCreateWorkspace,
}: {
  workspaces: { id: string; name: string }[]
  selectedWorkspaceId: string
  onCreated: () => void
  onMessage: (msg: string, type?: 'info' | 'success' | 'error') => void
  workspaceName: string
  setWorkspaceName: (v: string) => void
  workspaceDescription: string
  setWorkspaceDescription: (v: string) => void
  workspaceTemplates: { id: string; name: string; description: string; taskCount: number }[]
  workspaceTemplateId: string
  setWorkspaceTemplateId: (v: string) => void
  onCreateWorkspace: (e: FormEvent<HTMLFormElement>) => void | Promise<void> | Promise<boolean>
}) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [open, setOpen] = useState(false)
  const [workspaceModalOpen, setWorkspaceModalOpen] = useState(false)
  const [text, setText] = useState('')
  const [parsed, setParsed] = useState<ParsedTask | null>(null)
  const [priority, setPriority] = useState<ParsedTask['priority']>('MEDIUM')
  const [parsing, setParsing] = useState(false)
  const [workspaceId, setWorkspaceId] = useState(selectedWorkspaceId)
  const [saving, setSaving] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const fabRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const firstMenuItemRef = useRef<HTMLButtonElement>(null)

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { if (open) setWorkspaceId(selectedWorkspaceId) }, [open, selectedWorkspaceId])

  // Global shortcuts still jump straight to task capture — the menu never
  // gates the keyboard fast-path.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      const typing = !!target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setMenuOpen(false)
        setOpen(true)
      } else if (!typing && !open && !menuOpen && e.key.toLowerCase() === 'c') {
        e.preventDefault()
        setOpen(true)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, menuOpen])

  // Menu: focus the first item on open, Escape closes and returns focus to
  // the FAB, and a click outside the menu/FAB closes it too.
  useEffect(() => {
    if (!menuOpen) return
    const id = setTimeout(() => firstMenuItemRef.current?.focus(), 10)
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setMenuOpen(false); fabRef.current?.focus() }
    }
    const onClickOutside = (e: MouseEvent) => {
      const target = e.target as Node
      if (menuRef.current?.contains(target) || fabRef.current?.contains(target)) return
      setMenuOpen(false)
    }
    document.addEventListener('keydown', onKeyDown)
    document.addEventListener('mousedown', onClickOutside)
    return () => {
      clearTimeout(id)
      document.removeEventListener('keydown', onKeyDown)
      document.removeEventListener('mousedown', onClickOutside)
    }
  }, [menuOpen])

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
        setPriority(d.parsed.priority)
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
          title: parsed.title, workspaceId, dueDate: parsed.dueDate, priority,
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

  const handleWorkspaceSubmit = async (e: FormEvent<HTMLFormElement>) => {
    await onCreateWorkspace(e)
    setWorkspaceModalOpen(false)
  }

  return (
    <>
      <div className="quick-create">
        {menuOpen && (
          <div className="quick-create-menu" ref={menuRef} role="menu" aria-label="Create new">
            <button
              type="button" role="menuitem" ref={firstMenuItemRef}
              className="quick-create-item"
              onClick={() => { setMenuOpen(false); setOpen(true) }}
            >
              <span className="quick-create-item-icon"><Sparkles size={15} strokeWidth={1.8} /></span>
              Task
            </button>
            <button
              type="button" role="menuitem"
              className="quick-create-item"
              onClick={() => { setMenuOpen(false); setWorkspaceModalOpen(true) }}
            >
              <span className="quick-create-item-icon workspace"><FolderPlus size={15} strokeWidth={1.8} /></span>
              Workspace
            </button>
          </div>
        )}
        <button
          ref={fabRef}
          type="button"
          className={`quick-capture-fab ${menuOpen ? 'open' : ''}`}
          onClick={() => setMenuOpen(v => !v)}
          aria-label="Create new (press C for a quick task, or ⌘K)"
          title="Create (C)"
          aria-haspopup="menu"
          aria-expanded={menuOpen}
        >
          {menuOpen ? <X size={20} strokeWidth={2.2} /> : <Plus size={22} strokeWidth={2.2} />}
        </button>
      </div>

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
              <label className="quick-capture-field">
                <span>Priority</span>
                <select className={`priority-select ${priority.toLowerCase()}`} value={priority} onChange={e => setPriority(e.target.value as ParsedTask['priority'])}>
                  {PRIORITIES.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              </label>
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

      {workspaceModalOpen && (
        <Modal title="New workspace" onClose={() => setWorkspaceModalOpen(false)}>
          <p style={{ color: '#94a3b8', fontSize: '0.8rem', marginTop: 0 }}>
            A workspace is where a set of tasks and teammates live — personal or shared.
          </p>
          <form className="stack-form" onSubmit={handleWorkspaceSubmit}>
            <input value={workspaceName} onChange={e => setWorkspaceName(e.target.value)} placeholder="Workspace name" required autoFocus />
            <input value={workspaceDescription} onChange={e => setWorkspaceDescription(e.target.value)} placeholder="Description (optional)" />
            <label className="quick-capture-field" style={{ marginTop: 4 }}>
              <span>Template</span>
              <select value={workspaceTemplateId} onChange={e => setWorkspaceTemplateId(e.target.value)}>
                <option value="">Blank workspace</option>
                {workspaceTemplates.map(tpl => <option key={tpl.id} value={tpl.id}>{tpl.name}</option>)}
              </select>
            </label>
            {workspaceTemplateId && (
              <p style={{ color: '#94a3b8', fontSize: '0.78rem', margin: '-4px 0 0' }}>
                {workspaceTemplates.find(tpl => tpl.id === workspaceTemplateId)?.description}
              </p>
            )}
            <button type="submit" className="primary-btn">Create workspace</button>
          </form>
        </Modal>
      )}
    </>
  )
}
