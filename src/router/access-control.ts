import type { OrganizationRole } from '@/types/organization'

export type AppCapability =
  | 'operations:view'
  | 'organization:manage'
  | 'assistant:use'
  | 'knowledge:view'
  | 'knowledge:manage'
  | 'support:use'
  | 'system:view'

const CAPABILITY_ROLES: Record<AppCapability, ReadonlySet<OrganizationRole>> = {
  'operations:view': new Set(['OWNER', 'ADMIN', 'KNOWLEDGE_ADMIN']),
  'organization:manage': new Set(['OWNER', 'ADMIN']),
  'assistant:use': new Set(['OWNER', 'ADMIN', 'KNOWLEDGE_ADMIN', 'SUPPORT']),
  'knowledge:view': new Set(['OWNER', 'ADMIN', 'KNOWLEDGE_ADMIN', 'SUPPORT']),
  'knowledge:manage': new Set(['OWNER', 'ADMIN', 'KNOWLEDGE_ADMIN']),
  'support:use': new Set(['OWNER', 'ADMIN', 'KNOWLEDGE_ADMIN', 'SUPPORT']),
  'system:view': new Set(['OWNER', 'ADMIN', 'KNOWLEDGE_ADMIN']),
}

export function canAccessCapability(
  capability: AppCapability | undefined,
  roles: readonly OrganizationRole[],
): boolean {
  if (!capability) return true
  const allowedRoles = CAPABILITY_ROLES[capability]
  return roles.some((role) => allowedRoles.has(role))
}

export function canManageOrganizationKnowledge(role: OrganizationRole | null | undefined): boolean {
  return role !== null && role !== undefined && CAPABILITY_ROLES['knowledge:manage'].has(role)
}

export function accessRestriction(
  capability: AppCapability | undefined,
  roles: readonly OrganizationRole[],
  accessProfileError: string | null,
  from: string,
): { reason: 'denied' | 'unavailable'; from: string } | null {
  if (canAccessCapability(capability, roles)) return null
  return {
    reason: accessProfileError ? 'unavailable' : 'denied',
    from,
  }
}

export function defaultAuthenticatedPath(roles: readonly OrganizationRole[]): string {
  if (canAccessCapability('operations:view', roles)) return '/dashboard'
  if (canAccessCapability('assistant:use', roles)) return '/assistant'
  if (roles.length > 0) return '/ask'
  return '/organization'
}

export function highestRoleLabel(roles: readonly OrganizationRole[]): string {
  const priority: OrganizationRole[] = ['OWNER', 'ADMIN', 'KNOWLEDGE_ADMIN', 'SUPPORT', 'MEMBER']
  const role = priority.find((item) => roles.includes(item))
  return role
    ? {
        OWNER: '企业所有者',
        ADMIN: '企业管理员',
        KNOWLEDGE_ADMIN: '知识管理员',
        SUPPORT: '客服成员',
        MEMBER: '企业成员',
      }[role]
    : '个人账号'
}
