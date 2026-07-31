import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { AlarmClock, GitBranch, Paperclip, Repeat, Send, Tag as TagIcon, X } from 'lucide-react'
import { authFetch, getStoredToken, jsonHeaders } from '../lib/api'
import { REMINDER_OFFSETS, type ReminderSchedule } from '../lib/reminders'
import type { RecurrenceConfig } from '../lib/recurrence'
import DependencyPicker from './DependencyPicker'
import RecurrencePicker from './RecurrencePicker'
import TagBadge, { type TagRef } from './TagBadge'

type DepTask = { id: string; title: string; status: string }

type Comment = {
  id: string
  body: string
  createdAt: string
  user: { id: string; firstname: string; lastName: string; avatarUrl?: string | null }
}
type FileAttachment = {
  id: string
  filename: string
  sizeBytes: number
  createdAt: string
  uploadedBy: { id: string; firstname: string; lastName: string }
}

const formatSize = (bytes: number) => (bytes < 1024 * 1024 ? `${Math.round(bytes / 1024)} KB` : `${(bytes / (1024 * 1024)).toFixed(1)} MB`)

export default function TaskDetailPanel({
  taskId, workspaceId, currentUserId, canModerate, onMessage, dueDate, assignedToId,
  dependsOn, blocks, workspaceTasks, recurrence, onTaskUpdated, taskTags, workspaceTags,
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
  workspaceTasks: DepTask[]
  recurrence: RecurrenceConfig
  onTaskUpdated: () => void
  taskTags: TagRef[]
  workspaceTags: TagRef[]
}) {
  const [comments, setComments] = useState<Comment[]>([])
  const [newComment, setNewComment] = useState('')
  const [files, setFiles] = useState<FileAttachment[]>([])
  const [uploading, setUploading] = useState(false)
  const [reminders, setReminders] = useState<ReminderSchedule[]>([])
  const [customReminderAt, setCustomReminderAt] = useState('')
  const [recurrenceDraft, setRecurrenceDraft] = useState<RecurrenceConfig>(recurrence)
  const [savingRecurrence, setSavingRecurrence] = useState(false)

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

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { loadComments(); loadFiles(); loadReminders() }, [loadComments, loadFiles, loadReminders])

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

  const handleAddComment = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!newComment.trim()) return
    try {
      await authFetch(`/api/tasks/${taskId}/comments`, { method: 'POST', headers: jsonHeaders, body: JSON.stringify({ body: newComment }) })
      setNewComment('')
      await loadComments()
    } catch (err) { onMessage(err instanceof Error ? err.message : 'Unable to add comment', 'error') }
  }

  const handleDeleteComment = async (id: string) => {
    try {
      await authFetch(`/api/comments/${id}`, { method: 'DELETE' })
      await loadComments()
    } catch (err) { onMessage(err instanceof Error ? err.message : 'Unable to delete comment', 'error') }
  }

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
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
      <DependencyPicker taskId={taskId} candidateTasks={workspaceTasks} dependsOn={dependsOn} blocks={blocks} onChange={updateDependsOn} />

      <h3 style={{ marginTop: 20, display: 'flex', alignItems: 'center', gap: 6 }}><Repeat size={14} strokeWidth={1.8} /> Recurrence</h3>
      <RecurrencePicker value={recurrenceDraft} onChange={setRecurrenceDraft} />
      <button type="button" className="mini-btn" style={{ marginTop: 8 }} onClick={saveRecurrence} disabled={savingRecurrence}>
        {savingRecurrence ? 'Saving…' : 'Save recurrence'}
      </button>

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
      <label className="secondary-btn upload-label">
        {uploading ? 'Uploading…' : 'Attach a file'}
        <input type="file" onChange={handleUpload} disabled={uploading} style={{ display: 'none' }} />
      </label>

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
            <p>{c.body}</p>
          </div>
        ))}
        {comments.length === 0 && <p className="empty-column">No comments yet</p>}
      </div>
      <form className="comment-form" onSubmit={handleAddComment}>
        <input value={newComment} onChange={e => setNewComment(e.target.value)} placeholder="Write a comment…" />
        <button type="submit" className="mini-btn" aria-label="Send comment"><Send size={14} /></button>
      </form>
    </div>
  )
}
