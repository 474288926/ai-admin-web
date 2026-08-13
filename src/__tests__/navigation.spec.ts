import { describe, expect, it } from 'vitest'

import { normalizeInternalPath, resolvePortalDestination } from '@/services/navigation'

describe('portal navigation', () => {
  it('maps only known portal targets', () => {
    expect(resolvePortalDestination('knowledge')).toBe('/ask')
    expect(resolvePortalDestination('employee')).toBe('/ask')
    expect(resolvePortalDestination('https://evil.example')).toBe('/ask')
  })

  it('accepts same-origin application paths', () => {
    expect(normalizeInternalPath('/ask?source=portal')).toBe('/ask?source=portal')
    expect(normalizeInternalPath('/dashboard#today')).toBe('/dashboard#today')
  })

  it('rejects protocol-relative and malformed redirect values', () => {
    expect(normalizeInternalPath('//evil.example/path')).toBe('/ask')
    expect(normalizeInternalPath('/\\evil.example')).toBe('/ask')
    expect(normalizeInternalPath('https://evil.example/path')).toBe('/ask')
  })
})
