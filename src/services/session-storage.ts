import type { AuthSession } from '@/types/auth'

const SESSION_KEY = 'knowledge-admin-session'

export function readSession(): AuthSession | null {
  try {
    const value = localStorage.getItem(SESSION_KEY)
    return value ? (JSON.parse(value) as AuthSession) : null
  } catch {
    localStorage.removeItem(SESSION_KEY)
    return null
  }
}

export function writeSession(session: AuthSession): void {
  localStorage.setItem(SESSION_KEY, JSON.stringify(session))
}

export function clearSession(): void {
  localStorage.removeItem(SESSION_KEY)
}
