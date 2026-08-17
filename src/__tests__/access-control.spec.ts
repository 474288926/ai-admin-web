import { describe, expect, it } from 'vitest'

import {
  accessRestriction,
  canAccessCapability,
  canManageOrganizationKnowledge,
  defaultAuthenticatedPath,
  highestRoleLabel,
} from '@/router/access-control'

describe('role access control', () => {
  it('allows owners and admins to manage the enterprise', () => {
    expect(canAccessCapability('organization:manage', ['OWNER'])).toBe(true)
    expect(canAccessCapability('organization:manage', ['ADMIN'])).toBe(true)
    expect(canAccessCapability('organization:manage', ['KNOWLEDGE_ADMIN'])).toBe(false)
  })

  it('keeps knowledge operations separate from support access', () => {
    expect(canAccessCapability('knowledge:manage', ['KNOWLEDGE_ADMIN'])).toBe(true)
    expect(canAccessCapability('system:view', ['KNOWLEDGE_ADMIN'])).toBe(true)
    expect(canAccessCapability('assistant:use', ['SUPPORT'])).toBe(true)
    expect(canAccessCapability('knowledge:view', ['SUPPORT'])).toBe(true)
    expect(canAccessCapability('knowledge:manage', ['SUPPORT'])).toBe(false)
    expect(canAccessCapability('system:view', ['SUPPORT'])).toBe(false)
  })

  it('evaluates knowledge management for each organization independently', () => {
    expect(canManageOrganizationKnowledge('OWNER')).toBe(true)
    expect(canManageOrganizationKnowledge('ADMIN')).toBe(true)
    expect(canManageOrganizationKnowledge('KNOWLEDGE_ADMIN')).toBe(true)
    expect(canManageOrganizationKnowledge('SUPPORT')).toBe(false)
    expect(canManageOrganizationKnowledge('MEMBER')).toBe(false)
    expect(canManageOrganizationKnowledge(undefined)).toBe(false)
  })

  it('chooses the first usable page for each role class', () => {
    expect(defaultAuthenticatedPath(['ADMIN'])).toBe('/dashboard')
    expect(defaultAuthenticatedPath(['SUPPORT'])).toBe('/assistant')
    expect(defaultAuthenticatedPath(['MEMBER'])).toBe('/ask')
    expect(defaultAuthenticatedPath([])).toBe('/ask')
  })

  it('uses the highest role across multiple organizations', () => {
    expect(highestRoleLabel(['SUPPORT', 'ADMIN'])).toBe('企业管理员')
    expect(highestRoleLabel(['MEMBER'])).toBe('企业成员')
    expect(highestRoleLabel([])).toBe('个人账号')
  })

  it('returns the route restriction reason for denied and unavailable access', () => {
    expect(accessRestriction('system:view', ['SUPPORT'], null, '/settings')).toEqual({
      reason: 'denied',
      from: '/settings',
    })
    expect(accessRestriction('system:view', [], '无法读取当前账号的企业权限', '/settings')).toEqual(
      {
        reason: 'unavailable',
        from: '/settings',
      },
    )
    expect(accessRestriction('system:view', ['ADMIN'], null, '/settings')).toBeNull()
  })
})
