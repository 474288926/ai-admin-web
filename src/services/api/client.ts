import { clearSession, readSession, writeSession } from '@/services/session-storage'
import { authTokensSchema } from './schemas'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '/api/v1'

export function createClientRequestId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }

  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    const bytes = new Uint8Array(16)
    crypto.getRandomValues(bytes)
    bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x40
    bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80
    const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('')
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
  }

  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (character) => {
    const random = Math.random() * 16 || 0
    const value = character === 'x' ? random : (random % 4) + 8
    return Math.floor(value).toString(16)
  })
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
    readonly details?: unknown,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

let refreshPromise: Promise<string | null> | null = null

async function refreshAccessToken(): Promise<string | null> {
  const session = readSession()
  if (!session?.refreshToken) return null

  const response = await fetch(`${API_BASE_URL}/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken: session.refreshToken }),
  })

  if (!response.ok) {
    clearSession()
    return null
  }

  const tokens = authTokensSchema.parse(await response.json())
  writeSession({ ...session, ...tokens })
  return tokens.accessToken
}

async function parseError(response: Response): Promise<ApiError> {
  const fallback = `请求失败（${response.status}）`
  try {
    const body = (await response.json()) as {
      message?: string | string[]
      code?: string
      details?: unknown
    }
    const message = Array.isArray(body.message) ? body.message.join('；') : body.message
    return new ApiError(message ?? fallback, response.status, body.code, body.details)
  } catch {
    return new ApiError(fallback, response.status)
  }
}

export async function apiRequest<T>(
  path: string,
  init: RequestInit = {},
  retryAfterRefresh = true,
): Promise<T> {
  const session = readSession()
  const headers = new Headers(init.headers)

  if (!(init.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }
  if (session?.accessToken) headers.set('Authorization', `Bearer ${session.accessToken}`)

  const response = await fetch(`${API_BASE_URL}${path}`, { ...init, headers })

  if (response.status === 401 && retryAfterRefresh && session?.refreshToken) {
    refreshPromise ??= refreshAccessToken().finally(() => {
      refreshPromise = null
    })
    const token = await refreshPromise
    if (token) return apiRequest<T>(path, init, false)
  }

  if (!response.ok) throw await parseError(response)
  if (response.status === 204) return undefined as T

  return (await response.json()) as T
}
