import { Bell, CheckCircle2, MessageSquare, RefreshCw, Trash2, UserPlus, Users } from 'lucide-react'
import type { ComponentType } from 'react'

export type NotifItem = {
  id: string
  message: string
  isRead: boolean
  createdAt: string
  taskId?: string | null
  workspaceId?: string | null
  type?: 'TASK_ASSIGNED' | 'TASK_COMMENTED' | 'TASK_UPDATED' | 'TASK_DELETED' | 'WORKSPACE_INVITED' | 'DUE_DATE_REMINDER'
  task?: { id: string; title: string; status: string } | null
}

const TYPE_META: Record<string, { icon: ComponentType<{ size?: number; strokeWidth?: number }>; label: string; kind: string }> = {
  TASK_ASSIGNED: { icon: UserPlus, label: 'Task assigned', kind: 'assigned' },
  TASK_COMMENTED: { icon: MessageSquare, label: 'New comment', kind: 'comment' },
  TASK_UPDATED: { icon: RefreshCw, label: 'Task updated', kind: 'updated' },
  TASK_DELETED: { icon: Trash2, label: 'Task deleted', kind: 'deleted' },
  WORKSPACE_INVITED: { icon: Users, label: 'Workspace invite', kind: 'invite' },
  DUE_DATE_REMINDER: { icon: Bell, label: 'Due date reminder', kind: 'reminder' },
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
