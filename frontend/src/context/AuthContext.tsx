import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  authFetch, clearPendingInvite, clearTokens, EmailNotVerifiedError, getPendingInvite, getStoredRefreshToken,
  getStoredToken, jsonHeaders, persistTokens, SessionExpiredError,
} from '../lib/api'
import { AuthContext, type UserSession } from './auth-context'

// A workspace invite accepted during registration is stashed in localStorage
// (see RegisterPage) and redeemed here — shared by both login and register
// since either can be the first authenticated moment for a new account.
const redeemPendingInvite = async () => {
  const pendingInvite = getPendingInvite()
  if (!pendingInvite) return
  try { await authFetch(`/api/invitations/${pendingInvite}/accept`, { method: 'POST' }) } catch { /* invite may have expired; not fatal */ }
  clearPendingInvite()
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserSession | null>(null)
  const [loading, setLoading] = useState(true)
  const [sessionNotice, setSessionNotice] = useState('')

  const loadProfile = useCallback(async () => {
    if (!getStoredToken()) { setLoading(false); return }
    try {
      const d = await authFetch('/api/auth/me') as { user: UserSession }
      setUser(d.user)
    } catch (err) {
      if (err instanceof SessionExpiredError) setSessionNotice('Your session expired. Please sign in again.')
      clearTokens()
      setUser(null)
    } finally {
      setLoading(false)
    }
  }, [])

  // setState here happens after an await inside loadProfile, not synchronously.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { loadProfile() }, [loadProfile])

  useEffect(() => {
    if (user?.colorTheme) {
      document.documentElement.setAttribute('data-theme', user.colorTheme)
      localStorage.setItem('taskly.colorTheme', user.colorTheme)
    }
    if (user?.fontStyle) {
      document.documentElement.setAttribute('data-font', user.fontStyle)
      localStorage.setItem('taskly.fontStyle', user.fontStyle)
    }
  }, [user])

  const login = useCallback(async (email: string, password: string, remember = true) => {
    const res = await fetch('/api/auth/login', { method: 'POST', headers: jsonHeaders, body: JSON.stringify({ email, password }) })
    const data = await res.json()
    if (!res.ok) {
      if (data.emailNotVerified) throw new EmailNotVerifiedError(data.message || 'Please verify your email before signing in')
      throw new Error(data.message || 'Unable to sign in')
    }
    persistTokens(data.accessToken, data.refreshToken, remember)
    setUser(data.user)
    setSessionNotice('')
    await redeemPendingInvite()
    return data.user as UserSession
  }, [])

  // Registration no longer establishes a session directly — the account is
  // created in a pending/unverified state and a verification email is sent.
  // The pending invite (if any) stays stashed until the user verifies and
  // logs in, at which point login()'s redeemPendingInvite() picks it up.
  const register = useCallback(async (payload: { firstname: string; lastName: string; email: string; password: string }) => {
    const res = await fetch('/api/auth/register', { method: 'POST', headers: jsonHeaders, body: JSON.stringify(payload) })
    const data = await res.json()
    if (!res.ok) throw new Error(data.message || 'Unable to create account')
  }, [])

  const logout = useCallback(async () => {
    const refreshToken = getStoredRefreshToken()
    clearTokens()
    setUser(null)
    // Reset to the default theme/font immediately — otherwise the next
    // account signed into this browser would flash the previous user's
    // saved appearance until their own /api/auth/me resolves.
    localStorage.removeItem('taskly.colorTheme')
    localStorage.removeItem('taskly.fontStyle')
    document.documentElement.setAttribute('data-theme', 'purple')
    document.documentElement.setAttribute('data-font', 'default')
    if (refreshToken) {
      fetch('/api/auth/logout', { method: 'POST', headers: jsonHeaders, body: JSON.stringify({ refreshToken }) }).catch(() => {})
    }
  }, [])

  const value = useMemo(() => ({ user, loading, sessionNotice, setSessionNotice, setUser, login, register, logout }),
    [user, loading, sessionNotice, login, register, logout])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
