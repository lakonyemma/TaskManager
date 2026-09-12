import { type FormEvent, useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import FocusMode, { type FocusTask } from '../components/FocusMode'
import { authFetch, jsonHeaders } from '../lib/api'
import { checkForTasklyUpdate, openTasklyUpdatePage, type TasklyVersionInfo } from '../lib/appUpdate'
import { scheduleNativeExecutionNotifications } from '../lib/nativeRuntime'
import './ExecutionPage.css'
import './ExecutionEnhancements.css'

type Workspace = { id: string; name: string; type?: 'PERSONAL' | 'TEAM' }
type PlanTask = {
  id: string
  title: string
  status: string
  priority: string
  dueDate: string | null
  effortMinutes: number
  overflow: boolean
}
type NextAction = PlanTask & { reason: string }
type RiskItem = PlanTask & {
  level: 'CRITICAL' | 'HIGH' | 'MEDIUM'
  reason: string
  workloadPressurePercent: number
  recommendedStartAt: string
}
type WaitingItem = {
  id: string
  title: string
  priority: string
  followUpAt: string | null
}
type WeeklyReview = {
  completed: number
  onTimeRate: number
  overdueCarried: number
  dueNext7Days: number
  next7DaysMinutes: number
  weekCapacityMinutes: number
  pressurePercent: number
  focusMinutes: number
  recentWins: { id: string; title: string; completedAt: string | null }[]
}
type ExecutionOverview = {
  generatedAt: string
  capacityMinutes: number
  nextAction: NextAction | null
  attention: { dueToday: number; overdue: number; atRisk: number; followUpsDue: number; total: number }
  todayPlan: { tasks: PlanTask[]; plannedMinutes: number; capacityMinutes: number; overloaded: boolean }
  risks: RiskItem[]
  waiting: WaitingItem[]
  weeklyReview: WeeklyReview
  score: {
    score: number
    hasHistory: boolean
    completedLast7Days: number
    onTimeRate: number
    consistencyDays: number
    overdueOpen: number
  }
}
type MailAttention = {
  connected: boolean
  counts: { ACTION_REQUIRED: number; DEADLINE: number; WAITING_REPLY: number; total: number }
}
type UpdateState = {
  currentVersion: string | null
  latest: TasklyVersionInfo
  updateAvailable: boolean
}

const CAPACITY_KEY = 'taskly_capacity_by_weekday'
const overviewCacheKey = (workspaceId: string, capacity: number) => `taskly_execution_${workspaceId}_${capacity}`

const defaultCapacity = () => Array.from({ length: 7 }, () => 360)

const loadCapacity = () => {
  try {
    const raw = localStorage.getItem(CAPACITY_KEY)
    if (!raw) return defaultCapacity()
    const values = JSON.parse(raw) as number[]
    if (!Array.isArray(values) || values.length !== 7) return defaultCapacity()
    return values.map((value) => Math.max(60, Math.min(960, Number(value) || 360)))
  } catch {
    return defaultCapacity()
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
    weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  }).format(date)
}

export default function ExecutionPage() {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([])
  const [workspaceId, setWorkspaceId] = useState('')
  const [overview, setOverview] = useState<ExecutionOverview | null>(null)
  const [mailAttention, setMailAttention] = useState<MailAttention | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [offlineSnapshot, setOfflineSnapshot] = useState(false)
  const [showWaitingForm, setShowWaitingForm] = useState(false)
  const [waitingTitle, setWaitingTitle] = useState('')
  const [waitingFor, setWaitingFor] = useState('')
  const [followUpAt, setFollowUpAt] = useState('')
  const [priority, setPriority] = useState('MEDIUM')
  const [saving, setSaving] = useState(false)
  const [reschedulingId, setReschedulingId] = useState('')
  const [capacityByDay, setCapacityByDay] = useState<number[]>(loadCapacity)
  const [focusTask, setFocusTask] = useState<FocusTask | null>(null)
  const [updateState, setUpdateState] = useState<UpdateState | null>(null)

  const weekday = new Date().getDay()
  const capacityMinutes = capacityByDay[weekday] || 360

  useEffect(() => {
    let active = true
    const loadWorkspaces = async () => {
      try {
        const data = await authFetch('/api/workspaces') as { workspaces?: Workspace[] }
        if (!active) return
        const items = data.workspaces || []
        setWorkspaces(items)
        const preferredWorkspace = items.find((workspace) => workspace.type === 'PERSONAL') || items[0]
        if (preferredWorkspace) setWorkspaceId(preferredWorkspace.id)
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
      const data = await authFetch(`/api/execution/overview?workspaceId=${encodeURIComponent(workspaceId)}&capacityMinutes=${capacityMinutes}`) as ExecutionOverview
      setOverview(data)
      setOfflineSnapshot(false)
      localStorage.setItem(overviewCacheKey(workspaceId, capacityMinutes), JSON.stringify(data))
    } catch (err) {
      try {
        const cached = localStorage.getItem(overviewCacheKey(workspaceId, capacityMinutes))
        if (cached) {
          setOverview(JSON.parse(cached) as ExecutionOverview)
          setOfflineSnapshot(true)
          setError('')
          return
        }
      } catch { /* no usable cached plan */ }
      setError(err instanceof Error ? err.message : 'Could not load your execution plan')
    } finally {
      setLoading(false)
    }
  }, [workspaceId, capacityMinutes])

  useEffect(() => { void loadOverview() }, [loadOverview])

  useEffect(() => {
    if (!overview || offlineSnapshot) return
    void scheduleNativeExecutionNotifications({ nextAction: overview.nextAction, waiting: overview.waiting })
  }, [overview, offlineSnapshot])

  useEffect(() => {
    void checkForTasklyUpdate()
      .then((state) => setUpdateState({ currentVersion: state.currentVersion, latest: state.latest, updateAvailable: state.updateAvailable }))
      .catch(() => {})
  }, [])

  useEffect(() => {
    void authFetch('/api/mail/status')
      .then((data) => setMailAttention(data as MailAttention))
      .catch(() => {})
  }, [])

  const capacityPercent = useMemo(() => {
    if (!overview) return 0
    return Math.min(100, Math.round((overview.todayPlan.plannedMinutes / overview.todayPlan.capacityMinutes) * 100))
  }, [overview])

  const updateTodayCapacity = (value: number) => {
    const next = [...capacityByDay]
    next[weekday] = Math.max(60, Math.min(960, value))
    setCapacityByDay(next)
    localStorage.setItem(CAPACITY_KEY, JSON.stringify(next))
  }

  const createWaitingItem = async (event: FormEvent) => {
    event.preventDefault()
    if (!workspaceId || !waitingTitle.trim()) return
    setSaving(true)
    setError('')
    try {
      await authFetch('/api/execution/waiting', {
        method: 'POST', headers: jsonHeaders,
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
      setNotice('Follow-up tracked. If you left the time blank, Taskly will remind you in three days.')
      await loadOverview()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create waiting item')
    } finally {
      setSaving(false)
    }
  }

  const resolveWaitingItem = async (id: string) => {
    try {
      await authFetch(`/api/execution/waiting/${encodeURIComponent(id)}/resolve`, { method: 'POST' })
      setNotice('Follow-up resolved.')
      await loadOverview()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not resolve waiting item')
    }
  }

  const smartReschedule = async (id: string) => {
    setReschedulingId(id)
    try {
      const data = await authFetch(`/api/execution/tasks/${encodeURIComponent(id)}/reschedule`, {
        method: 'POST', headers: jsonHeaders, body: JSON.stringify({ capacityMinutes }),
      }) as { task: { dueDate: string | null }; suggestion: { reason: string } }
      setNotice(`Moved to ${formatDate(data.task.dueDate)}. ${data.suggestion.reason}`)
      await loadOverview()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not reschedule task')
    } finally {
      setReschedulingId('')
    }
  }

  const beginFocus = (task: PlanTask | NextAction) => {
    setFocusTask({ id: task.id, title: task.title, status: task.status, description: null, notes: null, subtasks: [] })
  }

  const completeFocusTask = async () => {
    if (!focusTask) return
    try {
      await authFetch(`/api/tasks/${focusTask.id}`, { method: 'PATCH', headers: jsonHeaders, body: JSON.stringify({ status: 'COMPLETED' }) })
      setNotice('Task completed.')
      setFocusTask(null)
      await loadOverview()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not complete task')
    }
  }

  const saveFocusNotes = (notes: string) => {
    if (!focusTask || offlineSnapshot) return
    void authFetch(`/api/tasks/${focusTask.id}`, { method: 'PATCH', headers: jsonHeaders, body: JSON.stringify({ notes }) }).catch(() => {})
  }

  const logFocusSession = (durationSeconds: number, pomodoroCount: number, startedAt: string) => {
    if (!focusTask || offlineSnapshot) return
    void authFetch('/api/focus-sessions', {
      method: 'POST', headers: jsonHeaders,
      body: JSON.stringify({ taskId: focusTask.id, durationSeconds, pomodoroCount, startedAt }),
    }).catch(() => {})
  }

  return (
    <main className="execution-page">
      <header className="execution-topbar">
        <div>
          <p className="execution-eyebrow">MY TASKLY</p>
          <h1>Do what matters next.</h1>
          <p className="execution-subtitle">One decision at a time. Taskly protects your deadlines, capacity and follow-ups.</p>
        </div>
        <div className="execution-topbar-actions">
          {workspaces.length > 1 && (
            <select value={workspaceId} onChange={(event) => setWorkspaceId(event.target.value)} aria-label="Workspace">
              {workspaces.map((workspace) => <option key={workspace.id} value={workspace.id}>{workspace.name}{workspace.type === 'TEAM' ? ' · Team' : ''}</option>)}
            </select>
          )}
          <Link className="execution-back" to="/app">Back to Taskly</Link>
        </div>
      </header>

      {offlineSnapshot && <div className="execution-offline">Offline mode: showing your last saved execution plan. Task changes will sync from the main Taskly screen when you reconnect.</div>}
      {error && <div className="execution-error" role="alert">{error}</div>}
      {notice && <div className="execution-notice" role="status">{notice}<button type="button" onClick={() => setNotice('')}>×</button></div>}

      {loading && !overview ? (
        <section className="execution-loading">Building your plan…</section>
      ) : !overview ? (
        <section className="execution-empty">Create a workspace first, then Taskly will build your daily plan.</section>
      ) : (
        <>
          <section className="execution-next-action">
            <div className="execution-next-copy">
              <p>Next Action</p>
              {overview.nextAction ? (
                <>
                  <h2>{overview.nextAction.title}</h2>
                  <span>{overview.nextAction.reason}</span>
                  <small>{formatMinutes(overview.nextAction.effortMinutes)} · {overview.nextAction.dueDate ? `Due ${formatDate(overview.nextAction.dueDate)}` : 'No hard deadline'}</small>
                </>
              ) : (
                <><h2>You are clear.</h2><span>No active task currently needs priority.</span></>
              )}
            </div>
            {overview.nextAction && (
              <button className="execution-primary execution-focus-button" type="button" onClick={() => beginFocus(overview.nextAction!)} disabled={offlineSnapshot}>
                Start Focus
              </button>
            )}
          </section>

          {mailAttention?.connected && (
            <section className={`execution-mail-attention ${mailAttention.counts.total > 0 ? 'has-items' : ''}`}>
              <div>
                <p>Email Attention</p>
                <strong>{mailAttention.counts.total > 0 ? `${mailAttention.counts.total} email item${mailAttention.counts.total === 1 ? '' : 's'} need attention` : 'Your email action inbox is clear.'}</strong>
                <span>{mailAttention.counts.ACTION_REQUIRED} actions · {mailAttention.counts.DEADLINE} deadlines · {mailAttention.counts.WAITING_REPLY} waiting for reply</span>
              </div>
              <Link className="execution-primary" to="/app/mail">Open Personal Action Inbox</Link>
            </section>
          )}

          <section className="execution-settings-row">
            <div>
              <strong>Today’s working capacity</strong>
              <span>Taskly uses this to decide what fits and when a deadline becomes risky.</span>
            </div>
            <label className="execution-capacity-control">
              <input type="range" min="60" max="720" step="30" value={capacityMinutes} onChange={(event) => updateTodayCapacity(Number(event.target.value))} />
              <b>{formatMinutes(capacityMinutes)}</b>
            </label>
          </section>

          <section className="execution-metrics" aria-label="Execution summary">
            <article className="execution-score-card">
              <span>Taskly score</span><strong>{overview.score.score}</strong>
              <small>{overview.score.hasHistory ? `${overview.score.onTimeRate}% on time this week` : 'Build history by finishing tasks'}</small>
            </article>
            <article><span>Needs attention</span><strong>{overview.attention.total}</strong><small>{overview.attention.overdue} overdue, {overview.attention.followUpsDue} follow ups due</small></article>
            <article><span>Planned today</span><strong>{formatMinutes(overview.todayPlan.plannedMinutes)}</strong><small>{formatMinutes(overview.todayPlan.capacityMinutes)} working capacity</small></article>
            <article><span>Deadline risk</span><strong>{overview.risks.length}</strong><small>{overview.risks.filter((item) => item.level === 'CRITICAL').length} critical</small></article>
          </section>

          <section className="execution-grid">
            <article className="execution-panel execution-today">
              <div className="execution-panel-heading">
                <div><p>Today</p><h2>Your action plan</h2></div>
                <span className={overview.todayPlan.overloaded ? 'execution-pill danger' : 'execution-pill'}>{capacityPercent}% capacity</span>
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
                      <div className="execution-task-actions">
                        <span className={`execution-priority priority-${task.priority.toLowerCase()}`}>{task.priority}</span>
                        <button type="button" onClick={() => beginFocus(task)} disabled={offlineSnapshot}>Focus</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </article>

            <article className="execution-panel">
              <div className="execution-panel-heading"><div><p>Risk radar</p><h2>Deadlines under pressure</h2></div></div>
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
                        <small>Pressure {risk.workloadPressurePercent}% · Start by {formatDate(risk.recommendedStartAt)}</small>
                        <button className="execution-reschedule" type="button" disabled={offlineSnapshot || reschedulingId === risk.id} onClick={() => void smartReschedule(risk.id)}>
                          {reschedulingId === risk.id ? 'Moving…' : 'Find a better day'}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </article>
          </section>

          <section className="execution-panel execution-weekly-panel">
            <div className="execution-panel-heading"><div><p>Weekly Review</p><h2>What changed and what is coming</h2></div></div>
            <div className="execution-weekly-grid">
              <div><strong>{overview.weeklyReview.completed}</strong><span>completed</span></div>
              <div><strong>{overview.weeklyReview.onTimeRate}%</strong><span>on time</span></div>
              <div><strong>{formatMinutes(overview.weeklyReview.focusMinutes)}</strong><span>focused</span></div>
              <div><strong>{overview.weeklyReview.overdueCarried}</strong><span>carried overdue</span></div>
              <div><strong>{overview.weeklyReview.dueNext7Days}</strong><span>due next 7 days</span></div>
              <div><strong>{overview.weeklyReview.pressurePercent}%</strong><span>next-week capacity</span></div>
            </div>
            {overview.weeklyReview.recentWins.length > 0 && (
              <div className="execution-wins"><b>Recent wins</b>{overview.weeklyReview.recentWins.map((win) => <span key={win.id}>✓ {win.title}</span>)}</div>
            )}
          </section>

          <section className="execution-panel execution-waiting-panel">
            <div className="execution-panel-heading">
              <div><p>Waiting For</p><h2>Things you should not have to remember</h2></div>
              <button className="execution-primary" type="button" onClick={() => setShowWaitingForm((value) => !value)} disabled={offlineSnapshot}>{showWaitingForm ? 'Close' : 'Add follow up'}</button>
            </div>
            <p className="execution-helper">Leave the follow-up time blank and Taskly automatically checks back in three days. Android reminders use sound and vibration when permission is granted.</p>

            {showWaitingForm && (
              <form className="execution-waiting-form" onSubmit={createWaitingItem}>
                <label>What are you waiting for?<input value={waitingTitle} onChange={(event) => setWaitingTitle(event.target.value)} placeholder="API approval" required /></label>
                <label>Person or organisation<input value={waitingFor} onChange={(event) => setWaitingFor(event.target.value)} placeholder="Support team" /></label>
                <label>Follow up time<input type="datetime-local" value={followUpAt} onChange={(event) => setFollowUpAt(event.target.value)} /></label>
                <label>Priority<select value={priority} onChange={(event) => setPriority(event.target.value)}><option value="LOW">Low</option><option value="MEDIUM">Medium</option><option value="HIGH">High</option><option value="CRITICAL">Critical</option></select></label>
                <button className="execution-primary" type="submit" disabled={saving}>{saving ? 'Saving…' : 'Track follow up'}</button>
              </form>
            )}

            {overview.waiting.length === 0 ? (
              <div className="execution-section-empty">No open follow ups. Add one when you are waiting on a person, company, approval, payment, or reply.</div>
            ) : (
              <div className="execution-waiting-list">
                {overview.waiting.map((item) => (
                  <div className="execution-waiting-item" key={item.id}>
                    <div><strong>{item.title}</strong><span>{item.followUpAt ? `Follow up ${formatDate(item.followUpAt)}` : 'Taskly will assign a follow-up time'}</span></div>
                    <button type="button" disabled={offlineSnapshot} onClick={() => void resolveWaitingItem(item.id)}>Resolved</button>
                  </div>
                ))}
              </div>
            )}
          </section>

          {updateState?.currentVersion && (
            <section className={`execution-update-card ${updateState.updateAvailable ? 'available' : ''}`}>
              <div>
                <p>Android app</p>
                <strong>{updateState.updateAvailable ? `Taskly ${updateState.latest.version} is ready` : `Taskly ${updateState.currentVersion} is up to date`}</strong>
                <span>{updateState.updateAvailable ? updateState.latest.notes : 'Normal Taskly web features update automatically without reinstalling the app.'}</span>
              </div>
              {updateState.updateAvailable && <button className="execution-primary" type="button" onClick={() => void openTasklyUpdatePage(updateState.latest.releaseUrl)}>Install update</button>}
            </section>
          )}
        </>
      )}

      {focusTask && (
        <FocusMode
          task={focusTask}
          onClose={() => setFocusTask(null)}
          onComplete={() => void completeFocusTask()}
          onSubtaskToggle={() => {}}
          onSaveNotes={saveFocusNotes}
          onLogSession={logFocusSession}
          onMessage={(message) => setNotice(message)}
        />
      )}
    </main>
  )
}
