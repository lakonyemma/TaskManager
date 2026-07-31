import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowLeft, Ban, CheckCircle2, Megaphone, ScrollText, Search, ShieldCheck, Users as UsersIcon,
} from 'lucide-react'
import { authFetch, jsonHeaders } from '../lib/api'
import EmptyState from '../components/EmptyState'
import { useAuth } from '../hooks/useAuth'

type Tab = 'overview' | 'users' | 'workspaces' | 'announcements' | 'audit'

type Analytics = {
  users: { total: number; active: number; suspended: number; newLast30Days: number; signupTrend: { date: string; count: number }[] }
  workspaces: { total: number; active: number; disabled: number }
  tasks: { total: number; completed: number; overdue: number; completionRate: number; byStatus: { status: string; count: number }[] }
  activeLast7Days: number
}
type Health = { status: string; uptimeSeconds: number; dbLatencyMs: number; memoryMb: number; nodeVersion: string; pendingReminders: number; failedLoginsLastHour: number }
type AdminUser = { id: string; firstname: string; lastName: string; email: string; isActive: boolean; isSuperAdmin: boolean; emailVerified: boolean; createdAt: string; _count: { workspaceMembers: number; assignedTasks: number } }
type AdminWorkspace = { id: string; name: string; type: string; isActive: boolean; createdAt: string; _count: { members: number; tasks: number } }
type Announcement = { id: string; title: string; message: string; recipients: number; createdAt: string; sentBy: { firstname: string; lastName: string } }
type AuditEntry = { id: string; action: string; entityType?: string | null; createdAt: string; ipAddress?: string | null; user: { firstname: string; lastName: string; email: string }; workspace?: { name: string } | null }

const formatUptime = (seconds: number) => {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

export default function SuperAdminPage() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const [tab, setTab] = useState<Tab>('overview')
  const [message, setMessage] = useState('')

  const [analytics, setAnalytics] = useState<Analytics | null>(null)
  const [health, setHealth] = useState<Health | null>(null)

  const [users, setUsers] = useState<AdminUser[]>([])
  const [userSearch, setUserSearch] = useState('')
  const [userStatusFilter, setUserStatusFilter] = useState('')

  const [workspaces, setWorkspaces] = useState<AdminWorkspace[]>([])
  const [workspaceSearch, setWorkspaceSearch] = useState('')

  const [announcements, setAnnouncements] = useState<Announcement[]>([])
  const [announceTitle, setAnnounceTitle] = useState('')
  const [announceMessage, setAnnounceMessage] = useState('')

  const [auditLogs, setAuditLogs] = useState<AuditEntry[]>([])

  const showMessage = (msg: string) => { setMessage(msg); setTimeout(() => setMessage(''), 4000) }

  const loadOverview = useCallback(async () => {
    try {
      const [a, h] = await Promise.all([
        authFetch('/api/admin/analytics') as Promise<Analytics>,
        authFetch('/api/admin/health') as Promise<Health>,
      ])
      setAnalytics(a); setHealth(h)
    } catch { setAnalytics(null); setHealth(null) }
  }, [])

  const loadUsers = useCallback(async () => {
    try {
      const params = new URLSearchParams()
      if (userSearch) params.set('search', userSearch)
      if (userStatusFilter) params.set('status', userStatusFilter)
      const d = await authFetch(`/api/admin/users?${params.toString()}`) as { users: AdminUser[] }
      setUsers(d.users || [])
    } catch { setUsers([]) }
  }, [userSearch, userStatusFilter])

  const loadWorkspaces = useCallback(async () => {
    try {
      const params = new URLSearchParams()
      if (workspaceSearch) params.set('search', workspaceSearch)
      const d = await authFetch(`/api/admin/workspaces?${params.toString()}`) as { workspaces: AdminWorkspace[] }
      setWorkspaces(d.workspaces || [])
    } catch { setWorkspaces([]) }
  }, [workspaceSearch])

  const loadAnnouncements = useCallback(async () => {
    try {
      const d = await authFetch('/api/admin/announcements') as { announcements: Announcement[] }
      setAnnouncements(d.announcements || [])
    } catch { setAnnouncements([]) }
  }, [])

  const loadAuditLogs = useCallback(async () => {
    try {
      const d = await authFetch('/api/admin/audit-logs') as { logs: AuditEntry[] }
      setAuditLogs(d.logs || [])
    } catch { setAuditLogs([]) }
  }, [])

  // These loaders' setState calls happen after an await, not synchronously
  // during the effect — safe, but the lint rule can't tell the difference
  // (same pattern/rationale as DashboardApp.tsx's fetch-on-tab effects).
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { loadOverview() }, [loadOverview])
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { if (tab === 'users') loadUsers() }, [tab, loadUsers])
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { if (tab === 'workspaces') loadWorkspaces() }, [tab, loadWorkspaces])
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { if (tab === 'announcements') loadAnnouncements() }, [tab, loadAnnouncements])
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { if (tab === 'audit') loadAuditLogs() }, [tab, loadAuditLogs])

  const handleSuspend = async (id: string) => {
    if (!confirm('Suspend this user? They will be signed out everywhere immediately.')) return
    try {
      await authFetch(`/api/admin/users/${id}/suspend`, { method: 'PATCH' })
      showMessage('User suspended')
      await loadUsers()
    } catch (err) { showMessage(err instanceof Error ? err.message : 'Unable to suspend user') }
  }

  const handleReactivate = async (id: string) => {
    try {
      await authFetch(`/api/admin/users/${id}/reactivate`, { method: 'PATCH' })
      showMessage('User reactivated')
      await loadUsers()
    } catch (err) { showMessage(err instanceof Error ? err.message : 'Unable to reactivate user') }
  }

  const handleDisableWorkspace = async (id: string) => {
    if (!confirm('Disable this workspace? Every member loses access until it is re-enabled.')) return
    try {
      await authFetch(`/api/admin/workspaces/${id}/disable`, { method: 'PATCH' })
      showMessage('Workspace disabled')
      await loadWorkspaces()
    } catch (err) { showMessage(err instanceof Error ? err.message : 'Unable to disable workspace') }
  }

  const handleEnableWorkspace = async (id: string) => {
    try {
      await authFetch(`/api/admin/workspaces/${id}/enable`, { method: 'PATCH' })
      showMessage('Workspace enabled')
      await loadWorkspaces()
    } catch (err) { showMessage(err instanceof Error ? err.message : 'Unable to enable workspace') }
  }

  const handleSendAnnouncement = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!announceTitle.trim() || !announceMessage.trim()) return
    if (!confirm('Send this announcement to every active user on the platform?')) return
    try {
      await authFetch('/api/admin/announcements', { method: 'POST', headers: jsonHeaders, body: JSON.stringify({ title: announceTitle, message: announceMessage }) })
      setAnnounceTitle(''); setAnnounceMessage('')
      showMessage('Announcement sent')
      await loadAnnouncements()
    } catch (err) { showMessage(err instanceof Error ? err.message : 'Unable to send announcement') }
  }

  return (
    <div className="admin-shell">
      <header className="admin-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button type="button" className="mini-btn secondary-btn" onClick={() => navigate('/app')}><ArrowLeft size={14} /> Back to app</button>
          <h1 style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '1.1rem', margin: 0 }}><ShieldCheck size={18} strokeWidth={1.8} /> Super Admin</h1>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span className="bar-label">{user?.firstname} {user?.lastName}</span>
          <button type="button" className="mini-btn secondary-btn" onClick={() => { logout(); navigate('/login') }}>Sign out</button>
        </div>
      </header>

      {message && <div className="admin-toast">{message}</div>}

      <nav className="admin-tabs">
        <button type="button" className={tab === 'overview' ? 'active' : ''} onClick={() => setTab('overview')}>Overview</button>
        <button type="button" className={tab === 'users' ? 'active' : ''} onClick={() => setTab('users')}><UsersIcon size={13} /> Users</button>
        <button type="button" className={tab === 'workspaces' ? 'active' : ''} onClick={() => setTab('workspaces')}>Workspaces</button>
        <button type="button" className={tab === 'announcements' ? 'active' : ''} onClick={() => setTab('announcements')}><Megaphone size={13} /> Announcements</button>
        <button type="button" className={tab === 'audit' ? 'active' : ''} onClick={() => setTab('audit')}><ScrollText size={13} /> Audit Log</button>
      </nav>

      <main className="admin-content">
        {tab === 'overview' && (
          <div className="dashboard-grid">
            <div className="panel full-width">
              <h2>User Analytics</h2>
              <div className="stat-card-grid">
                <div className="stat-card"><strong>{analytics?.users.total ?? '—'}</strong><span className="stat-card-label">Total users</span></div>
                <div className="stat-card"><strong style={{ color: 'var(--success)' }}>{analytics?.users.active ?? '—'}</strong><span className="stat-card-label">Active</span></div>
                <div className="stat-card"><strong style={{ color: 'var(--danger)' }}>{analytics?.users.suspended ?? '—'}</strong><span className="stat-card-label">Suspended</span></div>
                <div className="stat-card"><strong>{analytics?.users.newLast30Days ?? '—'}</strong><span className="stat-card-label">New (30 days)</span></div>
                <div className="stat-card"><strong>{analytics?.activeLast7Days ?? '—'}</strong><span className="stat-card-label">Active (7 days)</span></div>
              </div>
            </div>

            <div className="panel">
              <h2>Workspace Analytics</h2>
              <div className="stat-card-grid">
                <div className="stat-card"><strong>{analytics?.workspaces.total ?? '—'}</strong><span className="stat-card-label">Total</span></div>
                <div className="stat-card"><strong style={{ color: 'var(--success)' }}>{analytics?.workspaces.active ?? '—'}</strong><span className="stat-card-label">Active</span></div>
                <div className="stat-card"><strong style={{ color: 'var(--danger)' }}>{analytics?.workspaces.disabled ?? '—'}</strong><span className="stat-card-label">Disabled</span></div>
              </div>
            </div>

            <div className="panel">
              <h2>Task Analytics</h2>
              <div className="stat-card-grid">
                <div className="stat-card"><strong>{analytics?.tasks.total ?? '—'}</strong><span className="stat-card-label">Total tasks</span></div>
                <div className="stat-card"><strong style={{ color: 'var(--success)' }}>{analytics?.tasks.completionRate ?? '—'}%</strong><span className="stat-card-label">Completion rate</span></div>
                <div className="stat-card"><strong style={{ color: 'var(--danger)' }}>{analytics?.tasks.overdue ?? '—'}</strong><span className="stat-card-label">Overdue</span></div>
              </div>
            </div>

            <div className="panel full-width">
              <h2>System Analytics</h2>
              {health ? (
                <div className="stat-card-grid">
                  <div className="stat-card"><strong style={{ color: 'var(--success)' }}>{health.status}</strong><span className="stat-card-label">Status</span></div>
                  <div className="stat-card"><strong>{formatUptime(health.uptimeSeconds)}</strong><span className="stat-card-label">Uptime</span></div>
                  <div className="stat-card"><strong>{health.dbLatencyMs}ms</strong><span className="stat-card-label">DB latency</span></div>
                  <div className="stat-card"><strong>{health.memoryMb}MB</strong><span className="stat-card-label">Memory (RSS)</span></div>
                  <div className="stat-card"><strong>{health.pendingReminders}</strong><span className="stat-card-label">Pending reminders</span></div>
                  <div className="stat-card"><strong style={{ color: health.failedLoginsLastHour > 20 ? 'var(--danger)' : undefined }}>{health.failedLoginsLastHour}</strong><span className="stat-card-label">Failed logins (1h)</span></div>
                </div>
              ) : <EmptyState kind="generic" compact title="Health check unavailable" />}
            </div>

            <div className="panel full-width">
              <h2>Signups — last 7 days</h2>
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, height: 100 }}>
                {(analytics?.users.signupTrend ?? []).map(d => {
                  const max = Math.max(1, ...(analytics?.users.signupTrend.map(t => t.count) ?? [1]))
                  return (
                    <div key={d.date} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                      <div style={{ width: '100%', height: `${Math.max(4, (d.count / max) * 80)}px`, background: 'var(--accent-gradient)', borderRadius: 4 }} title={`${d.count} signups`} />
                      <span className="bar-label" style={{ fontSize: '0.65rem' }}>{d.date.slice(5)}</span>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        )}

        {tab === 'users' && (
          <div className="panel full-width">
            <div className="stack-form" style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
              <label className="audit-search-input">
                <Search size={14} strokeWidth={1.8} />
                <input value={userSearch} onChange={e => setUserSearch(e.target.value)} placeholder="Search by name or email…" />
              </label>
              <select className="notif-filter-select" value={userStatusFilter} onChange={e => setUserStatusFilter(e.target.value)}>
                <option value="">All statuses</option>
                <option value="active">Active</option>
                <option value="suspended">Suspended</option>
              </select>
            </div>
            {users.length === 0 ? <EmptyState kind="team" compact title="No users found" /> : (
              <div className="task-list">
                {users.map(u => (
                  <div key={u.id} className="task-list-item">
                    <div className="task-list-info">
                      <strong>{u.firstname} {u.lastName} {u.isSuperAdmin && <span className="role-badge admin">Super Admin</span>}</strong>
                      <span>{u.email} · {u._count.workspaceMembers} workspace{u._count.workspaceMembers === 1 ? '' : 's'} · {u._count.assignedTasks} task{u._count.assignedTasks === 1 ? '' : 's'} · Joined {new Date(u.createdAt).toLocaleDateString()}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span className={`status-badge ${u.isActive ? 'completed' : 'blocked'}`}>{u.isActive ? 'Active' : 'Suspended'}</span>
                      {!u.isSuperAdmin && (
                        u.isActive
                          ? <button type="button" className="mini-btn danger-btn" onClick={() => handleSuspend(u.id)}><Ban size={13} /> Suspend</button>
                          : <button type="button" className="mini-btn" onClick={() => handleReactivate(u.id)}><CheckCircle2 size={13} /> Reactivate</button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {tab === 'workspaces' && (
          <div className="panel full-width">
            <div className="stack-form" style={{ flexDirection: 'row', gap: 8, marginBottom: 16 }}>
              <label className="audit-search-input">
                <Search size={14} strokeWidth={1.8} />
                <input value={workspaceSearch} onChange={e => setWorkspaceSearch(e.target.value)} placeholder="Search workspaces…" />
              </label>
            </div>
            {workspaces.length === 0 ? <EmptyState kind="workspace" compact title="No workspaces found" /> : (
              <div className="task-list">
                {workspaces.map(w => (
                  <div key={w.id} className="task-list-item">
                    <div className="task-list-info">
                      <strong>{w.name}</strong>
                      <span>{w.type} · {w._count.members} member{w._count.members === 1 ? '' : 's'} · {w._count.tasks} task{w._count.tasks === 1 ? '' : 's'} · Created {new Date(w.createdAt).toLocaleDateString()}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span className={`status-badge ${w.isActive ? 'completed' : 'blocked'}`}>{w.isActive ? 'Active' : 'Disabled'}</span>
                      {w.isActive
                        ? <button type="button" className="mini-btn danger-btn" onClick={() => handleDisableWorkspace(w.id)}><Ban size={13} /> Disable</button>
                        : <button type="button" className="mini-btn" onClick={() => handleEnableWorkspace(w.id)}><CheckCircle2 size={13} /> Enable</button>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {tab === 'announcements' && (
          <div className="dashboard-grid">
            <div className="panel">
              <h2>Send announcement</h2>
              <p style={{ color: '#94a3b8', fontSize: '0.8rem', marginTop: 0 }}>Delivered as a system notification to every active user on the platform.</p>
              <form className="stack-form" onSubmit={handleSendAnnouncement}>
                <input value={announceTitle} onChange={e => setAnnounceTitle(e.target.value)} placeholder="Title" required maxLength={100} />
                <textarea value={announceMessage} onChange={e => setAnnounceMessage(e.target.value)} placeholder="Message" required rows={4} />
                <button type="submit">Send to all users</button>
              </form>
            </div>
            <div className="panel">
              <h2>History</h2>
              {announcements.length === 0 ? <EmptyState kind="generic" compact title="No announcements sent yet" /> : (
                <div className="task-list">
                  {announcements.map(a => (
                    <div key={a.id} className="task-list-item">
                      <div className="task-list-info">
                        <strong>{a.title}</strong>
                        <span>{a.message} · {a.recipients} recipients · by {a.sentBy.firstname} {a.sentBy.lastName}</span>
                      </div>
                      <span className="bar-label">{new Date(a.createdAt).toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {tab === 'audit' && (
          <div className="panel full-width">
            <h2>Platform-wide audit log</h2>
            {auditLogs.length === 0 ? <EmptyState kind="activity" compact title="No audit entries" /> : (
              <div className="task-list">
                {auditLogs.map(entry => (
                  <div key={entry.id} className="task-list-item">
                    <div className="task-list-info">
                      <strong>{entry.action}</strong>
                      <span>{entry.user.firstname} {entry.user.lastName} ({entry.user.email}){entry.workspace ? ` · ${entry.workspace.name}` : ''}{entry.ipAddress ? ` · ${entry.ipAddress}` : ''}</span>
                    </div>
                    <span className="bar-label">{new Date(entry.createdAt).toLocaleString()}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  )
}
