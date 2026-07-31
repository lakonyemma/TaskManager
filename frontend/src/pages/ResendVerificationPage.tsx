import { type FormEvent, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { jsonHeaders } from '../lib/api'
import './AuthPages.css'

export default function ResendVerificationPage() {
  const [searchParams] = useSearchParams()
  const [email, setEmail] = useState(searchParams.get('email') || '')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError(''); setLoading(true)
    try {
      const res = await fetch('/api/auth/resend-verification', { method: 'POST', headers: jsonHeaders, body: JSON.stringify({ email }) })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.message || 'Unable to resend verification email')
      setSent(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to resend verification email')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="auth-bg">
      <Link to="/login" className="back-to-landing">&larr; Back to Sign In</Link>
      <div className="glass-card">
        <p className="glass-logo">Taskly</p>
        <h1>Resend verification email</h1>
        <p className="glass-subtitle">Enter the email you signed up with and we'll send a fresh verification link.</p>

        {sent ? (
          <p className="auth-notice">If an account with that email exists and isn't verified yet, a new verification email has been sent.</p>
        ) : (
          <form onSubmit={handleSubmit}>
            <div className="form-field">
              <label htmlFor="resend-email">Email</label>
              <input id="resend-email" type="email" required autoComplete="email"
                value={email} onChange={e => setEmail(e.target.value)} placeholder="you@company.com" />
            </div>
            <button type="submit" className="submit-btn" disabled={loading}>
              {loading ? 'Sending…' : 'Send verification email'}
            </button>
          </form>
        )}

        {error && <p className="auth-error">{error}</p>}

        <p className="auth-switch">
          <Link to="/login">Back to sign in</Link>
        </p>
      </div>
    </div>
  )
}
