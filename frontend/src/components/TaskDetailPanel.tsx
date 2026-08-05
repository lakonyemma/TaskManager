import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { AlarmClock, Camera as CameraIcon, Clock, Flag, GitBranch, Paperclip, Play, Repeat, Send, Square, Tag as TagIcon, Trash2, X } from 'lucide-react'
import { authFetch, getStoredToken, jsonHeaders } from '../lib/api'
import { REMINDER_OFFSETS, type ReminderSchedule } from '../lib/reminders'
import type { RecurrenceConfig } from '../lib/recurrence'
import DependencyPicker from './DependencyPicker'
import RecurrencePicker from './RecurrencePicker'
import TagBadge, { type TagRef } from './TagBadge'
import CameraCapture from './CameraCapture'

type DepTask = { id: string; title: string; status: string }

type WorkspaceMemberRef = { id: string; firstname: string; lastName: string }

type Comment = {
  id: string
  body: string
  createdAt: string
  mentions?: string[]
  user: { id: string; firstname: string; lastName: string; avatarUrl?: string | null }
}

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const mentionNameOf = (m: WorkspaceMemberRef) => `${m.firstname} ${m.lastName}`
type FileAttachment = {
  id: string
  filename: string
  sizeBytes: number
  createdAt: string
  uploadedBy: { id: string; firstname: string; lastName: string }
}

type TimeEntryItem = {
  id: string
  minutes: number
  note?: string | null
  loggedAt: string
  user: { id: string; firstname: string; lastName: string }
}

const ACTIVE_TIMER_KEY = 'taskly.activeTimer'
const formatMinutes = (mins: number) => mins >= 60 ? `${Math.floor(mins / 60)}h ${mins % 60}m` : `${mins}m`
const formatElapsed = (seconds: number) => {
  const m = Math.floor(seconds / 60).toString().padStart(2, '0')
  const s = Math.floor(seconds % 60).toString().padStart(2, '0')
  return `${m}:${s}`
}

const formatSize = (bytes: number) => (bytes < 1024 * 1024 ? `${Math.round(bytes / 1024)} KB` : `${(bytes / (1024 * 1024)).toFixed(1)} MB`)

export default function TaskDetailPanel({
  taskId, workspaceId, currentUserId, canModerate, onMessage, dueDate, assignedToId,
  dependsOn, blocks, relatedTo, workspaceTasks, recurrence, onTaskUpdated, taskTags, workspaceTags,
  workspaceMembers, milestoneId, workspaceMilestones, onMilestoneChange,
}: {
  taskId: string
  workspaceId: string
  currentUserId: string
  canModerate: boolean
  onMessage: (msg: string, type?: 'info' | 'success' | 'error') => void
  dueDate?: string | null
  assignedToId?: string | null
  dependsOn: DepTask[]
  blocks: DepTask[]
  relatedTo: DepTask[]
  workspaceTasks: DepTask[]
  recurrence: RecurrenceConfig
  onTaskUpdated: () => void
  taskTags: TagRef[]
  workspaceTags: TagRef[]
  workspaceMembers: WorkspaceMemberRef[]
  milestoneId?: string | null
  workspaceMilestones: { id: string; name: string }[]
  onMilestoneChange: (milestoneId: string | null) => void | Promise<void>
}) {
  const [comments, setComments] = useState<Comment[]>([])
  const [newComment, setNewComment] = useState('')
  const [mentionQuery, setMentionQuery] = useState<string | null>(null)
  const [mentionedIds, setMentionedIds] = useState<string[]>([])
  const [files, setFiles] = useState<FileAttachment[]>([])
  const [uploading, setUploading] = useState(false)
  const [showCamera, setShowCamera] = useState(false)
  const [reminders, setReminders] = useState<ReminderSchedule[]>([])
  const [customReminderAt, setCustomReminderAt] = useState('')
  const [recurrenceDraft, setRecurrenceDraft] = useState<RecurrenceConfig>(recurrence)
  const [savingRecurrence, setSavingRecurrence] = useState(false)
  const [timeEntries, setTimeEntries] = useState<TimeEntryItem[]>([])
  const [totalMinutes, setTotalMinutes] = useState(0)
  const [manualMinutes, setManualMinutes] = useState('')
  const [manualNote, setManualNote] = useState('')
  const [timerStartedAt, setTimerStartedAt] = useState<number | null>(null)
  const [elapsedSeconds, setElapsedSeconds] = useState(0)
  const [timerNote, setTimerNote] = useState('')
  const [stoppingTimer, setStoppingTimer] = useState(false)
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setRecurrenceDraft(recurrence) }, [recurrence])

  const loadComments = useCallback(async () => {
    try {
      const d = await authFetch(`/api/tasks/${taskId}/comments`) as { comments: Comment[] }
      setComments(d.comments || [])
    } catch { setComments([]) }
  }, [taskId])

  const loadFiles = useCallback(async () => {
    try {
      const d = await authFetch(`/api/files?workspaceId=${workspaceId}&taskId=${taskId}`) as { files: FileAttachment[] }
      setFiles(d.files || [])
    } catch { setFiles([]) }
  }, [taskId, workspaceId])

  const loadReminders = useCallback(async () => {
    try {
      const d = await authFetch(`/api/reminders/task/${taskId}`) as { reminders: ReminderSchedule[] }
      setReminders(d.reminders || [])
    } catch { setReminders([]) }
  }, [taskId])

  const loadTimeEntries = useCallback(async () => {
    try {
      const d = await authFetch(`/api/tasks/${taskId}/time-entries`) as { entries: TimeEntryItem[]; totalMinutes: number }
      setTimeEntries(d.entries || [])
      setTotalMinutes(d.totalMinutes || 0)
    } catch { setTimeEntries([]); setTotalMinutes(0) }
  }, [taskId])

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { loadComments(); loadFiles(); loadReminders(); loadTimeEntries() }, [loadComments, loadFiles, loadReminders, loadTimeEntries])

  // Resume an in-progress timer if this is the task it was started against
  // (e.g. the task detail modal was closed and reopened while it ran).
  useEffect(() => {
    try {
      const raw = localStorage.getItem(ACTIVE_TIMER_KEY)
      const active = raw ? JSON.parse(raw) as { taskId: string; startedAt: number } : null
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (active && active.taskId === taskId) setTimerStartedAt(active.startedAt)
    } catch { /* ignore malformed localStorage value */ }
  }, [taskId])

  useEffect(() => {
    if (timerStartedAt === null) {
      if (tickRef.current) clearInterval(tickRef.current)
      return
    }
    const tick = () => setElapsedSeconds(Math.max(0, Math.floor((Date.now() - timerStartedAt) / 1000)))
    tick()
    tickRef.current = setInterval(tick, 1000)
    return () => { if (tickRef.current) clearInterval(tickRef.current) }
  }, [timerStartedAt])

  const activeOffsets = reminders.filter(r => r.offsetMinutes != null && r.status === 'PENDING').map(r => r.offsetMinutes as number)
  const canScheduleReminders = !!dueDate && !!assignedToId

  const toggleOffset = async (minutes: number) => {
    const next = activeOffsets.includes(minutes) ? activeOffsets.filter(m => m !== minutes) : [...activeOffsets, minutes]
    try {
      await authFetch(`/api/tasks/${taskId}`, { method: 'PATCH', headers: jsonHeaders, body: JSON.stringify({ reminderOffsets: next }) })
      await loadReminders()
    } catch (err) { onMessage(err instanceof Error ? err.message : 'Unable to update reminders', 'error') }
  }

  const addCustomReminder = async () => {
    if (!customReminderAt) return
    const existingCustom = reminders.filter(r => r.offsetMinutes == null && r.status === 'PENDING' && r.label === 'Custom reminder').map(r => r.remindAt)
    try {
      await authFetch(`/api/tasks/${taskId}`, {
        method: 'PATCH', headers: jsonHeaders,
        body: JSON.stringify({ customReminderTimes: [...existingCustom, new Date(customReminderAt).toISOString()] }),
      })
      setCustomReminderAt('')
      await loadReminders()
      onMessage('Reminder added', 'success')
    } catch (err) { onMessage(err instanceof Error ? err.message : 'Unable to add reminder', 'error') }
  }

  const cancelReminder = async (id: string) => {
    try {
      await authFetch(`/api/reminders/${id}`, { method: 'DELETE' })
      await loadReminders()
    } catch (err) { onMessage(err instanceof Error ? err.message : 'Unable to cancel reminder', 'error') }
  }

  const snoozeReminder = async (id: string) => {
    try {
      await authFetch(`/api/reminders/${id}/snooze`, { method: 'POST', headers: jsonHeaders, body: JSON.stringify({ minutes: 10 }) })
      await loadReminders()
      onMessage('Reminder snoozed for 10 minutes', 'success')
    } catch (err) { onMessage(err instanceof Error ? err.message : 'Unable to snooze reminder', 'error') }
  }

  const toggleTag = async (tagId: string) => {
    const current = taskTags.map(t => t.id)
    const next = current.includes(tagId) ? current.filter(id => id !== tagId) : [...current, tagId]
    try {
      await authFetch(`/api/tasks/${taskId}`, { method: 'PATCH', headers: jsonHeaders, body: JSON.stringify({ tagIds: next }) })
      onTaskUpdated()
    } catch (err) { onMessage(err instanceof Error ? err.message : 'Unable to update tags', 'error') }
  }

  const updateDependsOn = async (ids: string[]) => {
    try {
      await authFetch(`/api/tasks/${taskId}`, { method: 'PATCH', headers: jsonHeaders, body: JSON.stringify({ dependsOn: ids }) })
      onTaskUpdated()
    } catch (err) { onMessage(err instanceof Error ? err.message : 'Unable to update dependencies', 'error') }
  }

  const updateRelatedTo = async (ids: string[]) => {
    try {
      await authFetch(`/api/tasks/${taskId}`, { method: 'PATCH', headers: jsonHeaders, body: JSON.stringify({ relatedTaskIds: ids }) })
      onTaskUpdated()
    } catch (err) { onMessage(err instanceof Error ? err.message : 'Unable to update related tasks', 'error') }
  }

  const saveRecurrence = async () => {
    setSavingRecurrence(true)
    try {
      await authFetch(`/api/tasks/${taskId}`, {
        method: 'PATCH', headers: jsonHeaders,
        body: JSON.stringify({
          isRecurring: recurrenceDraft.isRecurring,
          recurrenceRule: recurrenceDraft.isRecurring ? recurrenceDraft.recurrenceRule : null,
          recurrenceInterval: recurrenceDraft.isRecurring ? recurrenceDraft.recurrenceInterval : null,
          recurrenceDaysOfWeek: recurrenceDraft.isRecurring ? recurrenceDraft.recurrenceDaysOfWeek : [],
          recurrenceBusinessDaysOnly: recurrenceDraft.isRecurring ? recurrenceDraft.recurrenceBusinessDaysOnly : false,
          recurrenceEndDate: recurrenceDraft.isRecurring && recurrenceDraft.recurrenceEndDate ? recurrenceDraft.recurrenceEndDate : null,
          recurrenceCount: recurrenceDraft.isRecurring && recurrenceDraft.recurrenceCount ? recurrenceDraft.recurrenceCount : null,
        }),
      })
      onMessage('Recurrence updated', 'success')
      onTaskUpdated()
    } catch (err) { onMessage(err instanceof Error ? err.message : 'Unable to update recurrence', 'error') }
    finally { setSavingRecurrence(false) }
  }

  const startTimer = () => {
    try {
      const raw = localStorage.getItem(ACTIVE_TIMER_KEY)
      const active = raw ? JSON.parse(raw) as { taskId: string; startedAt: number } : null
      if (active && active.taskId !== taskId) {
        onMessage('A timer is already running on another task — stop it first', 'error')
        return
      }
    } catch { /* malformed stored value — fine to overwrite */ }
    const startedAt = Date.now()
    localStorage.setItem(ACTIVE_TIMER_KEY, JSON.stringify({ taskId, startedAt }))
    setTimerStartedAt(startedAt)
  }

  const stopTimer = async () => {
    if (timerStartedAt === null) return
    const minutes = Math.max(1, Math.round((Date.now() - timerStartedAt) / 60000))
    setStoppingTimer(true)
    try {
      await authFetch(`/api/tasks/${taskId}/time-entries`, {
        method: 'POST', headers: jsonHeaders,
        body: JSON.stringify({ minutes, note: timerNote.trim() || undefined, loggedAt: new Date(timerStartedAt).toISOString() }),
      })
      localStorage.removeItem(ACTIVE_TIMER_KEY)
      setTimerStartedAt(null)
      setElapsedSeconds(0)
      setTimerNote('')
      await loadTimeEntries()
      onMessage(`Logged ${formatMinutes(minutes)}`, 'success')
    } catch (err) { onMessage(err instanceof Error ? err.message : 'Unable to log time', 'error') }
    finally { setStoppingTimer(false) }
  }

  const handleLogTime = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const minutes = Math.round(Number(manualMinutes))
    if (!minutes || minutes < 1) return
    try {
      await authFetch(`/api/tasks/${taskId}/time-entries`, { method: 'POST', headers: jsonHeaders, body: JSON.stringify({ minutes, note: manualNote.trim() || undefined }) })
      setManualMinutes(''); setManualNote('')
      await loadTimeEntries()
      onMessage(`Logged ${formatMinutes(minutes)}`, 'success')
    } catch (err) { onMessage(err instanceof Error ? err.message : 'Unable to log time', 'error') }
  }

  const handleDeleteTimeEntry = async (id: string) => {
    try {
      await authFetch(`/api/time-entries/${id}`, { method: 'DELETE' })
      await loadTimeEntries()
    } catch (err) { onMessage(err instanceof Error ? err.message : 'Unable to delete time entry', 'error') }
  }

  const handleCommentInputChange = (value: string) => {
    setNewComment(value)
    const match = value.match(/(?:^|\s)@([a-zA-Z]*)$/)
    setMentionQuery(match ? match[1] : null)
  }

  const mentionMatches = mentionQuery === null ? [] : workspaceMembers
    .filter(m => m.id !== currentUserId && mentionNameOf(m).toLowerCase().includes(mentionQuery.toLowerCase()))
    .slice(0, 5)

  const selectMention = (member: WorkspaceMemberRef) => {
    setNewComment(prev => prev.replace(/(?:^|\s)@([a-zA-Z]*)$/, match => `${match.startsWith(' ') ? ' ' : ''}@${mentionNameOf(member)} `))
    setMentionedIds(prev => prev.includes(member.id) ? prev : [...prev, member.id])
    setMentionQuery(null)
  }

  const handleAddComment = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!newComment.trim()) return
    // Only send mentions whose "@Full Name" text is still actually present —
    // guards against a stale id if the user deleted the @mention after
    // picking it from the dropdown.
    const activeMentions = mentionedIds.filter(id => {
      const member = workspaceMembers.find(m => m.id === id)
      return member && newComment.includes(`@${mentionNameOf(member)}`)
    })
    try {
      await authFetch(`/api/tasks/${taskId}/comments`, { method: 'POST', headers: jsonHeaders, body: JSON.stringify({ body: newComment, mentions: activeMentions }) })
      setNewComment('')
      setMentionedIds([])
      setMentionQuery(null)
      await loadComments()
    } catch (err) { onMessage(err instanceof Error ? err.message : 'Unable to add comment', 'error') }
  }

  const renderCommentBody = (comment: Comment) => {
    const mentioned = workspaceMembers.filter(m => comment.mentions?.includes(m.id))
    if (!mentioned.length) return comment.body
    const pattern = new RegExp(`(${mentioned.map(m => escapeRegExp(`@${mentionNameOf(m)}`)).join('|')})`, 'g')
    return comment.body.split(pattern).map((part, i) =>
      mentioned.some(m => `@${mentionNameOf(m)}` === part)
        ? <span key={i} className="comment-mention">{part}</span>
        : part,
    )
  }

  const handleDeleteComment = async (id: string) => {
    try {
      await authFetch(`/api/comments/${id}`, { method: 'DELETE' })
      await loadComments()
    } catch (err) { onMessage(err instanceof Error ? err.message : 'Unable to delete comment', 'error') }
  }

  const uploadFile = async (file: File) => {
    setUploading(true)
    try {
      const form = new FormData()
      form.append('file', file)
      form.append('workspaceId', workspaceId)
      form.append('taskId', taskId)
      const token = getStoredToken()
      const response = await fetch('/api/files', { method: 'POST', headers: token ? { Authorization: `Bearer ${token}` } : undefined, body: form })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.message || 'Upload failed')
      await loadFiles()
      onMessage('File uploaded', 'success')
    } catch (err) { onMessage(err instanceof Error ? err.message : 'Unable to upload file', 'error') }
    finally { setUploading(false) }
  }

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    await uploadFile(file)
  }

  const handleDownload = async (file: FileAttachment) => {
    try {
      const token = getStoredToken()
      const response = await fetch(`/api/files/${file.id}/download`, { headers: token ? { Authorization: `Bearer ${token}` } : undefined })
      if (!response.ok) { const data = await response.json().catch(() => ({})); throw new Error(data.message || 'Download failed') }
      const blob = await response.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url; a.download = file.filename
      document.body.appendChild(a); a.click(); a.remove()
      URL.revokeObjectURL(url)
    } catch (err) { onMessage(err instanceof Error ? err.message : 'Unable to download file', 'error') }
  }

  const handleDeleteFile = async (id: string) => {
    try {
      await authFetch(`/api/files/${id}`, { method: 'DELETE' })
      await loadFiles()
    } catch (err) { onMessage(err instanceof Error ? err.message : 'Unable to delete file', 'error') }
  }

  return (
    <div className="comments-section">
      <h3 style={{ display: 'flex', alignItems: 'center', gap: 6 }}><AlarmClock size={14} strokeWidth={1.8} /> Reminders</h3>
      {!canScheduleReminders ? (
        <p className="empty-column">Set a due date and an assignee to schedule reminders.</p>
      ) : (
        <>
          <div className="reminder-chip-row">
            {REMINDER_OFFSETS.map(o => (
              <label key={o.minutes} className={`reminder-chip ${activeOffsets.includes(o.minutes) ? 'active' : ''}`}>
                <input type="checkbox" checked={activeOffsets.includes(o.minutes)} onChange={() => toggleOffset(o.minutes)} />
                {o.label}
              </label>
            ))}
          </div>
          <div className="reminder-custom-row">
            <input type="datetime-local" value={customReminderAt} onChange={e => setCustomReminderAt(e.target.value)} />
            <button type="button" className="mini-btn" onClick={addCustomReminder} disabled={!customReminderAt}>Add custom reminder</button>
          </div>
          {reminders.filter(r => r.status === 'PENDING' || r.status === 'SNOOZED').length > 0 && (
            <div className="reminder-list">
              {reminders.filter(r => r.status === 'PENDING' || r.status === 'SNOOZED').map(r => (
                <div key={r.id} className="reminder-list-item">
                  <span>{r.label} · {new Date(r.remindAt).toLocaleString()}</span>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button type="button" className="mini-btn" onClick={() => snoozeReminder(r.id)}>Snooze</button>
                    <button type="button" className="mini-btn danger-btn" onClick={() => cancelReminder(r.id)}><X size={12} /></button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      <h3 style={{ marginTop: 20, display: 'flex', alignItems: 'center', gap: 6 }}><Flag size={14} strokeWidth={1.8} /> Milestone</h3>
      {workspaceMilestones.length === 0 ? (
        <p className="empty-column">No milestones in this workspace yet — create one from the Team page.</p>
      ) : (
        <select
          value={milestoneId || ''}
          onChange={e => onMilestoneChange(e.target.value || null)}
          aria-label="Milestone"
        >
          <option value="">No milestone</option>
          {workspaceMilestones.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>
      )}

      <h3 style={{ marginTop: 20, display: 'flex', alignItems: 'center', gap: 6 }}><TagIcon size={14} strokeWidth={1.8} /> Tags</h3>
      {workspaceTags.length === 0 ? (
        <p className="empty-column">No tags in this workspace yet — create one from the Team page.</p>
      ) : (
        <div className="tag-row">
          {taskTags.map(tag => <TagBadge key={tag.id} tag={tag} onRemove={() => toggleTag(tag.id)} />)}
          {workspaceTags.filter(tg => !taskTags.some(t => t.id === tg.id)).map(tg => (
            <button key={tg.id} type="button" className="tag-picker-chip" style={{ color: tg.color }} onClick={() => toggleTag(tg.id)}>+ {tg.name}</button>
          ))}
        </div>
      )}

      <h3 style={{ marginTop: 20, display: 'flex', alignItems: 'center', gap: 6 }}><GitBranch size={14} strokeWidth={1.8} /> Dependencies</h3>
      <DependencyPicker taskId={taskId} candidateTasks={workspaceTasks} dependsOn={dependsOn} blocks={blocks} relatedTo={relatedTo} onChange={updateDependsOn} onRelatedChange={updateRelatedTo} />

      <h3 style={{ marginTop: 20, display: 'flex', alignItems: 'center', gap: 6 }}><Repeat size={14} strokeWidth={1.8} /> Recurrence</h3>
      <RecurrencePicker value={recurrenceDraft} onChange={setRecurrenceDraft} />
      <button type="button" className="mini-btn" style={{ marginTop: 8 }} onClick={saveRecurrence} disabled={savingRecurrence}>
        {savingRecurrence ? 'Saving…' : 'Save recurrence'}
      </button>

      <h3 style={{ marginTop: 20, display: 'flex', alignItems: 'center', gap: 6 }}><Clock size={14} strokeWidth={1.8} /> Time Tracking</h3>
      <p className="time-tracking-total">Total logged: <strong>{formatMinutes(totalMinutes)}</strong></p>

      <div className="time-tracking-timer">
        {timerStartedAt === null ? (
          <button type="button" className="mini-btn" onClick={startTimer}><Play size={13} /> Start timer</button>
        ) : (
          <>
            <span className="time-tracking-elapsed">{formatElapsed(elapsedSeconds)}</span>
            <input
              value={timerNote}
              onChange={e => setTimerNote(e.target.value)}
              placeholder="What did you work on? (optional)"
              style={{ flex: 1 }}
            />
            <button type="button" className="mini-btn danger-btn" onClick={stopTimer} disabled={stoppingTimer}>
              <Square size={13} /> {stoppingTimer ? 'Logging…' : 'Stop & log'}
            </button>
          </>
        )}
      </div>

      <form className="time-tracking-manual-form" onSubmit={handleLogTime}>
        <input
          type="number" min={1} step={1} inputMode="numeric"
          value={manualMinutes} onChange={e => setManualMinutes(e.target.value)}
          placeholder="Minutes"
        />
        <input value={manualNote} onChange={e => setManualNote(e.target.value)} placeholder="Note (optional)" style={{ flex: 1 }} />
        <button type="submit" className="mini-btn secondary-btn" disabled={!manualMinutes}>Log time</button>
      </form>

      {timeEntries.length > 0 && (
        <div className="time-entry-list">
          {timeEntries.map(entry => (
            <div key={entry.id} className="time-entry-item">
              <span className="time-entry-minutes">{formatMinutes(entry.minutes)}</span>
              <span className="time-entry-meta">
                {entry.user.firstname} {entry.user.lastName} · {new Date(entry.loggedAt).toLocaleDateString()}
                {entry.note ? ` · ${entry.note}` : ''}
              </span>
              {(entry.user.id === currentUserId || canModerate) && (
                <button type="button" className="mini-btn danger-btn" onClick={() => handleDeleteTimeEntry(entry.id)} aria-label="Delete time entry"><Trash2 size={12} /></button>
              )}
            </div>
          ))}
        </div>
      )}

      <h3 style={{ marginTop: 20 }}>Attachments</h3>
      <div className="attachment-list">
        {files.map(f => (
          <div key={f.id} className="attachment-item">
            <button type="button" className="attachment-name" onClick={() => handleDownload(f)} title="Download">
              <Paperclip size={13} /> {f.filename}
            </button>
            <span className="attachment-meta">{formatSize(f.sizeBytes)}</span>
            {(f.uploadedBy.id === currentUserId || canModerate) && (
              <button type="button" className="mini-btn danger-btn" onClick={() => handleDeleteFile(f.id)}><X size={12} /></button>
            )}
          </div>
        ))}
        {files.length === 0 && <p className="empty-column">No files attached</p>}
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <label className="secondary-btn upload-label">
          {uploading ? 'Uploading…' : 'Attach a file'}
          <input type="file" onChange={handleUpload} disabled={uploading} style={{ display: 'none' }} />
        </label>
        <button type="button" className="mini-btn secondary-btn" onClick={() => setShowCamera(true)} disabled={uploading}>
          <CameraIcon size={13} /> Take photo
        </button>
      </div>
      {showCamera && (
        <CameraCapture onClose={() => setShowCamera(false)} onCapture={async (file) => { setShowCamera(false); await uploadFile(file) }} />
      )}

      <h3 style={{ marginTop: 20 }}>Comments</h3>
      <div className="comment-list">
        {comments.map(c => (
          <div key={c.id} className="comment-item">
            <div className="comment-item-head">
              <strong>{c.user.firstname} {c.user.lastName}</strong>
              <span>{new Date(c.createdAt).toLocaleString()}</span>
              {(c.user.id === currentUserId || canModerate) && (
                <button type="button" className="mini-btn danger-btn" onClick={() => handleDeleteComment(c.id)}><X size={12} /></button>
              )}
            </div>
            <p>{renderCommentBody(c)}</p>
          </div>
        ))}
        {comments.length === 0 && <p className="empty-column">No comments yet</p>}
      </div>
      <form className="comment-form" onSubmit={handleAddComment} style={{ position: 'relative' }}>
        {mentionMatches.length > 0 && (
          <div className="mention-dropdown">
            {mentionMatches.map(m => (
              <button key={m.id} type="button" className="mention-dropdown-item" onClick={() => selectMention(m)}>
                {mentionNameOf(m)}
              </button>
            ))}
          </div>
        )}
        <input
          value={newComment}
          onChange={e => handleCommentInputChange(e.target.value)}
          onKeyDown={e => { if (e.key === 'Escape') setMentionQuery(null) }}
          placeholder="Write a comment… (@ to mention someone)"
        />
        <button type="submit" className="mini-btn" aria-label="Send comment"><Send size={14} /></button>
      </form>
    </div>
  )
}
