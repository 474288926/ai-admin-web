import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { useAuthStore } from '@/stores/auth'

const userId = '67c52979-aa9b-49f6-84d4-e666cc2e8f90'
const organizationId = '40f10640-86fe-4217-8ad9-fc39c6f80963'
const createdAt = '2026-08-15T01:00:00.000Z'

beforeEach(() => {
  setActivePinia(createPinia())
  window.localStorage.clear()
})

afterEach(() => {
  vi.unstubAllGlobals()
  window.localStorage.clear()
})

describe('auth access profile', () => {
  it('loads and deduplicates organization roles after login', async () => {
    const session = {
      tokenType: 'Bearer',
      accessToken: 'access-token',
      accessTokenExpiresIn: 3600,
      refreshToken: 'refresh-token',
      refreshTokenExpiresIn: 86400,
      user: {
        id: userId,
        email: 'admin@example.com',
        name: '管理员',
        createdAt,
      },
    }
    const organizations = [
      {
        id: organizationId,
        name: '示例企业',
        slug: 'example',
        currentRole: 'ADMIN',
        createdAt,
        updatedAt: createdAt,
      },
      {
        id: '95793719-5022-4bfa-b55c-ef098ec0cbab',
        name: '第二企业',
        slug: 'example-two',
        currentRole: 'ADMIN',
        createdAt,
        updatedAt: createdAt,
      },
    ]
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify(session), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify(organizations), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      )
    vi.stubGlobal('fetch', fetchMock)

    const store = useAuthStore()
    await store.login('admin@example.com', 'password')
    await store.ensureAccessProfile()

    expect(store.organizationRoles).toEqual(['ADMIN'])
    expect(store.accessProfileLoaded).toBe(true)
    expect(store.accessProfileError).toBeNull()
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('fails closed when organization roles cannot be loaded', async () => {
    const session = {
      tokenType: 'Bearer',
      accessToken: 'access-token',
      accessTokenExpiresIn: 3600,
      refreshToken: 'refresh-token',
      refreshTokenExpiresIn: 86400,
      user: {
        id: userId,
        email: 'member@example.com',
        name: null,
        createdAt,
      },
    }
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify(session), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ code: 'HTTP_503', message: '服务暂不可用' }), {
          status: 503,
          headers: { 'Content-Type': 'application/json' },
        }),
      )
    vi.stubGlobal('fetch', fetchMock)

    const store = useAuthStore()
    await store.login('member@example.com', 'password')
    await store.ensureAccessProfile()

    expect(store.organizationRoles).toEqual([])
    expect(store.accessProfileLoaded).toBe(true)
    expect(store.accessProfileError).toBe('无法读取当前账号的企业权限')
  })
})
