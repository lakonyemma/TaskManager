// Shared notification types/constants — split out of NotificationCard.tsx
// so that component file only exports the component (Fast Refresh requires
// files to be component-only-or-not-mixed to hot-reload correctly).
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
