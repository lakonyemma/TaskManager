import { useCallback, useEffect, useState } from 'react'
import { Lock } from 'lucide-react'
import { authFetch } from '../lib/api'
import { SkeletonList } from './Skeleton'
import EmptyState from './EmptyState'

type Earned = { key: string; name: string; description: string; icon: string; earnedAt: string }
type Locked = { key: string; name: string; description: string; icon: string }

// Deliberately understated — a quiet grid of earned/locked cards, no
// points, levels, or confetti. Recognition, not gamification. Badge icons
// are real platform emoji (rendered as glossy 3D graphics by the OS on
// modern systems), given a circular medal treatment via CSS.
export default function AchievementsPanel() {
  const [earned, setEarned] = useState<Earned[]>([])
  const [locked, setLocked] = useState<Locked[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const d = await authFetch('/api/achievements') as { earned: Earned[]; locked: Locked[] }
      setEarned(d.earned || []); setLocked(d.locked || [])
    } catch { setEarned([]); setLocked([]) }
    finally { setLoading(false) }
  }, [])

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load() }, [load])

  if (loading) return <SkeletonList rows={3} />

  return (
    <div className="achievements-grid">
      {earned.map((a) => (
        <div key={a.key} className="achievement-card earned" title={new Date(a.earnedAt).toLocaleString()}>
          <div className="achievement-icon" aria-hidden="true">{a.icon}</div>
          <div>
            <strong>{a.name}</strong>
            <p>{a.description}</p>
            <span className="achievement-date">Earned {new Date(a.earnedAt).toLocaleDateString()}</span>
          </div>
        </div>
      ))}
      {locked.map((a) => (
        <div key={a.key} className="achievement-card locked">
          <div className="achievement-icon" aria-hidden="true">{a.icon}<Lock size={11} className="achievement-lock" /></div>
          <div>
            <strong>{a.name}</strong>
            <p>{a.description}</p>
          </div>
        </div>
      ))}
      {earned.length === 0 && locked.length === 0 && (
        <EmptyState kind="achievements" compact title="No achievements yet" description="Complete tasks to start earning recognition." />
      )}
    </div>
  )
}
