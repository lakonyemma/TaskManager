import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  authFetch, clearPendingInvite, clearTokens, EmailNotVerifiedError, getPendingInvite, getStoredRefreshToken,
  getStoredToken, jsonHeaders, persistTokens, SessionExpiredError,
} from '../lib/api'
import { AuthContext, type UserSession } from './auth-context'

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
    if (user?.colorTheme) document.documentElement.setAttribute('data-theme', user.colorTheme)
    if (user?.fontStyle) document.documentElement.setAttribute('data-font', user.fontStyle)
  }, [user])

  const login = useCallback(async (email: string, password: string, remember = true) => {
    const res = await fetch('/api/auth/login', { method: 'POST', headers: jsonHeaders, body: JSON.stringify({ email, password }) })
    const data = await res.json()
    if (!res.ok) {
      if (res.status === 403 && data.emailNotVerified) throw new EmailNotVerifiedError(data.message, data.email || email)
      throw new Error(data.message || 'Unable to sign in')
    }
    persistTokens(data.accessToken, data.refreshToken, remember)
    setUser(data.user)
    setSessionNotice('')

    // Redeem a workspace invite that was accepted during registration, back
    // when there was no session yet to redeem it with.
    const pendingInvite = getPendingInvite()
    if (pendingInvite) {
      try { await authFetch(`/api/invitations/${pendingInvite}/accept`, { method: 'POST' }) } catch { /* invite may have expired; not fatal to login */ }
      clearPendingInvite()
    }

    return data.user as UserSession
  }, [])

  const register = useCallback(async (payload: { firstname: string; lastName: string; email: string; password: string }) => {
    const res = await fetch('/api/auth/register', { method: 'POST', headers: jsonHeaders, body: JSON.stringify(payload) })
    const data = await res.json()
    if (!res.ok) throw new Error(data.message || 'Unable to create account')
    // No tokens are issued at this point — the account needs email
    // verification before it can be signed into.
    return data as { message: string; email: string }
  }, [])

  const logout = useCallback(async () => {
    const refreshToken = getStoredRefreshToken()
    clearTokens()
    setUser(null)
    if (refreshToken) {
      fetch('/api/auth/logout', { method: 'POST', headers: jsonHeaders, body: JSON.stringify({ refreshToken }) }).catch(() => {})
    }
  }, [])

  const value = useMemo(() => ({ user, loading, sessionNotice, setSessionNotice, setUser, login, register, logout }),
    [user, loading, sessionNotice, login, register, logout])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
