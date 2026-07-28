import { AlertTriangle, CheckCircle2, CircleDashed, ListChecks, Loader, User, Users } from 'lucide-react'
import type { ComponentType } from 'react'
import type { StatusCounts } from './TaskCharts'
import './TaskCharts.css'

const STATUS_COLORS = {
  todo: '#38bdf8',
  inProgress: '#fb923c',
  completed: '#34d399',
  overdue: '#f87171',
}

// Split out of TaskCharts.tsx so the stat-card row (plain numbers, no
// charting library) can render immediately without waiting on the recharts
// chunk — recharts alone is ~356KB, the single largest dependency in the
// app, and TaskCharts.tsx pulls it in just by being imported.
export function StatSummaryCards({ counts, myTasks, teamMembers }: { counts: StatusCounts; myTasks?: number; teamMembers?: number }) {
  const cards: { label: string; value: number; color: string; icon: ComponentType<{ size?: number; strokeWidth?: number }> }[] = [
    { label: 'Total', value: counts.total, color: '#f1f5f9', icon: ListChecks },
    { label: 'Completed', value: counts.completed, color: STATUS_COLORS.completed, icon: CheckCircle2 },
    { label: 'In Progress', value: counts.inProgress, color: STATUS_COLORS.inProgress, icon: Loader },
    { label: 'To Do', value: counts.todo, color: STATUS_COLORS.todo, icon: CircleDashed },
    { label: 'Overdue', value: counts.overdue, color: STATUS_COLORS.overdue, icon: AlertTriangle },
  ]
  if (typeof myTasks === 'number') cards.push({ label: 'My Tasks', value: myTasks, color: '#f1f5f9', icon: User })
  if (typeof teamMembers === 'number') cards.push({ label: 'Team members', value: teamMembers, color: '#f1f5f9', icon: Users })

  return (
    <div className="stat-card-grid">
      {cards.map(c => (
        <div key={c.label} className="stat-card">
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
