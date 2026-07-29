import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { authFetch, setPendingInvite } from '../lib/api'
import './AuthPages.css'

type Preview = { email: string; workspaceName: string; role: string }
type Status = 'loading' | 'invalid' | 'wrong-account' | 'accepting' | 'accepted' | 'error' | 'needs-auth'

export default function InvitationAcceptPage() {
  const { token } = useParams<{ token: string }>()
  const { user, loading: authLoading } = useAuth()
  const navigate = useNavigate()
  const [status, setStatus] = useState<Status>('loading')
  const [preview, setPreview] = useState<Preview | null>(null)
  const [message, setMessage] = useState('')

  useEffect(() => {
    if (!token) { setStatus('invalid'); return }
    let cancelled = false
    fetch(`/api/invitations/preview/${token}`)
      .then(async r => {
        if (!r.ok) throw new Error()
        return r.json() as Promise<Preview>
      })
      .then(data => { if (!cancelled) setPreview(data) })
      .catch(() => { if (!cancelled) setStatus('invalid') })
    return () => { cancelled = true }
  }, [token])

  useEffect(() => {
    if (!preview || authLoading || status === 'accepted' || status === 'accepting') return

    if (!user) { setStatus('needs-auth'); return }

    if (user.email !== preview.email) { setStatus('wrong-account'); return }

    let cancelled = false
    setStatus('accepting')
    authFetch(`/api/invitations/${token}/accept`, { method: 'POST' })
      .then((data) => {
        if (cancelled) return
        setMessage((data as { message?: string })?.message || `You've joined ${preview.workspaceName}`)
        setStatus('accepted')
      })
      .catch((err) => {
        if (cancelled) return
        setMessage(err instanceof Error ? err.message : 'Unable to accept this invitation')
        setStatus('error')
      })
    return () => { cancelled = true }
  }, [preview, user, authLoading, token, status])

  const goToAuth = (path: '/login' | '/register') => {
    if (token) setPendingInvite(token)
    navigate(`${path}?invite=${token}`)
  }

  return (
    <div className="auth-bg">
      <Link to="/" className="back-to-landing">&larr; Back to Taskly</Link>
      <div className="glass-card">
        <p className="glass-logo">Taskly</p>

        {(status === 'loading' || status === 'accepting') && (
          <>
            <h1>{status === 'accepting' ? 'Joining workspace…' : 'Loading invitation…'}</h1>
            <p className="glass-subtitle">Hang tight, this only takes a moment.</p>
          </>
        )}

        {status === 'invalid' && (
          <>
            <h1>Invitation not found</h1>
            <p className="auth-error">This invitation link is invalid, expired, or has already been used.</p>
          </>
        )}

        {status === 'needs-auth' && preview && (
          <>
            <h1>Join {preview.workspaceName}</h1>
            <p className="glass-subtitle">You've been invited as a <strong>{preview.role.toLowerCase()}</strong>. Sign in or create an account with <strong>{preview.email}</strong> to accept.</p>
            <button type="button" className="submit-btn" onClick={() => goToAuth('/login')} style={{ marginBottom: 10 }}>Sign in</button>
            <button type="button" className="submit-btn" onClick={() => goToAuth('/register')} style={{ background: 'transparent', border: '1px solid rgba(139,92,246,0.4)' }}>Create an account</button>
          </>
        )}

        {status === 'wrong-account' && preview && (
          <>
            <h1>Wrong account</h1>
            <p className="auth-error">This invitation was sent to {preview.email}, but you're signed in as {user?.email}.</p>
            <p className="auth-switch"><Link to="/login">Sign in with a different account</Link></p>
          </>
        )}

        {status === 'accepted' && preview && (
          <>
            <h1>You're in</h1>
            <p className="glass-subtitle">{message}</p>
            <Link to="/app" className="submit-btn" style={{ display: 'block', textAlign: 'center', textDecoration: 'none' }}>Open Taskly</Link>
          </>
        )}

        {status === 'error' && (
          <>
            <h1>Something went wrong</h1>
            <p className="auth-error">{message}</p>
          </>
        )}
      </div>
    </div>
  )
}
