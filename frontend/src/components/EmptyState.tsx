import type { ComponentType, ReactNode } from 'react'
import {
  Bell, CheckCircle2, FolderKanban, Inbox, ListChecks, Search, Sparkles, Trophy, Users,
} from 'lucide-react'

// One consistent illustration language reused across every empty state in
// the app: a soft glowing icon badge rather than painted artwork, so it's
// dark-theme-native and never clashes with the rest of the UI. "kind" maps
// to the flavor of empty state so the icon and glow color always match the
// context (tasks = purple, success = green, notifications = indigo, etc).
const KIND_ICON: Record<string, ComponentType<{ size?: number; strokeWidth?: number }>> = {
  tasks: ListChecks,
  success: CheckCircle2,
  notifications: Bell,
  workspace: FolderKanban,
  team: Users,
  achievements: Trophy,
  search: Search,
  generic: Inbox,
  sparkle: Sparkles,
}

export default function EmptyState({
  kind = 'generic', title, description, action, compact = false,
}: {
  kind?: keyof typeof KIND_ICON
  title: string
  description?: string
  action?: ReactNode
  compact?: boolean
}) {
  const Icon = KIND_ICON[kind] || Inbox
  return (
    <div className={`empty-state ${compact ? 'compact' : ''}`}>
      <div className={`empty-state-badge kind-${kind}`} aria-hidden="true">
        <Icon size={compact ? 20 : 26} strokeWidth={1.6} />
      </div>
      <p className="empty-state-title">{title}</p>
      {description && <p className="empty-state-description">{description}</p>}
      {action && <div className="empty-state-action">{action}</div>}
    </div>
  )
}
