import { useCallback, useEffect, useState } from 'react'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { AlertTriangle } from 'lucide-react'
import { authFetch } from '../lib/api'
import { SkeletonChart } from './Skeleton'

type Granularity = 'daily' | 'weekly' | 'monthly'
type Bucket = { date: string; taskCount: number; estimatedMinutes: number; completedCount: number }
type Assignee = { userId: string; name: string; taskCount: number; estimatedMinutes: number }
type WorkloadResponse = { series: Bucket[]; bottlenecks: Bucket[]; byAssignee: Assignee[] }

const TOOLTIP_STYLE = { background: '#0c1130', border: '1px solid #1e2030', borderRadius: 8, fontSize: '0.78rem', color: '#e2e8f0' }

const formatLabel = (date: string, granularity: Granularity) => {
  if (granularity === 'monthly') return new Date(`${date}-01`).toLocaleDateString(undefined, { month: 'short', year: '2-digit' })
  return new Date(date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

const formatHours = (minutes: number) => `${(minutes / 60).toFixed(1)}h`

export default function WorkloadCharts({ workspaceId, canSeeTeam, currentUserId }: {
  workspaceId: string
  canSeeTeam: boolean
  currentUserId: string
}) {
  const [granularity, setGranularity] = useState<Granularity>('daily')
  const [scope, setScope] = useState<'individual' | 'team'>('individual')
  const [data, setData] = useState<WorkloadResponse | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    if (!workspaceId) return
    setLoading(true)
    try {
      const d = await authFetch(`/api/workload?workspaceId=${workspaceId}&granularity=${granularity}&scope=${scope}`) as WorkloadResponse
      setData(d)
    } catch {
      setData(null)
    } finally {
      setLoading(false)
    }
  }, [workspaceId, granularity, scope])

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load() }, [load])

  const chartData = (data?.series ?? []).map((b) => ({ ...b, label: formatLabel(b.date, granularity) }))

  return (
    <div className="workload-panel">
      <div className="workload-controls">
        <div className="segmented-control">
          {(['daily', 'weekly', 'monthly'] as Granularity[]).map((g) => (
            <button key={g} type="button" className={granularity === g ? 'active' : ''} onClick={() => setGranularity(g)}>{g}</button>
          ))}
        </div>
        {canSeeTeam && (
          <div className="segmented-control">
            <button type="button" className={scope === 'individual' ? 'active' : ''} onClick={() => setScope('individual')}>My workload</button>
            <button type="button" className={scope === 'team' ? 'active' : ''} onClick={() => setScope('team')}>Team</button>
          </div>
        )}
      </div>

      {loading ? <SkeletonChart /> : (
        <>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={chartData} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e2030" vertical={false} />
              <XAxis dataKey="label" tick={{ fill: '#64748b', fontSize: 11 }} axisLine={{ stroke: '#1e2030' }} tickLine={false} />
              <YAxis tick={{ fill: '#64748b', fontSize: 11 }} axisLine={false} tickLine={false} />
              <Tooltip
                contentStyle={TOOLTIP_STYLE}
                formatter={(value) => [value, 'Tasks']}
                labelFormatter={(label, payload) => {
                  const bucket = payload?.[0]?.payload as { estimatedMinutes?: number } | undefined
                  return bucket ? `${label} · ~${formatHours(bucket.estimatedMinutes ?? 0)} estimated` : label
                }}
              />
              <Bar dataKey="taskCount" name="Tasks" fill="#8B5CF6" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>

          {data && data.bottlenecks.length > 0 && (
            <div className="workload-bottlenecks">
              <span className="workload-bottleneck-title"><AlertTriangle size={13} /> Upcoming bottlenecks</span>
              {data.bottlenecks.map((b) => (
                <span key={b.date} className="workload-bottleneck-chip">
                  {formatLabel(b.date, granularity)} · {b.taskCount} tasks (~{formatHours(b.estimatedMinutes)})
                </span>
              ))}
            </div>
          )}

          {scope === 'team' && data && data.byAssignee.length > 0 && (
            <div className="workload-assignee-list">
              {data.byAssignee.map((a) => (
                <div key={a.userId} className="workload-assignee-row">
                  <span>{a.name}{a.userId === currentUserId ? ' (you)' : ''}</span>
                  <span className="task-list-meta"><span>{a.taskCount} tasks</span><span>{formatHours(a.estimatedMinutes)}</span></span>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}
