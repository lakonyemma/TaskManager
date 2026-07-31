import { Navigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'

// Sits behind AppSplashGate's overlay, so the redirect itself needs no
// delay of its own — by the time the splash fades, this has already
// settled on the right destination.
export default function EntryRedirect() {
  const { user, loading } = useAuth()
  if (loading) return null
  return <Navigate to={user ? '/app' : '/login'} replace />
}
