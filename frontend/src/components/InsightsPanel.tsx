import { useCallback, useEffect, useState } from 'react'
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis } from 'recharts'
import { Lightbulb, TrendingUp } from 'lucide-react'
import { authFetch } from '../lib/api'
import { SkeletonChart, SkeletonList } from './Skeleton'

type Insights = {
  mostProductiveHours: { hour: number; count: number }[]
  mostProductiveDays: { day: string; count: number }[]
  completionTrend: { date: string; completed: number }[]
  onTimeRate: number | null
  avgCompletionTimeHours: number | null
  projectHealth: { workspaceId: string; workspaceName: string; total: number; completed: number; completionRate: number; overdueCount: number }[]
  recommendations: string[]
  totalCompleted: number
}

const hourLabel = (hour: number) => hour === 0 ? '12 AM' : hour < 12 ? `${hour} AM` : hour === 12 ? '12 PM' : `${hour - 12} PM`

export default function InsightsPanel() {
  const [data, setData] = useState<Insights | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try { setData(await authFetch('/api/insights') as Insights) }
    catch { setData(null) }
    finally { setLoading(false) }
  }, [])

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load() }, [load])

  if (loading) return <div className="dashboard-grid"><div className="panel full-width"><SkeletonChart /></div><div className="panel"><SkeletonList rows={3} /></div></div>

  if (!data || data.totalCompleted === 0) {
    return <p className="empty-column">Complete a few tasks and your productivity insights will show up here.</p>
  }

  return (
    <div className="dashboard-grid">
      <div className="panel full-width">
        <h2><TrendingUp size={16} strokeWidth={1.8} style={{ verticalAlign: -2 }} /> Completion trend (30 days)</h2>
        <ResponsiveContainer width="100%" height={160}>
          <AreaChart data={data.completionTrend} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="insightsFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#8B5CF6" stopOpacity={0.4} />
                <stop offset="100%" stopColor="#8B5CF6" stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis dataKey="date" tick={{ fill: '#64748b', fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={(d) => new Date(d).getDate().toString()} interval={4} />
            <Tooltip contentStyle={{ background: '#0c1130', border: '1px solid #1e2030', borderRadius: 8, fontSize: '0.78rem' }} labelFormatter={(d) => typeof d === 'string' ? new Date(d).toLocaleDateString() : ''} />
            <Area type="monotone" dataKey="completed" stroke="#8B5CF6" fill="url(#insightsFill)" strokeWidth={2} />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <div className="panel">
        <h2>Most productive hours</h2>
        {data.mostProductiveHours.length === 0 ? <p className="empty-column">Not enough data yet</p> : (
          <div className="task-list">
            {data.mostProductiveHours.map((h) => (
              <div key={h.hour} className="recent-task-item"><strong>{hourLabel(h.hour)}</strong><span>{h.count} tasks completed</span></div>
            ))}
          </div>
        )}
      </div>

      <div className="panel">
        <h2>Most productive days</h2>
        {data.mostProductiveDays.length === 0 ? <p className="empty-column">Not enough data yet</p> : (
          <div className="task-list">
            {data.mostProductiveDays.map((d) => (
              <div key={d.day} className="recent-task-item"><strong>{d.day}</strong><span>{d.count} tasks completed</span></div>
            ))}
          </div>
        )}
      </div>

      <div className="panel">
        <h2>Deadline behavior</h2>
        <div className="task-list">
          <div className="recent-task-item"><strong>On-time rate</strong><span>{data.onTimeRate !== null ? `${data.onTimeRate}%` : '—'}</span></div>
          <div className="recent-task-item"><strong>Avg. time to complete</strong><span>{data.avgCompletionTimeHours !== null ? `${data.avgCompletionTimeHours}h` : '—'}</span></div>
        </div>
      </div>

      <div className="panel">
        <h2>Project health</h2>
        {data.projectHealth.length === 0 ? <p className="empty-column">No projects yet</p> : (
          <div className="task-list">
            {data.projectHealth.map((p) => (
              <div key={p.workspaceId} className="recent-task-item">
                <strong>{p.workspaceName}</strong>
                <span>{p.completionRate}% complete{p.overdueCount > 0 ? ` · ${p.overdueCount} overdue` : ''}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="panel full-width">
        <h2><Lightbulb size={16} strokeWidth={1.8} style={{ verticalAlign: -2 }} /> Recommendations</h2>
        <ul className="insights-recommendations">
          {data.recommendations.map((r, i) => <li key={i}>{r}</li>)}
        </ul>
      </div>
    </div>
  )
}
