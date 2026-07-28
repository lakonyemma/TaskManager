import { createContext } from 'react'

export type UserSession = {
  id: string
  email: string
  firstname: string
  lastName: string
  avatarUrl?: string | null
  bio?: string | null
  language?: string
  fontStyle?: string
  colorTheme?: string
  taskNotificationsEnabled?: boolean
  emailNotificationsEnabled?: boolean
}

export type AuthContextValue = {
  user: UserSession | null
  loading: boolean
  sessionNotice: string
  setSessionNotice: (msg: string) => void
  setUser: (user: UserSession) => void
  login: (email: string, password: string, remember?: boolean) => Promise<UserSession>
  register: (data: { firstname: string; lastName: string; email: string; password: string }) => Promise<UserSession>
  logout: () => Promise<void>
}

export const AuthContext = createContext<AuthContextValue | null>(null)
