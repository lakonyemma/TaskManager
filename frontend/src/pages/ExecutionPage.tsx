import { type FormEvent, useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { authFetch, jsonHeaders } from '../lib/api'
import './ExecutionPage.css'

type Workspace = { id: string; name: string }
type PlanTask = {
  id: string
  title: string
  priority: string
  dueDate: string | null
  effortMinutes: number
  overflow: boolean
}
type RiskItem = PlanTask & { level: 'CRITICAL' | 'HIGH' | 'MEDIUM'; reason: string }
type WaitingItem = {
  id: string
  title: string
  priority: string
  followUpAt: string | null
}
type ExecutionOverview = {
  generatedAt: string
  attention: { dueToday: number; overdue: number; atRisk: number; followUpsDue: number; total: number }
  todayPlan: { tasks: PlanTask[]; plannedMinutes: number; capacityMinutes: number; overloaded: boolean }
  risks: RiskItem[]
  waiting: WaitingItem[]
  score: {
    score: number
    hasHistory: boolean
    completedLast7Days: number
    onTimeRate: number
    consistencyDays: number
    overdueOpen: number
  }
}

const formatMinutes = (minutes: number) => {
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  if (!hours) return `${rest}m`
  if (!rest) return `${hours}h`
  return `${hours}h ${rest}m`
}

const formatDate = (value: string | null) => {
  if (!value) return 'No date'
  const date = new Date(value)
  return new Intl.DateTimeFormat(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date)
}

export default function ExecutionPage() {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([])
  const [workspaceId, setWorkspaceId] = useState('')
  const [overview, setOverview] = useState<ExecutionOverview | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showWaitingForm, setShowWaitingForm] = useState(false)
  const [waitingTitle, setWaitingTitle] = useState('')
  const [waitingFor, setWaitingFor] = useState('')
  const [followUpAt, setFollowUpAt] = useState('')
  const [priority, setPriority] = useState('MEDIUM')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let active = true
    const loadWorkspaces = async () => {
      try {
        const data = await authFetch('/api/workspaces') as { workspaces?: Workspace[] }
        if (!active) return
        const items = data.workspaces || []
        setWorkspaces(items)
        if (items.length) setWorkspaceId(items[0].id)
        else setLoading(false)
      } catch (err) {
        if (!active) return
        setError(err instanceof Error ? err.message : 'Could not load workspaces')
        setLoading(false)
      }
    }
    void loadWorkspaces()
    return () => { active = false }
  }, [])

  const loadOverview = useCallback(async () => {
    if (!workspaceId) return
    setLoading(true)
    setError('')
    try {
      const data = await authFetch(`/api/execution/overview?workspaceId=${encodeURIComponent(workspaceId)}`) as ExecutionOverview
      setOverview(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load your execution plan')
    } finally {
      setLoading(false)
    }
  }, [workspaceId])

  useEffect(() => {
    void loadOverview()
  }, [loadOverview])

  const capacityPercent = useMemo(() => {
    if (!overview) return 0
    return Math.min(100, Math.round((overview.todayPlan.plannedMinutes / overview.todayPlan.capacityMinutes) * 100))
  }, [overview])

  const createWaitingItem = async (event: FormEvent) => {
    event.preventDefault()
    if (!workspaceId || !waitingTitle.trim()) return
    setSaving(true)
    setError('')
    try {
      await authFetch('/api/execution/waiting', {
        method: 'POST',
        headers: jsonHeaders,
        body: JSON.stringify({
          workspaceId,
          title: waitingTitle.trim(),
          waitingFor: waitingFor.trim() || undefined,
          followUpAt: followUpAt ? new Date(followUpAt).toISOString() : undefined,
          priority,
        }),
      })
      setWaitingTitle('')
      setWaitingFor('')
      setFollowUpAt('')
      setPriority('MEDIUM')
      setShowWaitingForm(false)
      await loadOverview()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create waiting item')
    } finally {
      setSaving(false)
    }
  }

  const resolveWaitingItem = async (id: string) => {
    setError('')
    try {
      await authFetch(`/api/execution/waiting/${encodeURIComponent(id)}/resolve`, { method: 'POST' })
      await loadOverview()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not resolve waiting item')
    }
  }

  return (
    <main className="execution-page">
      <header className="execution-topbar">
        <div>
          <p className="execution-eyebrow">TASKLY EXECUTION</p>
          <h1>Do what matters next.</h1>
          <p className="execution-subtitle">Your deadlines, follow ups, and daily workload in one place.</p>
        </div>
        <div className="execution-topbar-actions">
          {workspaces.length > 1 && (
            <select value={workspaceId} onChange={(event) => setWorkspaceId(event.target.value)} aria-label="Workspace">
              {workspaces.map((workspace) => <option key={workspace.id} value={workspace.id}>{workspace.name}</option>)}
            </select>
          )}
          <Link className="execution-back" to="/app">Back to Taskly</Link>
        </div>
      </header>

      {error && <div className="execution-error" role="alert">{error}</div>}

      {loading && !overview ? (
        <section className="execution-loading">Building your plan…</section>
      ) : !overview ? (
        <section className="execution-empty">Create a workspace first, then Taskly will build your daily plan.</section>
      ) : (
        <>
          <section className="execution-metrics" aria-label="Execution summary">
            <article className="execution-score-card">
              <span>Taskly score</span>
              <strong>{overview.score.score}</strong>
              <small>{overview.score.hasHistory ? `${overview.score.onTimeRate}% on time this week` : 'Build history by finishing tasks'}</small>
            </article>
            <article>
              <span>Needs attention</span>
              <strong>{overview.attention.total}</strong>
              <small>{overview.attention.overdue} overdue, {overview.attention.followUpsDue} follow ups due</small>
            </article>
            <article>
              <span>Planned today</span>
              <strong>{formatMinutes(overview.todayPlan.plannedMinutes)}</strong>
              <small>{formatMinutes(overview.todayPlan.capacityMinutes)} working capacity</small>
            </article>
            <article>
              <span>Deadline risk</span>
              <strong>{overview.risks.length}</strong>
              <small>{overview.risks.filter((item) => item.level === 'CRITICAL').length} critical</small>
            </article>
          </section>

          <section className="execution-grid">
            <article className="execution-panel execution-today">
              <div className="execution-panel-heading">
                <div>
                  <p>Today</p>
                  <h2>Your action plan</h2>
                </div>
                <span className={overview.todayPlan.overloaded ? 'execution-pill danger' : 'execution-pill'}>
                  {capacityPercent}% capacity
                </span>
              </div>
              <div className="execution-capacity"><span style={{ width: `${capacityPercent}%` }} /></div>
              {overview.todayPlan.tasks.length === 0 ? (
                <div className="execution-section-empty">Nothing urgent is competing for your time right now.</div>
              ) : (
                <div className="execution-task-list">
                  {overview.todayPlan.tasks.map((task, index) => (
                    <div className="execution-task" key={task.id}>
                      <span className="execution-rank">{String(index + 1).padStart(2, '0')}</span>
                      <div className="execution-task-copy">
                        <strong>{task.title}</strong>
                        <span>{formatMinutes(task.effortMinutes)} · {task.dueDate ? `Due ${formatDate(task.dueDate)}` : 'No hard deadline'}</span>
                      </div>
                      <span className={`execution-priority priority-${task.priority.toLowerCase()}`}>{task.priority}</span>
                    </div>
                  ))}
                </div>
              )}
            </article>

            <article className="execution-panel">
              <div className="execution-panel-heading">
                <div>
                  <p>Risk radar</p>
                  <h2>Deadlines under pressure</h2>
                </div>
              </div>
              {overview.risks.length === 0 ? (
                <div className="execution-section-empty">No deadlines are showing meaningful risk.</div>
              ) : (
                <div className="execution-risk-list">
                  {overview.risks.slice(0, 6).map((risk) => (
                    <div className="execution-risk" key={risk.id}>
                      <span className={`execution-risk-level risk-${risk.level.toLowerCase()}`}>{risk.level}</span>
                      <div>
                        <strong>{risk.title}</strong>
                        <p>{risk.reason}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </article>
          </section>

          <section className="execution-panel execution-waiting-panel">
            <div className="execution-panel-heading">
              <div>
                <p>Waiting For</p>
                <h2>Things you should not have to remember</h2>
              </div>
              <button className="execution-primary" type="button" onClick={() => setShowWaitingForm((value) => !value)}>
                {showWaitingForm ? 'Close' : 'Add follow up'}
              </button>
            </div>

            {showWaitingForm && (
              <form className="execution-waiting-form" onSubmit={createWaitingItem}>
                <label>
                  What are you waiting for?
                  <input value={waitingTitle} onChange={(event) => setWaitingTitle(event.target.value)} placeholder="Absa API approval" required />
                </label>
                <label>
                  Person or organisation
                  <input value={waitingFor} onChange={(event) => setWaitingFor(event.target.value)} placeholder="Absa developer team" />
                </label>
                <label>
                  Follow up time
                  <input type="datetime-local" value={followUpAt} onChange={(event) => setFollowUpAt(event.target.value)} />
                </label>
                <label>
                  Priority
                  <select value={priority} onChange={(event) => setPriority(event.target.value)}>
                    <option value="LOW">Low</option>
                    <option value="MEDIUM">Medium</option>
                    <option value="HIGH">High</option>
                    <option value="CRITICAL">Critical</option>
                  </select>
                </label>
                <button className="execution-primary" type="submit" disabled={saving}>{saving ? 'Saving…' : 'Track follow up'}</button>
              </form>
            )}

            {overview.waiting.length === 0 ? (
              <div className="execution-section-empty">No open follow ups. Add one when you are waiting on a person, company, approval, payment, or reply.</div>
            ) : (
              <div className="execution-waiting-list">
                {overview.waiting.map((item) => (
                  <div className="execution-waiting-item" key={item.id}>
                    <div>
                      <strong>{item.title}</strong>
                      <span>{item.followUpAt ? `Follow up ${formatDate(item.followUpAt)}` : 'No follow up time set'}</span>
                    </div>
                    <button type="button" onClick={() => void resolveWaitingItem(item.id)}>Resolved</button>
                  </div>
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </main>
  )
}
