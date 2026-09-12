import { Fragment, useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { AlertCircle, BellRing, CalendarClock, CheckCircle2, Clock3, ExternalLink, Inbox, ListTodo, Mail, Plus, RefreshCw, Settings2, ShieldCheck, Trash2 } from 'lucide-react'
import { authFetch, jsonHeaders } from '../lib/api'
import './MailActionPage.css'

type Workspace = { id: string; name: string; type?: 'PERSONAL' | 'TEAM' }
type MailCounts = { ACTION_REQUIRED: number; DEADLINE: number; WAITING_REPLY: number; total: number }
type MailAccount = {
  id: string
  email: string
  monitoringEnabled: boolean
  digestEnabled: boolean
  digestHour: number
  followUpDays: number
  timezone: string
  lastSyncedAt: string | null
  lastDigestAt: string | null
  unreadCount: number
}
type MailStatus = {
  configured: { ready: boolean; hasClientId: boolean; hasClientSecret: boolean; hasRedirectUri: boolean; hasEncryptionKey: boolean }
  connected: boolean
  accounts: MailAccount[]
  connection: MailAccount | null
  unreadTotal: number
  counts: MailCounts
}
type MailItem = {
  id: string
  threadId: string
  counterparty: string | null
  subject: string
  snippet: string
  receivedAt: string
  unread: boolean
  kind: 'ACTION_REQUIRED' | 'DEADLINE' | 'WAITING_REPLY'
  confidence: number
  detectedDueAt: string | null
  status: 'OPEN' | 'TASK_CREATED' | 'WAITING_CREATED' | 'DONE' | 'DISMISSED'
  taskId: string | null
  account: { id: string; email: string } | null
  gmailUrl: string
}

type Filter = 'ALL' | MailItem['kind']

const kindLabel: Record<MailItem['kind'], string> = {
  ACTION_REQUIRED: 'Action required',
  DEADLINE: 'Deadline',
  WAITING_REPLY: 'Waiting for reply',
}

const formatDate = (value: string | null) => value
  ? new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(value))
  : 'No detected date'

export default function MailActionPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [status, setStatus] = useState<MailStatus | null>(null)
  const [items, setItems] = useState<MailItem[]>([])
  const [workspaces, setWorkspaces] = useState<Workspace[]>([])
  const [workspaceId, setWorkspaceId] = useState('')
  const [filter, setFilter] = useState<Filter>('ALL')
  const [accountFilter, setAccountFilter] = useState('ALL')
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [settingsAccountId, setSettingsAccountId] = useState('')

  const load = useCallback(async () => {
    setError('')
    try {
      const [mailStatus, workspaceData] = await Promise.all([
        authFetch('/api/mail/status') as Promise<MailStatus>,
        authFetch('/api/workspaces') as Promise<{ workspaces?: Workspace[] }>,
      ])
      setStatus(mailStatus)
      const available = workspaceData.workspaces || []
      setWorkspaces(available)
      if (!workspaceId && available.length) {
        const preferred = available.find((workspace) => workspace.type === 'PERSONAL') || available[0]
        setWorkspaceId(preferred.id)
      }
      if (mailStatus.connected) {
        const data = await authFetch('/api/mail/items?status=OPEN') as { items: MailItem[] }
        setItems(data.items || [])
        const browserTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone
        if (browserTimezone) {
          const mismatched = mailStatus.accounts.filter((account) => account.timezone !== browserTimezone)
          if (mismatched.length) {
            await Promise.all(mismatched.map((account) => authFetch('/api/mail/settings', {
              method: 'PATCH', headers: jsonHeaders,
              body: JSON.stringify({ accountId: account.id, timezone: browserTimezone }),
            })))
            setStatus((current) => current ? {
              ...current,
              accounts: current.accounts.map((account) => ({ ...account, timezone: browserTimezone })),
            } : current)
          }
        }
      } else {
        setItems([])
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load the Personal Action Inbox')
    }
  }, [workspaceId])

  useEffect(() => { void load() }, [load])

  useEffect(() => {
    const gmail = searchParams.get('gmail')
    if (!gmail) return
    if (gmail === 'connected') {
      const account = searchParams.get('account')
      setMessage(account ? `${account} connected. Taskly is monitoring it now.` : 'Gmail connected. Taskly is building your Personal Action Inbox.')
    }
    if (gmail === 'error') setError(searchParams.get('message') || 'Gmail connection failed.')
    setSearchParams({}, { replace: true })
  }, [searchParams, setSearchParams])

  const visibleItems = useMemo(() => items.filter((item) => {
    if (filter !== 'ALL' && item.kind !== filter) return false
    if (accountFilter !== 'ALL' && item.account?.id !== accountFilter) return false
    return true
  }), [accountFilter, filter, items])

  const connect = async () => {
    setBusy('connect'); setError(''); setMessage('')
    try {
      const data = await authFetch('/api/mail/google/connect?returnTo=%2Fapp%2Fmail') as { authorizationUrl: string }
      window.location.assign(data.authorizationUrl)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not start Google connection')
      setBusy('')
    }
  }

  const sync = async (accountId?: string) => {
    setBusy(accountId ? `sync:${accountId}` : 'sync:all'); setError(''); setMessage('')
    try {
      const result = await authFetch('/api/mail/sync', {
        method: 'POST', headers: jsonHeaders,
        body: JSON.stringify(accountId ? { accountId } : {}),
      }) as { newItems: number; scanned: number; email?: string; unreadTotal?: number; unreadCount?: number }
      setMessage(accountId && result.email
        ? `${result.email} checked. ${result.newItems} new actionable item${result.newItems === 1 ? '' : 's'} found.`
        : `All Gmail accounts checked. ${result.newItems} new actionable item${result.newItems === 1 ? '' : 's'} found.`)
      await load()
    } catch (err) { setError(err instanceof Error ? err.message : 'Gmail sync failed') }
    finally { setBusy('') }
  }

  const updateSettings = async (accountId: string, patch: Record<string, unknown>) => {
    setBusy(`settings:${accountId}`); setError('')
    try {
      const updated = await authFetch('/api/mail/settings', {
        method: 'PATCH', headers: jsonHeaders,
        body: JSON.stringify({ accountId, ...patch }),
      }) as MailAccount
      setStatus((current) => current ? {
        ...current,
        accounts: current.accounts.map((account) => account.id === accountId ? { ...account, ...updated } : account),
      } : current)
      setMessage(`Settings updated for ${updated.email}.`)
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not update settings') }
    finally { setBusy('') }
  }

  const disconnect = async (account: MailAccount) => {
    if (!window.confirm(`Disconnect ${account.email} and remove only this account's Taskly mail metadata? Your Gmail messages will not be deleted.`)) return
    setBusy(`disconnect:${account.id}`); setError(''); setMessage('')
    try {
      await authFetch(`/api/mail/google/disconnect/${encodeURIComponent(account.id)}`, { method: 'DELETE' })
      setMessage(`${account.email} disconnected. Other Gmail accounts remain connected.`)
      if (accountFilter === account.id) setAccountFilter('ALL')
      if (settingsAccountId === account.id) setSettingsAccountId('')
      await load()
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not disconnect Gmail') }
    finally { setBusy('') }
  }

  const runItemAction = async (item: MailItem, action: 'task' | 'waiting' | 'DONE' | 'DISMISSED') => {
    if ((action === 'task' || action === 'waiting') && !workspaceId) {
      setError('Choose a workspace first.')
      return
    }
    setBusy(item.id + action); setError(''); setMessage('')
    try {
      if (action === 'task' || action === 'waiting') {
        await authFetch(`/api/mail/items/${encodeURIComponent(item.id)}/${action}`, {
          method: 'POST', headers: jsonHeaders, body: JSON.stringify({ workspaceId }),
        })
        setMessage(action === 'task' ? 'Task created from email.' : 'Follow-up added to Waiting For.')
      } else {
        await authFetch(`/api/mail/items/${encodeURIComponent(item.id)}/status`, {
          method: 'PATCH', headers: jsonHeaders, body: JSON.stringify({ status: action }),
        })
        setMessage(action === 'DONE' ? 'Email action marked done.' : 'Email ignored by Taskly.')
      }
      await load()
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not update email action') }
    finally { setBusy('') }
  }

  if (!status) return <main className="mail-page"><div className="mail-loading">Loading Personal Action Inbox…</div></main>

  return (
    <main className="mail-page">
      <header className="mail-topbar">
        <div>
          <p className="mail-eyebrow">PERSONAL ACTION INBOX</p>
          <h1>Email that turns into action.</h1>
          <p className="mail-subtitle">Connect multiple Gmail accounts. Taskly combines them into one private action inbox while keeping each account independently controllable.</p>
        </div>
        <div className="mail-top-actions">
          <Link className="mail-secondary" to="/app/execution">Execution plan</Link>
          <Link className="mail-secondary" to="/app">Back to Taskly</Link>
        </div>
      </header>

      {error && <div className="mail-alert error"><AlertCircle size={17} /> {error}</div>}
      {message && <div className="mail-alert success"><CheckCircle2 size={17} /> {message}</div>}

      {!status.connected ? (
        <section className="mail-connect-card">
          <div className="mail-connect-icon"><Mail size={34} /></div>
          <div>
            <p className="mail-eyebrow">GOOGLE / GMAIL</p>
            <h2>Connect Gmail to Taskly</h2>
            <p>Taskly requests Gmail read-only access. It cannot send, delete, archive, or modify your email. Only action metadata is saved in Taskly.</p>
            <div className="mail-privacy-points">
              <span><ShieldCheck size={15} /> Refresh tokens encrypted server-side</span>
              <span><Inbox size={15} /> Promotions and social mail excluded from action detection</span>
              <span><Trash2 size={15} /> You can disconnect accounts independently</span>
            </div>
            {!status.configured.ready && <div className="mail-config-warning">Google OAuth server credentials still need to be added before Gmail can connect.</div>}
            <button className="mail-primary" type="button" onClick={() => void connect()} disabled={busy === 'connect' || !status.configured.ready}>
              {busy === 'connect' ? 'Opening Google…' : 'Connect Google Account'}
            </button>
          </div>
        </section>
      ) : (
        <>
          <section className="mail-account-bar">
            <div>
              <span>Connected Gmail accounts</span>
              <strong>{status.accounts.length} account{status.accounts.length === 1 ? '' : 's'} · {status.unreadTotal} unread email{status.unreadTotal === 1 ? '' : 's'}</strong>
              <small>{status.counts.total} email item{status.counts.total === 1 ? '' : 's'} currently need action</small>
            </div>
            <div className="mail-account-actions">
              <button className="mail-secondary" onClick={() => void sync()} disabled={busy === 'sync:all'}><RefreshCw size={15} /> {busy === 'sync:all' ? 'Checking…' : 'Check all'}</button>
              <button className="mail-primary small" onClick={() => void connect()} disabled={busy === 'connect'}><Plus size={15} /> Add Gmail account</button>
            </div>
          </section>

          {status.accounts.map((account) => (
            <Fragment key={account.id}>
              <section className="mail-account-bar">
                <div>
                  <span>Gmail account</span>
                  <strong>{account.email}</strong>
                  <small>{account.unreadCount} unread · {account.lastSyncedAt ? `Last checked ${formatDate(account.lastSyncedAt)}` : 'Initial sync pending'}</small>
                </div>
                <div className="mail-account-actions">
                  <button className="mail-secondary" onClick={() => void sync(account.id)} disabled={busy === `sync:${account.id}`}><RefreshCw size={15} /> {busy === `sync:${account.id}` ? 'Checking…' : 'Check'}</button>
                  <button className="mail-secondary" onClick={() => setSettingsAccountId((value) => value === account.id ? '' : account.id)}><Settings2 size={15} /> Settings</button>
                </div>
              </section>

              {settingsAccountId === account.id && (
                <section className="mail-settings">
                  <label><span>Background monitoring</span><input type="checkbox" checked={account.monitoringEnabled} onChange={(event) => void updateSettings(account.id, { monitoringEnabled: event.target.checked })} /></label>
                  <label><span>Daily Mail Brief</span><input type="checkbox" checked={account.digestEnabled} onChange={(event) => void updateSettings(account.id, { digestEnabled: event.target.checked })} /></label>
                  <label><span>Brief hour</span><input type="number" min={0} max={23} value={account.digestHour} onChange={(event) => void updateSettings(account.id, { digestHour: Number(event.target.value) })} /></label>
                  <label><span>Follow up after days</span><input type="number" min={1} max={30} value={account.followUpDays} onChange={(event) => void updateSettings(account.id, { followUpDays: Number(event.target.value) })} /></label>
                  <button className="mail-danger" type="button" onClick={() => void disconnect(account)} disabled={busy === `disconnect:${account.id}`}>{busy === `disconnect:${account.id}` ? 'Disconnecting…' : `Disconnect ${account.email}`}</button>
                </section>
              )}
            </Fragment>
          ))}

          <section className="mail-metrics">
            <button onClick={() => setFilter('ALL')} className={filter === 'ALL' ? 'active' : ''}><Inbox size={17} /><span>Needs attention</span><strong>{status.counts.total}</strong></button>
            <button onClick={() => setFilter('ACTION_REQUIRED')} className={filter === 'ACTION_REQUIRED' ? 'active' : ''}><ListTodo size={17} /><span>Actions</span><strong>{status.counts.ACTION_REQUIRED}</strong></button>
            <button onClick={() => setFilter('DEADLINE')} className={filter === 'DEADLINE' ? 'active' : ''}><CalendarClock size={17} /><span>Deadlines</span><strong>{status.counts.DEADLINE}</strong></button>
            <button onClick={() => setFilter('WAITING_REPLY')} className={filter === 'WAITING_REPLY' ? 'active' : ''}><Clock3 size={17} /><span>Waiting</span><strong>{status.counts.WAITING_REPLY}</strong></button>
            <button type="button"><Mail size={17} /><span>Total unread</span><strong>{status.unreadTotal}</strong></button>
          </section>

          <section className="mail-workspace-row">
            <div><strong>Filter and destination</strong><span>Email stays private until you choose an action.</span></div>
            <div className="mail-account-actions">
              <select value={accountFilter} onChange={(event) => setAccountFilter(event.target.value)} aria-label="Filter Gmail account">
                <option value="ALL">All Gmail accounts</option>
                {status.accounts.map((account) => <option key={account.id} value={account.id}>{account.email}</option>)}
              </select>
              <select value={workspaceId} onChange={(event) => setWorkspaceId(event.target.value)} aria-label="Destination workspace">
                {workspaces.map((workspace) => <option key={workspace.id} value={workspace.id}>{workspace.name}{workspace.type === 'TEAM' ? ' · Team' : ''}</option>)}
              </select>
            </div>
          </section>

          <section className="mail-items">
            {visibleItems.length === 0 ? (
              <div className="mail-empty"><BellRing size={26} /><h2>Nothing needs attention here.</h2><p>Taskly will keep monitoring your connected Gmail accounts and surface only useful actions.</p></div>
            ) : visibleItems.map((item) => (
              <article className={`mail-item kind-${item.kind.toLowerCase()}`} key={item.id}>
                <div className="mail-item-head">
                  <div>
                    <span className="mail-kind">{kindLabel[item.kind]}</span>
                    {item.unread && <span className="mail-unread">Unread</span>}
                    {item.account && <span className="mail-unread">{item.account.email}</span>}
                  </div>
                  <span className="mail-confidence">{item.confidence}% confidence</span>
                </div>
                <h2>{item.subject}</h2>
                <p className="mail-counterparty">{item.kind === 'WAITING_REPLY' ? `Waiting on ${item.counterparty || 'recipient'}` : item.counterparty || 'Unknown sender'}</p>
                <p className="mail-snippet">{item.snippet}</p>
                <div className="mail-item-meta">
                  <span>{item.detectedDueAt ? `Detected date: ${formatDate(item.detectedDueAt)}` : `Email: ${formatDate(item.receivedAt)}`}</span>
                  <a href={item.gmailUrl} target="_blank" rel="noreferrer">Open Gmail <ExternalLink size={13} /></a>
                </div>
                <div className="mail-item-actions">
                  <button className="mail-primary small" onClick={() => void runItemAction(item, 'task')} disabled={busy.startsWith(item.id)}><ListTodo size={14} /> Create task</button>
                  <button className="mail-secondary small" onClick={() => void runItemAction(item, 'waiting')} disabled={busy.startsWith(item.id)}><Clock3 size={14} /> Track follow-up</button>
                  <button className="mail-secondary small" onClick={() => void runItemAction(item, 'DONE')} disabled={busy.startsWith(item.id)}><CheckCircle2 size={14} /> Done</button>
                  <button className="mail-ghost small" onClick={() => void runItemAction(item, 'DISMISSED')} disabled={busy.startsWith(item.id)}>Ignore</button>
                </div>
              </article>
            ))}
          </section>
        </>
      )}
    </main>
  )
}
