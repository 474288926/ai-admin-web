import type { AuthSession } from '@/types/auth'
import { z } from 'zod'
import { apiRequest } from './client'
import { authSessionSchema } from './schemas'

export interface OidcPublicConfig {
  enabled: boolean
  displayName: string
}

export interface OidcLoginResult extends AuthSession {
  returnTo: string
}

export async function login(email: string, password: string): Promise<AuthSession> {
  const result = await apiRequest<unknown>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  })
  return authSessionSchema.parse(result)
}

export async function getOidcConfig(): Promise<OidcPublicConfig> {
  return apiRequest<OidcPublicConfig>('/auth/oidc/config')
}

export async function startOidcLogin(returnTo: string): Promise<string> {
  const params = new URLSearchParams({ returnTo })
  const result = await apiRequest<{ authorizationUrl: string }>(`/auth/oidc/start?${params}`)
  return result.authorizationUrl
}

export async function completeOidcLogin(code: string, state: string): Promise<OidcLoginResult> {
  const result = await apiRequest<unknown>('/auth/oidc/complete', {
    method: 'POST',
    body: JSON.stringify({ code, state }),
  })
  const parsed = authSessionSchema.extend({ returnTo: z.string().startsWith('/') }).parse(result)
  return parsed
}

export async function logout(): Promise<void> {
  await apiRequest<void>('/auth/logout', { method: 'POST' })
}
