import { useCallback, useEffect, useRef, useState } from 'react'
import { FileText, FolderKanban, MessageSquare, Search, User as UserIcon, X } from 'lucide-react'
import { authFetch } from '../lib/api'

type SearchResults = {
  tasks: { id: string; title: string; description?: string | null; status: string; priority: string; workspaceId: string }[]
  workspaces: { id: string; name: string; description?: string | null }[]
  comments: { id: string; body: string; taskId: string; task: { title: string; workspaceId: string }; user: { firstname: string; lastName: string } }[]
  members: { id: string; userId: string; workspaceId: string; role: string; user: { firstname: string; lastName: string; email: string } }[]
  files: { id: string; filename: string; taskId?: string | null; workspaceId: string; sizeBytes: number }[]
}

const EMPTY: SearchResults = { tasks: [], workspaces: [], comments: [], members: [], files: [] }
const RECENT_KEY = 'taskly.recentSearches'

const getRecent = (): string[] => {
  try { return JSON.parse(localStorage.getItem(RECENT_KEY) || '[]') } catch { return [] }
}
const pushRecent = (q: string) => {
  const trimmed = q.trim()
  if (!trimmed) return
  const next = [trimmed, ...getRecent().filter(r => r.toLowerCase() !== trimmed.toLowerCase())].slice(0, 6)
  localStorage.setItem(RECENT_KEY, JSON.stringify(next))
}

// Bolds the substring of `text` matching `query` (case-insensitive) — the
// "highlighted matches" requirement. Falls back to plain text if the query
// isn't found (e.g. a match came from a different field).
function Highlight({ text, query }: { text: string; query: string }) {
  if (!query.trim()) return <>{text}</>
  const idx = text.toLowerCase().indexOf(query.trim().toLowerCase())
  if (idx === -1) return <>{text}</>
  return (
    <>
      {text.slice(0, idx)}
      <mark>{text.slice(idx, idx + query.trim().length)}</mark>
      {text.slice(idx + query.trim().length)}
    </>
  )
}

export default function GlobalSearch({
  workspaceId, onOpenTask, onSwitchWorkspace, onGoToMember,
}: {
  workspaceId: string
  onOpenTask: (taskId: string, workspaceId: string) => void
  onSwitchWorkspace: (workspaceId: string) => void
  onGoToMember: () => void
}) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [results, setResults] = useState<SearchResults>(EMPTY)
  const [loading, setLoading] = useState(false)
  const [statusFilter, setStatusFilter] = useState('')
  const [priorityFilter, setPriorityFilter] = useState('')
  const containerRef = useRef<HTMLDivElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const runSearch = useCallback(async (q: string) => {
    if (q.trim().length < 2) { setResults(EMPTY); return }
    setLoading(true)
    try {
      const params = new URLSearchParams({ q, workspaceId })
      if (statusFilter) params.set('status', statusFilter)
      if (priorityFilter) params.set('priority', priorityFilter)
      const d = await authFetch(`/api/search?${params.toString()}`) as SearchResults
      setResults({ tasks: d.tasks || [], workspaces: d.workspaces || [], comments: d.comments || [], members: d.members || [], files: d.files || [] })
    } catch { setResults(EMPTY) } finally { setLoading(false) }
  }, [workspaceId, statusFilter, priorityFilter])

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => runSearch(query), 300)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [query, runSearch])

  useEffect(() => {
    const onClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [])

  const hasQuery = query.trim().length >= 2
  const hasResults = results.tasks.length + results.workspaces.length + results.comments.length + results.members.length + results.files.length > 0
  const recent = getRecent()

  const selectTask = (taskId: string, wsId: string) => {
    pushRecent(query)
    setOpen(false)
    onOpenTask(taskId, wsId)
  }

  return (
    <div className="global-search" ref={containerRef}>
      <div className="global-search-input">
        <Search size={14} strokeWidth={1.8} />
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          onFocus={() => setOpen(true)}
          placeholder="Search tasks, projects, people…"
          aria-label="Search"
        />
        {query && <button type="button" onClick={() => { setQuery(''); setResults(EMPTY) }} aria-label="Clear search"><X size={13} /></button>}
      </div>

      {open && (
        <div className="global-search-dropdown">
          {hasQuery && (
            <div className="global-search-filters">
              <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} aria-label="Filter search by status">
                <option value="">Any status</option>
                <option value="TODO">To Do</option><option value="IN_PROGRESS">In Progress</option>
                <option value="REVIEW">Review</option><option value="COMPLETED">Completed</option>
              </select>
              <select value={priorityFilter} onChange={e => setPriorityFilter(e.target.value)} aria-label="Filter search by priority">
                <option value="">Any priority</option>
                <option value="LOW">Low</option><option value="MEDIUM">Medium</option>
                <option value="HIGH">High</option><option value="CRITICAL">Critical</option>
              </select>
            </div>
          )}

          {!hasQuery && recent.length > 0 && (
            <div className="global-search-section">
              <p className="notif-group-label">Recent searches</p>
              {recent.map(r => (
                <button key={r} type="button" className="global-search-recent" onClick={() => setQuery(r)}>{r}</button>
              ))}
            </div>
          )}

          {hasQuery && loading && <p className="empty-column">Searching…</p>}

          {hasQuery && !loading && !hasResults && <p className="empty-column">No results for "{query}"</p>}

          {hasQuery && !loading && results.tasks.length > 0 && (
            <div className="global-search-section">
              <p className="notif-group-label">Tasks</p>
              {results.tasks.map(t => (
                <button key={t.id} type="button" className="global-search-result" onClick={() => selectTask(t.id, t.workspaceId)}>
                  <strong><Highlight text={t.title} query={query} /></strong>
                  <span className={`priority-badge ${t.priority.toLowerCase()}`}>{t.priority}</span>
                </button>
              ))}
            </div>
          )}

          {hasQuery && !loading && results.workspaces.length > 0 && (
            <div className="global-search-section">
              <p className="notif-group-label">Projects</p>
              {results.workspaces.map(w => (
                <button key={w.id} type="button" className="global-search-result" onClick={() => { pushRecent(query); setOpen(false); onSwitchWorkspace(w.id) }}>
                  <FolderKanban size={13} strokeWidth={1.8} /> <Highlight text={w.name} query={query} />
                </button>
              ))}
            </div>
          )}

          {hasQuery && !loading && results.members.length > 0 && (
            <div className="global-search-section">
              <p className="notif-group-label">Members</p>
              {results.members.map(m => (
                <button key={m.id} type="button" className="global-search-result" onClick={() => { pushRecent(query); setOpen(false); onGoToMember() }}>
                  <UserIcon size={13} strokeWidth={1.8} /> <Highlight text={`${m.user.firstname} ${m.user.lastName}`} query={query} /> <span className="bar-label">{m.user.email}</span>
                </button>
              ))}
            </div>
          )}

          {hasQuery && !loading && results.comments.length > 0 && (
            <div className="global-search-section">
              <p className="notif-group-label">Comments</p>
              {results.comments.map(c => (
                <button key={c.id} type="button" className="global-search-result" onClick={() => selectTask(c.taskId, c.task.workspaceId)}>
                  <MessageSquare size={13} strokeWidth={1.8} /> <Highlight text={c.body} query={query} /> <span className="bar-label">on {c.task.title}</span>
                </button>
              ))}
            </div>
          )}

          {hasQuery && !loading && results.files.length > 0 && (
            <div className="global-search-section">
              <p className="notif-group-label">Files</p>
              {results.files.map(f => (
                <button
                  key={f.id}
                  type="button"
                  className="global-search-result"
                  disabled={!f.taskId}
                  onClick={() => f.taskId && selectTask(f.taskId, f.workspaceId)}
                >
                  <FileText size={13} strokeWidth={1.8} /> <Highlight text={f.filename} query={query} />
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
