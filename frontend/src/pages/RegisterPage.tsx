import { type FormEvent, useEffect, useMemo, useState } from 'react'
import { Link, Navigate, useSearchParams } from 'react-router-dom'
import { Eye, EyeOff, MailCheck } from 'lucide-react'
import { useAuth } from '../hooks/useAuth'
import { jsonHeaders, setPendingInvite } from '../lib/api'
import './AuthPages.css'

const STRENGTH_LABELS = ['Weak', 'Weak', 'Fair', 'Good', 'Strong']
const STRENGTH_COLORS = ['#f87171', '#f87171', '#fbbf24', '#38bdf8', '#34d399']

function passwordStrength(password: string): number {
  let score = 0
  if (password.length >= 8) score++
  if (password.length >= 12) score++
  if (/[A-Z]/.test(password) && /[a-z]/.test(password)) score++
  if (/[0-9]/.test(password)) score++
  if (/[^A-Za-z0-9]/.test(password)) score++
  return Math.min(score, 4)
}

export default function RegisterPage() {
  const { user, register } = useAuth()
  const [searchParams] = useSearchParams()
  const inviteToken = searchParams.get('invite')

  const [firstname, setFirstname] = useState('')
  const [lastName, setLastName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [inviteInfo, setInviteInfo] = useState<{ workspaceName: string } | null>(null)
  const [registeredEmail, setRegisteredEmail] = useState('')
  const [resendState, setResendState] = useState<'idle' | 'sending' | 'sent'>('idle')

  useEffect(() => {
    if (!inviteToken) return
    fetch(`/api/invitations/preview/${inviteToken}`)
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(d => { setEmail(d.email); setInviteInfo({ workspaceName: d.workspaceName }) })
      .catch(() => { /* invalid/expired invite — let the user register normally */ })
  }, [inviteToken])

  const strength = useMemo(() => passwordStrength(password), [password])
  const passwordsMatch = confirmPassword.length === 0 || confirmPassword === password

  if (user) {
    return <Navigate to="/app" replace />
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    if (password !== confirmPassword) {
      setError('Passwords do not match')
      return
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters')
      return
    }
    setLoading(true)
    try {
      const result = await register({ firstname, lastName, email, password })
      // The invite can't be redeemed until this account is verified and
      // signed in — stash it so login() can finish the job afterwards.
      if (inviteToken) setPendingInvite(inviteToken)
      setRegisteredEmail(result.email)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to create account')
    } finally {
      setLoading(false)
    }
  }

  const handleResend = async () => {
    setResendState('sending')
    try {
      await fetch('/api/auth/resend-verification', { method: 'POST', headers: jsonHeaders, body: JSON.stringify({ email: registeredEmail }) })
    } finally {
      setResendState('sent')
    }
  }

  if (registeredEmail) {
    return (
      <div className="auth-bg">
        <Link to="/" className="back-to-landing">&larr; Back to Taskly</Link>
        <div className="glass-card">
          <p className="glass-logo">Taskly</p>
          <div className="verify-icon"><MailCheck size={28} /></div>
          <h1>Check your email</h1>
          <p className="glass-subtitle">
            We've sent a verification link to <strong>{registeredEmail}</strong>. Click it to activate your
            account, then come back and sign in.
          </p>
          <button type="button" className="submit-btn" disabled={resendState !== 'idle'} onClick={handleResend}>
            {resendState === 'idle' && 'Resend verification email'}
            {resendState === 'sending' && 'Sending…'}
            {resendState === 'sent' && 'Email sent — check your inbox'}
          </button>
          <p className="auth-switch">
            Already verified?
            <Link to="/login">Sign in</Link>
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="auth-bg">
      <Link to="/" className="back-to-landing">&larr; Back to Taskly</Link>
      <div className="glass-card">
        <p className="glass-logo">Taskly</p>
        <h1>Create your account</h1>
        <p className="glass-subtitle">Start organizing your team's work in minutes.</p>

        {inviteInfo && (
          <div className="invite-callout">
            You've been invited to join <strong>{inviteInfo.workspaceName}</strong>. Create an account to accept.
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="name-fields">
            <div className="form-field">
              <label htmlFor="reg-first">First name</label>
              <input id="reg-first" required value={firstname} onChange={e => setFirstname(e.target.value)} placeholder="Jane" />
            </div>
            <div className="form-field">
              <label htmlFor="reg-last">Last name</label>
              <input id="reg-last" required value={lastName} onChange={e => setLastName(e.target.value)} placeholder="Doe" />
            </div>
          </div>

          <div className="form-field">
            <label htmlFor="reg-email">Email</label>
            <input id="reg-email" type="email" required autoComplete="email" readOnly={!!inviteInfo}
              value={email} onChange={e => setEmail(e.target.value)} placeholder="you@company.com" />
          </div>

          <div className="form-field">
            <label htmlFor="reg-password">Password</label>
            <div className="password-field-wrap">
              <input id="reg-password" type={showPassword ? 'text' : 'password'} required autoComplete="new-password"
                value={password} onChange={e => setPassword(e.target.value)} placeholder="At least 8 characters" />
              <button type="button" className="password-toggle" onClick={() => setShowPassword(v => !v)} aria-label={showPassword ? 'Hide password' : 'Show password'}>
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
            {password.length > 0 && (
              <>
                <div className="strength-meter">
                  {[0, 1, 2, 3].map(i => (
                    <div key={i} className="strength-bar" style={{ background: i <= strength ? STRENGTH_COLORS[strength] : undefined }} />
                  ))}
                </div>
                <p className="strength-label" style={{ color: STRENGTH_COLORS[strength] }}>{STRENGTH_LABELS[strength]} password</p>
              </>
            )}
          </div>

          <div className="form-field">
            <label htmlFor="reg-confirm">Confirm password</label>
            <input id="reg-confirm" type={showPassword ? 'text' : 'password'} required autoComplete="new-password"
              className={!passwordsMatch ? 'field-error' : ''}
              value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} placeholder="Re-enter your password" />
            {!passwordsMatch && <span className="field-hint">Passwords do not match</span>}
          </div>

          <button type="submit" className="submit-btn" disabled={loading}>
            {loading ? 'Creating account…' : 'Create Account'}
          </button>
        </form>

        {error && <p className="auth-error">{error}</p>}

        <p className="auth-switch">
          Already have an account?
          <Link to="/login">Sign in</Link>
        </p>
      </div>
    </div>
  )
}
