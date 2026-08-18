import { afterEach, describe, expect, it, vi } from 'vitest'

import { createClientRequestId } from '@/services/api/client'

afterEach(() => vi.unstubAllGlobals())

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
})
