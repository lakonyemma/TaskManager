import { AlertTriangle, CheckCircle2, CircleDashed, FolderKanban, ListChecks, Loader, User, Users } from 'lucide-react'
import type { ComponentType, KeyboardEvent } from 'react'
import type { StatusCounts } from './TaskCharts'
import './TaskCharts.css'

const STATUS_COLORS = {
  todo: '#38bdf8',
  inProgress: '#fb923c',
  completed: '#34d399',
  overdue: '#f87171',
}

export type StatCardKey = 'total' | 'completed' | 'inProgress' | 'todo' | 'overdue' | 'myTasks' | 'teamMembers' | 'projects'

// Split out of TaskCharts.tsx so the stat-card row (plain numbers, no
// charting library) can render immediately without waiting on the recharts
// chunk — recharts alone is ~356KB, the single largest dependency in the
// app, and TaskCharts.tsx pulls it in just by being imported.
export function StatSummaryCards({ counts, myTasks, teamMembers, projects, onCardClick }: {
  counts: StatusCounts
  myTasks?: number
  teamMembers?: number
  projects?: number
  onCardClick?: (key: StatCardKey) => void
}) {
  const cards: { key: StatCardKey; label: string; value: number; color: string; icon: ComponentType<{ size?: number; strokeWidth?: number }> }[] = [
    { key: 'total', label: 'Total', value: counts.total, color: '#f1f5f9', icon: ListChecks },
    { key: 'completed', label: 'Completed', value: counts.completed, color: STATUS_COLORS.completed, icon: CheckCircle2 },
    { key: 'inProgress', label: 'In Progress', value: counts.inProgress, color: STATUS_COLORS.inProgress, icon: Loader },
    { key: 'todo', label: 'To Do', value: counts.todo, color: STATUS_COLORS.todo, icon: CircleDashed },
    { key: 'overdue', label: 'Overdue', value: counts.overdue, color: STATUS_COLORS.overdue, icon: AlertTriangle },
  ]
  if (typeof myTasks === 'number') cards.push({ key: 'myTasks', label: 'My Tasks', value: myTasks, color: '#f1f5f9', icon: User })
  if (typeof projects === 'number') cards.push({ key: 'projects', label: 'Projects', value: projects, color: '#a78bfa', icon: FolderKanban })
  if (typeof teamMembers === 'number') cards.push({ key: 'teamMembers', label: 'Team members', value: teamMembers, color: '#f1f5f9', icon: Users })

  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>, key: StatCardKey) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onCardClick?.(key) }
  }

  return (
    <div className="stat-card-grid">
      {cards.map(c => (
        <div
          key={c.key}
          className={`stat-card ${onCardClick ? 'stat-card-clickable' : ''}`}
          role={onCardClick ? 'button' : undefined}
          tabIndex={onCardClick ? 0 : undefined}
          onClick={onCardClick ? () => onCardClick(c.key) : undefined}
          onKeyDown={onCardClick ? e => handleKeyDown(e, c.key) : undefined}
        >
          <span className="stat-card-icon" style={{ color: c.color, background: `${c.color}1f` }}>
            <c.icon size={15} strokeWidth={2} />
          </span>
          <strong style={{ color: c.color }}>{c.value}</strong>
          <span className="stat-card-label">{c.label}</span>
        </div>
      ))}
    </div>
  )
}
