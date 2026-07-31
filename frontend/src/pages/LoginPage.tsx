import { type FormEvent, useState } from 'react'
import { Link, Navigate, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { Eye, EyeOff } from 'lucide-react'
import { useAuth } from '../hooks/useAuth'
import { EmailNotVerifiedError, setPendingInvite } from '../lib/api'
import './AuthPages.css'

export default function LoginPage() {
  const { user, login, sessionNotice } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [searchParams] = useSearchParams()
  const inviteToken = searchParams.get('invite')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [remember, setRemember] = useState(true)
  const [error, setError] = useState('')
  const [needsVerification, setNeedsVerification] = useState(false)
  const [loading, setLoading] = useState(false)

  if (user) {
    const redirectTo = (location.state as { from?: string } | null)?.from || '/app'
    return <Navigate to={redirectTo} replace />
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError(''); setNeedsVerification(false); setLoading(true)
    try {
      // Stash the invite (if this login was reached via an invite link) so
      // login()'s redeemPendingInvite() can consume it right after signing in.
      if (inviteToken) setPendingInvite(inviteToken)
      await login(email, password, remember)
      navigate('/app')
    } catch (err) {
      if (err instanceof EmailNotVerifiedError) {
        setNeedsVerification(true)
        setError(err.message)
      } else {
        setError(err instanceof Error ? err.message : 'Unable to sign in')
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="auth-bg">
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
          <p className="auth-switch">
            <Link to={`/resend-verification${email ? `?email=${encodeURIComponent(email)}` : ''}`}>Resend verification email</Link>
          </p>
        )}

        <p className="auth-switch">
          Don't have an account?
          <Link to="/register">Create one</Link>
        </p>
      </div>
    </div>
  )
}
