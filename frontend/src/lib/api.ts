export const TOKEN_KEY = 'taskmanager_token'
export const REFRESH_KEY = 'taskmanager_refresh_token'

// "Remember session" support: when the user unchecks it at login, tokens are
// kept in sessionStorage (cleared when the browser/tab closes) instead of
// localStorage (persists until logout). Both stores are checked on read so a
// stale copy in the other store never shadows the active one.
const activeStorage = (): Storage => (localStorage.getItem(TOKEN_KEY) ? localStorage : sessionStorage)

export const getStoredToken = () => localStorage.getItem(TOKEN_KEY) || sessionStorage.getItem(TOKEN_KEY)
export const getStoredRefreshToken = () => localStorage.getItem(REFRESH_KEY) || sessionStorage.getItem(REFRESH_KEY)

export const persistTokens = (accessToken: string, refreshToken?: string | null, remember = true) => {
  const target = refreshToken ? (remember ? localStorage : sessionStorage) : activeStorage()
  const other = target === localStorage ? sessionStorage : localStorage
  target.setItem(TOKEN_KEY, accessToken)
  if (refreshToken) target.setItem(REFRESH_KEY, refreshToken)
  if (refreshToken) { other.removeItem(TOKEN_KEY); other.removeItem(REFRESH_KEY) }
}

export const clearTokens = () => {
  localStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem(REFRESH_KEY)
  sessionStorage.removeItem(TOKEN_KEY)
  sessionStorage.removeItem(REFRESH_KEY)
}

export class SessionExpiredError extends Error {
  constructor() { super('Session expired'); this.name = 'SessionExpiredError' }
}

export class EmailNotVerifiedError extends Error {
  email: string
  constructor(message: string, email: string) {
    super(message)
    this.name = 'EmailNotVerifiedError'
    this.email = email
  }
}

// Performs an authenticated JSON fetch. Transparently retries once with a
// refreshed access token on 401, and throws SessionExpiredError if the
// refresh itself fails so callers can redirect to /login.
export const authFetch = async (input: string, init?: RequestInit): Promise<unknown> => {
  const headers = new Headers(init?.headers)
  const token = getStoredToken()
  if (token) headers.set('Authorization', `Bearer ${token}`)

  let response = await fetch(input, { ...init, headers })

  if (response.status === 401) {
    const refreshToken = getStoredRefreshToken()
    if (!refreshToken) throw new SessionExpiredError()
    try {
      const refreshResponse = await fetch('/api/auth/refresh', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      })
      const refreshData = await refreshResponse.json().catch(() => ({}))
      if (!refreshResponse.ok || !refreshData.accessToken) throw new SessionExpiredError()
      persistTokens(refreshData.accessToken, refreshToken, activeStorage() === localStorage)
      headers.set('Authorization', `Bearer ${refreshData.accessToken}`)
      response = await fetch(input, { ...init, headers })
    } catch {
      clearTokens()
      throw new SessionExpiredError()
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
