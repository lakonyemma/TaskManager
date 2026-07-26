import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { CheckCircle2, XCircle } from 'lucide-react'
import { jsonHeaders } from '../lib/api'
import './AuthPages.css'

type Status = 'verifying' | 'success' | 'error'

export default function VerifyEmailPage() {
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token')
  const [status, setStatus] = useState<Status>(token ? 'verifying' : 'error')
  const [message, setMessage] = useState(token ? '' : 'Missing verification token.')
  const [expiredEmail, setExpiredEmail] = useState('')
  const [resendState, setResendState] = useState<'idle' | 'sending' | 'sent'>('idle')

  useEffect(() => {
    if (!token) return
    fetch(`/api/auth/verify-email/${token}`)
      .then(async r => {
        const data = await r.json().catch(() => ({}))
        if (!r.ok) {
          setStatus('error')
          setMessage(data.message || 'Unable to verify email.')
          if (data.expired && data.email) setExpiredEmail(data.email)
          return
        }
        setStatus('success')
        setMessage(data.message || 'Email verified successfully.')
      })
      .catch(() => { setStatus('error'); setMessage('Unable to verify email. Please try again.') })
  }, [token])

  const handleResend = async () => {
    setResendState('sending')
    try {
      await fetch('/api/auth/resend-verification', { method: 'POST', headers: jsonHeaders, body: JSON.stringify({ email: expiredEmail }) })
    } finally {
      setResendState('sent')
    }
  }

  return (
    <div className="auth-bg">
      <Link to="/" className="back-to-landing">&larr; Back to Taskly</Link>
      <div className="glass-card">
        <p className="glass-logo">Taskly</p>

        {status === 'verifying' && (
          <>
            <h1>Verifying your email…</h1>
            <p className="glass-subtitle">One moment while we confirm your link.</p>
          </>
        )}

        {status === 'success' && (
          <>
            <div className="verify-icon" style={{ color: '#34d399', background: 'rgba(52, 211, 153, 0.15)' }}>
              <CheckCircle2 size={28} />
            </div>
            <h1>Email verified</h1>
            <p className="glass-subtitle">{message}</p>
            <Link to="/login" className="submit-btn" style={{ display: 'block', textAlign: 'center', textDecoration: 'none' }}>
              Go to Sign In
            </Link>
          </>
        )}

        {status === 'error' && (
          <>
            <div className="verify-icon" style={{ color: '#f87171', background: 'rgba(248, 113, 113, 0.15)' }}>
              <XCircle size={28} />
            </div>
            <h1>Verification failed</h1>
            <p className="glass-subtitle">{message}</p>
            {expiredEmail && (
              <button type="button" className="submit-btn" disabled={resendState !== 'idle'} onClick={handleResend}>
                {resendState === 'idle' && 'Send a new verification link'}
                {resendState === 'sending' && 'Sending…'}
                {resendState === 'sent' && 'Email sent — check your inbox'}
              </button>
            )}
            <p className="auth-switch">
              <Link to="/login">Back to sign in</Link>
            </p>
          </>
        )}
      </div>
    </div>
  )
}
