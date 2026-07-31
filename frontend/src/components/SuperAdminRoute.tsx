import { Navigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'

export default function SuperAdminRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()

  if (loading) {
    return <div className="route-loading">Loading…</div>
  }
  if (!user) {
    return <Navigate to="/login" replace />
  }
  if (!user.isSuperAdmin) {
    return <Navigate to="/app" replace />
  }
  return <>{children}</>
}
