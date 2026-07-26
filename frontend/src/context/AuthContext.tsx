import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  authFetch, clearTokens, getStoredRefreshToken, getStoredToken,
  jsonHeaders, persistTokens, SessionExpiredError,
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

  const login = useCallback(async (email: string, password: string) => {
    const res = await fetch('/api/auth/login', { method: 'POST', headers: jsonHeaders, body: JSON.stringify({ email, password }) })
    const data = await res.json()
    if (!res.ok) throw new Error(data.message || 'Unable to sign in')
    persistTokens(data.accessToken, data.refreshToken)
    setUser(data.user)
    setSessionNotice('')
    return data.user as UserSession
  }, [])

  const register = useCallback(async (payload: { firstname: string; lastName: string; email: string; password: string }) => {
    const res = await fetch('/api/auth/register', { method: 'POST', headers: jsonHeaders, body: JSON.stringify(payload) })
    const data = await res.json()
    if (!res.ok) throw new Error(data.message || 'Unable to create account')
    persistTokens(data.accessToken, data.refreshToken)
    setUser(data.user)
    setSessionNotice('')
    return data.user as UserSession
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
