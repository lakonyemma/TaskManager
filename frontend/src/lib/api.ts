import { syncTokenToServiceWorker } from './swAuthSync'

export const TOKEN_KEY = 'taskmanager_token'
export const REFRESH_KEY = 'taskmanager_refresh_token'
export const SESSION_KEY = 'taskmanager_session_id'

// "Remember session" support: when the user unchecks it at login, tokens are
// kept in sessionStorage (cleared when the browser/tab closes) instead of
// localStorage (persists until logout). Both stores are checked on read so a
// stale copy in the other store never shadows the active one.
const activeStorage = (): Storage => (localStorage.getItem(TOKEN_KEY) ? localStorage : sessionStorage)

export const getStoredToken = () => localStorage.getItem(TOKEN_KEY) || sessionStorage.getItem(TOKEN_KEY)
export const getStoredRefreshToken = () => localStorage.getItem(REFRESH_KEY) || sessionStorage.getItem(REFRESH_KEY)
export const getStoredSessionId = () => localStorage.getItem(SESSION_KEY) || sessionStorage.getItem(SESSION_KEY)

export const persistTokens = (accessToken: string, refreshToken?: string | null, remember = true, sessionId?: string | null) => {
  const target = refreshToken ? (remember ? localStorage : sessionStorage) : activeStorage()
  const other = target === localStorage ? sessionStorage : localStorage
  target.setItem(TOKEN_KEY, accessToken)
  if (refreshToken) target.setItem(REFRESH_KEY, refreshToken)
  if (sessionId) target.setItem(SESSION_KEY, sessionId)
  if (refreshToken) { other.removeItem(TOKEN_KEY); other.removeItem(REFRESH_KEY); other.removeItem(SESSION_KEY) }
  void syncTokenToServiceWorker(accessToken)
}

export const clearTokens = () => {
  localStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem(REFRESH_KEY)
  sessionStorage.removeItem(TOKEN_KEY)
  sessionStorage.removeItem(REFRESH_KEY)
  localStorage.removeItem(SESSION_KEY)
  sessionStorage.removeItem(SESSION_KEY)
  void syncTokenToServiceWorker(null)
}

export class SessionExpiredError extends Error {
  constructor() { super('Session expired'); this.name = 'SessionExpiredError' }
}

export class EmailNotVerifiedError extends Error {
  constructor(message: string) { super(message); this.name = 'EmailNotVerifiedError' }
}

// Performs an authenticated JSON fetch. Transparently retries once with a
// refreshed access token on 401, and throws SessionExpiredError if the
// refresh itself fails so callers can redirect to /login.
let refreshInFlight: Promise<string> | null = null

const refreshAccessToken = (): Promise<string> => {
  if (refreshInFlight) return refreshInFlight
  const current = (async () => {
    const refreshToken = getStoredRefreshToken()
    if (!refreshToken) throw new SessionExpiredError()
    const response = await fetch('/api/auth/refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    })
    const data = await response.json().catch(() => ({})) as { accessToken?: string }
    if (!response.ok || !data.accessToken) throw new SessionExpiredError()
    persistTokens(data.accessToken, refreshToken, activeStorage() === localStorage)
    return data.accessToken
  })()
  refreshInFlight = current
  void current.finally(() => { if (refreshInFlight === current) refreshInFlight = null }).catch(() => {})
  return current
}

export const authFetch = async (input: string, init?: RequestInit): Promise<unknown> => {
  const headers = new Headers(init?.headers)
  const token = getStoredToken()
  if (token) headers.set('Authorization', `Bearer ${token}`)

  let response = await fetch(input, { ...init, headers })
  if (response.status === 401) {
    try {
      // A sibling request may have refreshed our token while this one was in flight.
      const latestToken = getStoredToken()
      const accessToken = latestToken && latestToken !== token
        ? latestToken
        : await refreshAccessToken()
      headers.set('Authorization', `Bearer ${accessToken}`)
      response = await fetch(input, { ...init, headers })
    } catch (error) {
      // A temporary network failure is not proof that a session expired.
      if (error instanceof SessionExpiredError) {
        clearTokens()
      }
      throw error
    }
  }

  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(data.message || 'Request failed')
  return data
}

export const jsonHeaders = { 'Content-Type': 'application/json' }

// A workspace invite accepted during registration can't be redeemed until
// the new account is email-verified and logs in (registration no longer
// issues a session directly). The token is stashed here in the meantime and
// consumed on the next successful login.
const PENDING_INVITE_KEY = 'taskmanager_pending_invite'
export const setPendingInvite = (token: string) => localStorage.setItem(PENDING_INVITE_KEY, token)
export const getPendingInvite = () => localStorage.getItem(PENDING_INVITE_KEY)
export const clearPendingInvite = () => localStorage.removeItem(PENDING_INVITE_KEY)
