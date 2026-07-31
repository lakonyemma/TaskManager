import { AtSign, Bell, CheckCircle2, FolderKanban, Megaphone, MessageSquare, RefreshCw, Trash2, UserPlus, Users } from 'lucide-react'
import type { ComponentType } from 'react'

export type NotifType =
  | 'TASK_ASSIGNED' | 'TASK_COMMENTED' | 'TASK_UPDATED' | 'TASK_DELETED' | 'TASK_COMPLETED'
  | 'MENTION' | 'PROJECT_UPDATED' | 'WORKSPACE_INVITED' | 'DUE_DATE_REMINDER' | 'SYSTEM_ANNOUNCEMENT'

export type NotifItem = {
  id: string
  message: string
  isRead: boolean
  createdAt: string
  taskId?: string | null
  workspaceId?: string | null
  type?: NotifType
  task?: { id: string; title: string; status: string } | null
}

export const NOTIF_TYPE_OPTIONS: { value: NotifType; label: string }[] = [
  { value: 'TASK_ASSIGNED', label: 'Task assigned' },
  { value: 'TASK_COMPLETED', label: 'Task completed' },
  { value: 'MENTION', label: 'Mentions' },
  { value: 'TASK_COMMENTED', label: 'Comments' },
  { value: 'TASK_UPDATED', label: 'Task updated' },
  { value: 'TASK_DELETED', label: 'Task deleted' },
  { value: 'PROJECT_UPDATED', label: 'Project updates' },
  { value: 'WORKSPACE_INVITED', label: 'Workspace invitations' },
  { value: 'DUE_DATE_REMINDER', label: 'Due date reminders' },
  { value: 'SYSTEM_ANNOUNCEMENT', label: 'System announcements' },
]

const TYPE_META: Record<string, { icon: ComponentType<{ size?: number; strokeWidth?: number }>; label: string; kind: string }> = {
  TASK_ASSIGNED: { icon: UserPlus, label: 'Task assigned', kind: 'assigned' },
  TASK_COMMENTED: { icon: MessageSquare, label: 'New comment', kind: 'comment' },
  TASK_UPDATED: { icon: RefreshCw, label: 'Task updated', kind: 'updated' },
  TASK_DELETED: { icon: Trash2, label: 'Task deleted', kind: 'deleted' },
  TASK_COMPLETED: { icon: CheckCircle2, label: 'Task completed', kind: 'completed' },
  MENTION: { icon: AtSign, label: 'Mention', kind: 'mention' },
  PROJECT_UPDATED: { icon: FolderKanban, label: 'Project update', kind: 'project' },
  WORKSPACE_INVITED: { icon: Users, label: 'Workspace invite', kind: 'invite' },
  DUE_DATE_REMINDER: { icon: Bell, label: 'Due date reminder', kind: 'reminder' },
  SYSTEM_ANNOUNCEMENT: { icon: Megaphone, label: 'Announcement', kind: 'announcement' },
}
const DEFAULT_META = { icon: Bell, label: 'Notification', kind: 'default' }

const timeAgo = (iso: string) => {
  const diffMs = Date.now() - new Date(iso).getTime()
  const min = Math.round(diffMs / 60000)
  if (min < 1) return 'just now'
  if (min < 60) return `${min}m ago`
  const hr = Math.round(min / 60)
  if (hr < 24) return `${hr}h ago`
  const day = Math.round(hr / 24)
  if (day < 7) return `${day}d ago`
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

export default function NotificationCard({
  notif, compact = false, onOpenTask, onComplete, onMarkRead,
}: {
  notif: NotifItem
  compact?: boolean
  onOpenTask: (n: NotifItem) => void
  onComplete: (n: NotifItem) => void
  onMarkRead: (id: string) => void
}) {
  const meta = (notif.type && TYPE_META[notif.type]) || DEFAULT_META
  const Icon = meta.icon
  const canComplete = !!notif.task && notif.task.status !== 'COMPLETED'

  return (
    <div
      className={`notif-card kind-${meta.kind} ${notif.isRead ? 'read' : 'unread'} ${compact ? 'compact' : ''}`}
      onClick={() => !notif.isRead && onMarkRead(notif.id)}
    >
      <span className="notif-card-icon" aria-hidden="true"><Icon size={compact ? 14 : 16} strokeWidth={1.8} /></span>
      <div className="notif-card-body">
        <div className="notif-card-toprow">
          <span className="notif-card-type">{meta.label}</span>
          <span className="notif-card-time">{timeAgo(notif.createdAt)}</span>
        </div>
        {notif.task?.title && <strong className="notif-card-title">{notif.task.title}</strong>}
        <p className="notif-card-message">{notif.message}</p>
        {(notif.taskId) && (
          <div className="notif-card-actions" onClick={e => e.stopPropagation()}>
            <button type="button" className="notif-card-action" onClick={() => onOpenTask(notif)}>Open task</button>
            {canComplete && (
              <button type="button" className="notif-card-action complete" onClick={() => onComplete(notif)}>
                <CheckCircle2 size={12} strokeWidth={2} /> Complete
              </button>
            )}
          </div>
        )}
      </div>
      {!notif.isRead && <span className="notif-card-dot" aria-hidden="true" />}
    </div>
  )
}
