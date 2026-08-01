import { useState } from 'react'
import { Bot, CalendarClock, FileText, Loader2, Plus, Search, Send, Sparkles } from 'lucide-react'
import { jsonHeaders } from '../lib/api'
import { TaskListRowStatic } from './TaskListRow'
import EmptyState from './EmptyState'
import type { Task } from '../pages/DashboardApp'

type ChatMessage = { role: 'user' | 'assistant'; text: string }
type TaskProposal = { title: string; description: string | null; priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'; dueDate: string | null }
type Mode = 'ask' | 'search' | 'create'

const QUICK_PROMPTS = [
  { label: 'Daily Planner', prompt: 'Create a prioritized plan for what I should focus on today, given my current tasks.', icon: Sparkles },
  { label: 'Show overdue items', prompt: 'Show overdue items.', icon: CalendarClock },
  { label: 'Project Summary', prompt: "Summarize the current status of this project: what's done, what's in progress, and what's at risk or overdue.", icon: FileText },
]

// AI Productivity Assistant: a Gemini-backed Q&A/search/task-creation layer
// over the workspace's real task data (see backend/features/assistant).
// Every response is grounded in the actual task list the backend sends the
// model — nothing here lets the model invent tasks or dates on its own.
export default function AiAssistantPanel({
  workspaceId, tasks, statusColumns, onSelectTask, onMoveTask, onDeleteTask, onFocusTask, onTaskCreated,
  request, showMessage,
}: {
  workspaceId: string
  tasks: Task[]
  statusColumns: string[]
  onSelectTask: (task: Task) => void
  onMoveTask: (id: string, status: string) => void
  onDeleteTask: (id: string) => void
  onFocusTask: (task: Task) => void
  onTaskCreated: () => void
  request: (input: string, init?: RequestInit) => Promise<unknown>
  showMessage: (msg: string, type?: 'info' | 'success' | 'error') => void
}) {
  const [mode, setMode] = useState<Mode>('ask')

  const [askInput, setAskInput] = useState('')
  const [history, setHistory] = useState<ChatMessage[]>([])
  const [asking, setAsking] = useState(false)

  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<Task[] | null>(null)
  const [searching, setSearching] = useState(false)

  const [createInput, setCreateInput] = useState('')
  const [proposal, setProposal] = useState<TaskProposal | null>(null)
  const [parsing, setParsing] = useState(false)
  const [creating, setCreating] = useState(false)

  const ask = async (message: string, displayText?: string) => {
    if (!message.trim() || asking) return
    setHistory(prev => [...prev, { role: 'user', text: displayText || message }])
    setAskInput('')
    setAsking(true)
    try {
      const d = await request('/api/assistant/ask', { method: 'POST', headers: jsonHeaders, body: JSON.stringify({ message, workspaceId }) }) as { reply: string }
      setHistory(prev => [...prev, { role: 'assistant', text: d.reply }])
    } catch (err) {
      setHistory(prev => [...prev, { role: 'assistant', text: err instanceof Error ? err.message : "Sorry, I couldn't get an answer for that." }])
    } finally {
      setAsking(false)
    }
  }

  const runSearch = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!searchQuery.trim() || searching) return
    setSearching(true)
    setSearchResults(null)
    try {
      const d = await request('/api/assistant/search', { method: 'POST', headers: jsonHeaders, body: JSON.stringify({ query: searchQuery, workspaceId }) }) as { taskIds: string[] }
      const byId = new Map(tasks.map(t => [t.id, t]))
      setSearchResults(d.taskIds.map(id => byId.get(id)).filter((t): t is Task => !!t))
    } catch (err) {
      showMessage(err instanceof Error ? err.message : 'Unable to search right now', 'error')
      setSearchResults([])
    } finally {
      setSearching(false)
    }
  }

  const runParse = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!createInput.trim() || parsing) return
    setParsing(true)
    setProposal(null)
    try {
      const d = await request('/api/assistant/parse-task', { method: 'POST', headers: jsonHeaders, body: JSON.stringify({ description: createInput }) }) as { proposal: TaskProposal }
      setProposal(d.proposal)
    } catch (err) {
      showMessage(err instanceof Error ? err.message : 'Unable to understand that task', 'error')
    } finally {
      setParsing(false)
    }
  }

  const confirmProposal = async () => {
    if (!proposal || !workspaceId) return
    setCreating(true)
    try {
      await request('/api/tasks', {
        method: 'POST', headers: jsonHeaders,
        body: JSON.stringify({
          title: proposal.title, description: proposal.description, priority: proposal.priority,
          dueDate: proposal.dueDate, workspaceId,
        }),
      })
      showMessage('Task created', 'success')
      setProposal(null); setCreateInput('')
      onTaskCreated()
    } catch (err) {
      showMessage(err instanceof Error ? err.message : 'Unable to create task', 'error')
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="ai-assistant-panel">
      <div className="ai-assistant-tabs">
        <button type="button" className={`ai-assistant-tab ${mode === 'ask' ? 'active' : ''}`} onClick={() => setMode('ask')}><Bot size={14} /> Ask</button>
        <button type="button" className={`ai-assistant-tab ${mode === 'search' ? 'active' : ''}`} onClick={() => setMode('search')}><Search size={14} /> Smart Search</button>
        <button type="button" className={`ai-assistant-tab ${mode === 'create' ? 'active' : ''}`} onClick={() => setMode('create')}><Plus size={14} /> Create Task</button>
      </div>

      {mode === 'ask' && (
        <div className="ai-assistant-mode">
          {history.length === 0 && (
            <div className="ai-assistant-quick-prompts">
              {QUICK_PROMPTS.map(p => (
                <button key={p.label} type="button" className="ai-assistant-quick-prompt" onClick={() => ask(p.prompt, p.label)} disabled={asking}>
                  <p.icon size={14} /> {p.label}
                </button>
              ))}
            </div>
          )}
          {history.length > 0 && (
            <div className="ai-assistant-chat">
              {history.map((m, i) => (
                <div key={i} className={`ai-assistant-bubble ${m.role}`}>{m.text}</div>
              ))}
              {asking && <div className="ai-assistant-bubble assistant loading"><Loader2 size={14} className="spin" /> Thinking…</div>}
            </div>
          )}
          <form className="ai-assistant-input-row" onSubmit={e => { e.preventDefault(); ask(askInput) }}>
            <input
              value={askInput}
              onChange={e => setAskInput(e.target.value)}
              placeholder="Ask about your tasks — “what should I focus on today?”"
              disabled={asking}
            />
            <button type="submit" className="mini-btn" disabled={asking || !askInput.trim()}><Send size={13} /></button>
          </form>
        </div>
      )}

      {mode === 'search' && (
        <div className="ai-assistant-mode">
          <form className="ai-assistant-input-row" onSubmit={runSearch}>
            <input
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Describe what you're looking for — “overdue tasks assigned to me”"
              disabled={searching}
            />
            <button type="submit" className="mini-btn" disabled={searching || !searchQuery.trim()}>{searching ? <Loader2 size={13} className="spin" /> : <Search size={13} />}</button>
          </form>
          {searchResults && (
            searchResults.length === 0 ? (
              <EmptyState kind="generic" compact title="No matches" description="Try describing it differently." />
            ) : (
              <div className="ai-assistant-results">
                {searchResults.map(tk => (
                  <TaskListRowStatic key={tk.id} tk={tk} statusColumns={statusColumns} onSelect={onSelectTask} onMove={onMoveTask} onDelete={t => onDeleteTask(t.id)} onFocus={onFocusTask} />
                ))}
              </div>
            )
          )}
        </div>
      )}

      {mode === 'create' && (
        <div className="ai-assistant-mode">
          <form className="ai-assistant-input-row" onSubmit={runParse}>
            <input
              value={createInput}
              onChange={e => setCreateInput(e.target.value)}
              placeholder='Describe the task — “prepare slides for the board meeting next Friday”'
              disabled={parsing}
            />
            <button type="submit" className="mini-btn" disabled={parsing || !createInput.trim()}>{parsing ? <Loader2 size={13} className="spin" /> : <Sparkles size={13} />}</button>
          </form>
          {proposal && (
            <div className="ai-assistant-proposal">
              <label>
                <span>Title</span>
                <input value={proposal.title} onChange={e => setProposal({ ...proposal, title: e.target.value })} />
              </label>
              <label>
                <span>Description</span>
                <input value={proposal.description || ''} onChange={e => setProposal({ ...proposal, description: e.target.value || null })} placeholder="Optional" />
              </label>
              <div className="name-row">
                <label>
                  <span>Priority</span>
                  <select value={proposal.priority} onChange={e => setProposal({ ...proposal, priority: e.target.value as TaskProposal['priority'] })}>
                    <option value="LOW">Low</option>
                    <option value="MEDIUM">Medium</option>
                    <option value="HIGH">High</option>
                    <option value="CRITICAL">Critical</option>
                  </select>
                </label>
                <label>
                  <span>Due date</span>
                  <input type="date" value={proposal.dueDate || ''} onChange={e => setProposal({ ...proposal, dueDate: e.target.value || null })} />
                </label>
              </div>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 8 }}>
                <button type="button" className="mini-btn secondary-btn" onClick={() => setProposal(null)}>Discard</button>
                <button type="button" className="mini-btn" disabled={creating || !proposal.title.trim()} onClick={confirmProposal}>
                  {creating ? 'Creating…' : 'Create task'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
