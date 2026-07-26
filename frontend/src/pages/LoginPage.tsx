import { type FormEvent, useState } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { Eye, EyeOff } from 'lucide-react'
import { useAuth } from '../hooks/useAuth'
import { EmailNotVerifiedError, jsonHeaders } from '../lib/api'
import './AuthPages.css'

export default function LoginPage() {
  const { user, login, sessionNotice } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [remember, setRemember] = useState(true)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [needsVerification, setNeedsVerification] = useState(false)
  const [resendState, setResendState] = useState<'idle' | 'sending' | 'sent'>('idle')

  if (user) {
    const redirectTo = (location.state as { from?: string } | null)?.from || '/app'
    return <Navigate to={redirectTo} replace />
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError(''); setNeedsVerification(false); setLoading(true)
    try {
      await login(email, password, remember)
      navigate('/app')
    } catch (err) {
      if (err instanceof EmailNotVerifiedError) {
        setError(err.message)
        setNeedsVerification(true)
      } else {
        setError(err instanceof Error ? err.message : 'Unable to sign in')
      }
    } finally {
      setLoading(false)
    }
  }

  const handleResend = async () => {
    setResendState('sending')
    try {
      await fetch('/api/auth/resend-verification', { method: 'POST', headers: jsonHeaders, body: JSON.stringify({ email }) })
    } finally {
      setResendState('sent')
    }
  }

  return (
    <div className="auth-bg">
      <Link to="/" className="back-to-landing">&larr; Back to Taskly</Link>
      <div className="glass-card">
        <p className="glass-logo">Taskly</p>
        <h1>Welcome back</h1>
        <p className="glass-subtitle">Sign in to continue organizing your team's work.</p>

        <form onSubmit={handleSubmit}>
          <div className="form-field">
            <label htmlFor="login-email">Email</label>
            <input id="login-email" type="email" required autoComplete="email"
              value={email} onChange={e => setEmail(e.target.value)} placeholder="you@company.com" />
          </div>
          <div className="form-field">
            <label htmlFor="login-password">Password</label>
            <div className="password-field-wrap">
              <input id="login-password" type={showPassword ? 'text' : 'password'} required autoComplete="current-password"
                value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" />
              <button type="button" className="password-toggle" onClick={() => setShowPassword(v => !v)} aria-label={showPassword ? 'Hide password' : 'Show password'}>
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>
          <label className="remember-row">
            <input type="checkbox" checked={remember} onChange={e => setRemember(e.target.checked)} />
            <span>Remember me on this device</span>
          </label>
          <button type="submit" className="submit-btn" disabled={loading}>
            {loading ? 'Signing in…' : 'Sign In'}
          </button>
        </form>

        {sessionNotice && <p className="auth-notice">{sessionNotice}</p>}
        {error && <p className="auth-error">{error}</p>}
        {needsVerification && (
          <button type="button" className="submit-btn" style={{ marginTop: 10 }} disabled={resendState !== 'idle'} onClick={handleResend}>
            {resendState === 'idle' && 'Resend verification email'}
            {resendState === 'sending' && 'Sending…'}
            {resendState === 'sent' && 'Email sent — check your inbox'}
          </button>
        )}

        <p className="auth-switch">
          Don't have an account?
          <Link to="/register">Create one</Link>
        </p>
      </div>
    </div>
  )
}
