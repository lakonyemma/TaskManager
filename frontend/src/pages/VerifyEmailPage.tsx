import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { jsonHeaders } from '../lib/api'
import './AuthPages.css'

type Status = 'verifying' | 'success' | 'error'

export default function VerifyEmailPage() {
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token')
  const [status, setStatus] = useState<Status>('verifying')
  const [message, setMessage] = useState('')

  useEffect(() => {
    if (!token) { setStatus('error'); setMessage('This verification link is missing its token.'); return }
    let cancelled = false
    fetch('/api/auth/verify-email', { method: 'POST', headers: jsonHeaders, body: JSON.stringify({ token }) })
      .then(async r => {
        const data = await r.json().catch(() => ({}))
        if (cancelled) return
        if (!r.ok) { setStatus('error'); setMessage(data.message || 'Unable to verify this link.'); return }
        setStatus('success'); setMessage(data.message || 'Email verified — you can now sign in.')
      })
      .catch(() => { if (!cancelled) { setStatus('error'); setMessage('Unable to reach the server. Please try again.') } })
    return () => { cancelled = true }
  }, [token])

  return (
    <div className="auth-bg">
      <Link to="/" className="back-to-landing">&larr; Back to Taskly</Link>
      <div className="glass-card">
        <p className="glass-logo">Taskly</p>
        {status === 'verifying' && (
          <>
            <h1>Verifying your email…</h1>
            <p className="glass-subtitle">Hang tight, this only takes a moment.</p>
          </>
        )}
        {status === 'success' && (
          <>
            <h1>Email verified</h1>
            <p className="glass-subtitle">{message}</p>
            <Link to="/login" className="submit-btn" style={{ display: 'block', textAlign: 'center', textDecoration: 'none' }}>Sign in</Link>
          </>
        )}
        {status === 'error' && (
          <>
            <h1>Verification failed</h1>
            <p className="auth-error">{message}</p>
            <p className="auth-switch">
              <Link to="/resend-verification">Request a new verification email</Link>
            </p>
          </>
        )}
      </div>
    </div>
  )
}
