export const TOKEN_KEY = 'taskmanager_token'
export const REFRESH_KEY = 'taskmanager_refresh_token'

export const getStoredToken = () => localStorage.getItem(TOKEN_KEY)
export const getStoredRefreshToken = () => localStorage.getItem(REFRESH_KEY)

export const persistTokens = (accessToken: string, refreshToken?: string | null) => {
  localStorage.setItem(TOKEN_KEY, accessToken)
  if (refreshToken) localStorage.setItem(REFRESH_KEY, refreshToken)
}

export const clearTokens = () => {
  localStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem(REFRESH_KEY)
}

export class SessionExpiredError extends Error {
  constructor() { super('Session expired'); this.name = 'SessionExpiredError' }
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
      persistTokens(refreshData.accessToken, refreshToken)
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
