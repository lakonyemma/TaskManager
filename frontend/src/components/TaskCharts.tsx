import {
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip, BarChart, Bar, XAxis, YAxis,
  CartesianGrid, AreaChart, Area,
} from 'recharts'
import './TaskCharts.css'

export type StatusCounts = { total: number; completed: number; inProgress: number; todo: number; overdue: number; review?: number }
export type TrendPoint = { label: string; completed: number }

const STATUS_COLORS = {
  todo: '#38bdf8',
  inProgress: '#fb923c',
  review: '#fbbf24',
  completed: '#34d399',
  overdue: '#f87171',
}

const tooltipStyle = {
  background: 'rgba(16, 21, 46, 0.92)',
  backdropFilter: 'blur(12px)',
  border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: 10,
  padding: '8px 12px',
  fontSize: 12,
  fontWeight: 500,
  color: '#e2e8f0',
  boxShadow: '0 12px 28px -10px rgba(0,0,0,0.55)',
}
const tooltipLabelStyle = { color: '#94a3b8', fontWeight: 600, marginBottom: 4 }

// A soft top-to-bottom sheen on every bar/slice, rather than a flat fill —
// the "premium analytics" texture Stripe/Linear dashboards use so solid
// colors don't read as flat blocks.
const ChartGradientDefs = () => (
  <defs>
    {Object.entries(STATUS_COLORS).map(([key, color]) => (
      <linearGradient key={key} id={`statFill-${key}`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor={color} stopOpacity={1} />
        <stop offset="100%" stopColor={color} stopOpacity={0.55} />
      </linearGradient>
    ))}
  </defs>
)

const KEY_BY_LABEL: Record<string, keyof typeof STATUS_COLORS> = {
  'To Do': 'todo', 'In Progress': 'inProgress', 'Review': 'review', 'Completed': 'completed', 'Overdue': 'overdue',
}

export function StatusDoughnutChart({ counts }: { counts: StatusCounts }) {
  const data = [
    { name: 'To Do', value: counts.todo, color: STATUS_COLORS.todo },
    { name: 'In Progress', value: counts.inProgress, color: STATUS_COLORS.inProgress },
    ...(counts.review ? [{ name: 'Review', value: counts.review, color: STATUS_COLORS.review }] : []),
    { name: 'Completed', value: counts.completed, color: STATUS_COLORS.completed },
    { name: 'Overdue', value: counts.overdue, color: STATUS_COLORS.overdue },
  ]
  const completionPct = counts.total > 0 ? Math.round((counts.completed / counts.total) * 100) : 0

  if (counts.total === 0) return <p className="empty-column">No tasks yet</p>

  return (
    <div className="chart-doughnut-wrap">
      <ResponsiveContainer width="100%" height={200}>
        <PieChart>
          <ChartGradientDefs />
          <Pie data={data} dataKey="value" nameKey="name" innerRadius={58} outerRadius={82} paddingAngle={3} stroke="none" animationDuration={700} animationEasing="ease-out">
            {data.map(d => <Cell key={d.name} fill={`url(#statFill-${KEY_BY_LABEL[d.name]})`} />)}
          </Pie>
          <Tooltip contentStyle={tooltipStyle} labelStyle={tooltipLabelStyle} formatter={(value, name) => [`${value} task${value === 1 ? '' : 's'}`, name]} />
        </PieChart>
      </ResponsiveContainer>
      <div className="chart-doughnut-center">
        <strong>{completionPct}%</strong>
        <span>done</span>
      </div>
    </div>
  )
}

export function StatusBarChart({ counts }: { counts: StatusCounts }) {
  const data = [
    { name: 'To Do', value: counts.todo, key: 'todo' as const },
    { name: 'In Progress', value: counts.inProgress, key: 'inProgress' as const },
    ...(counts.review ? [{ name: 'Review', value: counts.review, key: 'review' as const }] : []),
    { name: 'Completed', value: counts.completed, key: 'completed' as const },
    { name: 'Overdue', value: counts.overdue, key: 'overdue' as const },
  ]
  if (counts.total === 0) return <p className="empty-column">No data</p>

  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={data} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
        <ChartGradientDefs />
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
        <XAxis dataKey="name" tick={{ fill: '#94a3b8', fontSize: 11 }} axisLine={false} tickLine={false} />
        <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
        <Tooltip contentStyle={tooltipStyle} labelStyle={tooltipLabelStyle} cursor={{ fill: 'rgba(255,255,255,0.04)' }} formatter={(value) => [`${value} task${value === 1 ? '' : 's'}`, 'Count']} />
        <Bar dataKey="value" radius={[6, 6, 0, 0]} animationDuration={600} animationEasing="ease-out">
          {data.map(d => <Cell key={d.name} fill={`url(#statFill-${d.key})`} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}

export function CompletionTrendChart({ data }: { data: TrendPoint[] }) {
  const hasData = data.some(d => d.completed > 0)
  if (!hasData) return <p className="empty-column">No completions yet this week</p>

  return (
    <ResponsiveContainer width="100%" height={200}>
      <AreaChart data={data} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
        <defs>
          <linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#C084FC" stopOpacity={0.5} />
            <stop offset="60%" stopColor="#C084FC" stopOpacity={0.12} />
            <stop offset="100%" stopColor="#C084FC" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
        <XAxis dataKey="label" tick={{ fill: '#94a3b8', fontSize: 11 }} axisLine={false} tickLine={false} />
        <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
        <Tooltip contentStyle={tooltipStyle} labelStyle={tooltipLabelStyle} formatter={(value) => [`${value} completed`, '']} />
        <Area type="monotone" dataKey="completed" stroke="#C084FC" strokeWidth={2.5} fill="url(#trendFill)" dot={{ r: 3, fill: '#C084FC', strokeWidth: 0 }} activeDot={{ r: 5, fill: '#C084FC', stroke: '#0c1130', strokeWidth: 2 }} animationDuration={700} animationEasing="ease-out" />
      </AreaChart>
    </ResponsiveContainer>
  )
}
