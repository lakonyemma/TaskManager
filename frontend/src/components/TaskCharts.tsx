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
  background: '#0c1130',
  border: '1px solid rgba(255,255,255,0.12)',
  borderRadius: 8,
  fontSize: 12,
  color: '#e2e8f0',
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
          <Pie data={data} dataKey="value" nameKey="name" innerRadius={58} outerRadius={82} paddingAngle={3} stroke="none">
            {data.map(d => <Cell key={d.name} fill={d.color} />)}
          </Pie>
          <Tooltip contentStyle={tooltipStyle} />
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
    { name: 'To Do', value: counts.todo, fill: STATUS_COLORS.todo },
    { name: 'In Progress', value: counts.inProgress, fill: STATUS_COLORS.inProgress },
    ...(counts.review ? [{ name: 'Review', value: counts.review, fill: STATUS_COLORS.review }] : []),
    { name: 'Completed', value: counts.completed, fill: STATUS_COLORS.completed },
    { name: 'Overdue', value: counts.overdue, fill: STATUS_COLORS.overdue },
  ]
  if (counts.total === 0) return <p className="empty-column">No data</p>

  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={data} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
        <XAxis dataKey="name" tick={{ fill: '#94a3b8', fontSize: 11 }} axisLine={false} tickLine={false} />
        <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
        <Tooltip contentStyle={tooltipStyle} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
        <Bar dataKey="value" radius={[6, 6, 0, 0]}>
          {data.map(d => <Cell key={d.name} fill={d.fill} />)}
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
            <stop offset="0%" stopColor="#C084FC" stopOpacity={0.55} />
            <stop offset="100%" stopColor="#C084FC" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
        <XAxis dataKey="label" tick={{ fill: '#94a3b8', fontSize: 11 }} axisLine={false} tickLine={false} />
        <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
        <Tooltip contentStyle={tooltipStyle} />
        <Area type="monotone" dataKey="completed" stroke="#A855F7" strokeWidth={2} fill="url(#trendFill)" />
      </AreaChart>
    </ResponsiveContainer>
  )
}
