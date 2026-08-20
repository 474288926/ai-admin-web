import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  ApiError,
  AUTH_SESSION_EXPIRED_EVENT,
  apiRequest,
  createClientRequestId,
} from '@/services/api/client'
import { readSession, writeSession } from '@/services/session-storage'

afterEach(() => {
  localStorage.clear()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('api client request IDs', () => {
  it('generates a UUID when randomUUID is unavailable on an HTTP LAN origin', () => {
    const randomValues = new Uint8Array(16).fill(0xab)
    vi.stubGlobal('crypto', {
      getRandomValues: (target: Uint8Array) => {
        target.set(randomValues)
        return target
      },
    })

    expect(createClientRequestId()).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    )
  })

  it('wraps network failures in a consistent API error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('fetch failed')))

    await expect(apiRequest('/health/live')).rejects.toMatchObject({
      name: 'ApiError',
      status: 0,
      code: 'NETWORK_ERROR',
    })
  })

  it('clears the session and emits an event when refresh is rejected', async () => {
    writeSession({
      tokenType: 'Bearer',
      accessToken: 'expired-access-token',
      accessTokenExpiresIn: 60,
      refreshToken: 'expired-refresh-token',
      refreshTokenExpiresIn: 120,
      user: {
        id: '550e8400-e29b-41d4-a716-446655440000',
        email: 'employee@example.com',
        name: 'Employee',
        createdAt: '2026-08-19T00:00:00.000Z',
      },
    })
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ code: 'AUTH_UNAUTHORIZED', message: 'Unauthorized' }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ code: 'AUTH_REFRESH_TOKEN_INVALID' }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        }),
      )
    vi.stubGlobal('fetch', fetchMock)
    const expired = vi.fn()
    window.addEventListener(AUTH_SESSION_EXPIRED_EVENT, expired, { once: true })

    await expect(apiRequest('/knowledge-bases')).rejects.toBeInstanceOf(ApiError)

    expect(readSession()).toBeNull()
    expect(expired).toHaveBeenCalledOnce()
  })
})
