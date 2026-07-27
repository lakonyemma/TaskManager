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
  const cards = [
    { label: 'Total', value: counts.total, color: '#f1f5f9' },
    { label: 'Completed', value: counts.completed, color: STATUS_COLORS.completed },
    { label: 'In Progress', value: counts.inProgress, color: STATUS_COLORS.inProgress },
    { label: 'To Do', value: counts.todo, color: STATUS_COLORS.todo },
    { label: 'Overdue', value: counts.overdue, color: STATUS_COLORS.overdue },
  ]
  if (typeof myTasks === 'number') cards.push({ label: 'My Tasks', value: myTasks, color: '#f1f5f9' })
  if (typeof teamMembers === 'number') cards.push({ label: 'Team members', value: teamMembers, color: '#f1f5f9' })

  return (
    <div className="stat-card-grid">
      {cards.map(c => (
        <div key={c.label} className="stat-card">
          <strong style={{ color: c.color }}>{c.value}</strong>
          <span>{c.label}</span>
        </div>
      ))}
    </div>
  )
}
