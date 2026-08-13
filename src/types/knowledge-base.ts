export type KnowledgeBaseVisibility = 'PRIVATE' | 'ORGANIZATION' | 'RESTRICTED'

export interface KnowledgeBase {
  id: string
  organizationId: string | null
  visibility: KnowledgeBaseVisibility
  name: string
  description: string | null
  createdAt: string
  updatedAt: string
}

export interface OrganizationSummary {
  id: string
  name: string
  slug: string
  createdAt: string
  updatedAt: string
}

export interface PaginationMeta {
  page: number
  pageSize: number
  total: number
  totalPages: number
  hasNextPage: boolean
}

export interface PaginatedResult<T> {
  items: T[]
  meta: PaginationMeta
}

export interface CreateKnowledgeBaseInput {
  organizationId?: string
  visibility?: KnowledgeBaseVisibility
  name: string
  description?: string
}

export interface UpdateKnowledgeBaseInput {
  visibility?: KnowledgeBaseVisibility
  name?: string
  description?: string | null
}

export type ResourceGrantTargetType = 'USER' | 'DEPARTMENT' | 'GROUP'
export type ResourcePermissionLevel = 'READ' | 'EDIT' | 'MANAGE'

export interface KnowledgeBaseUserGrant {
  userId: string
  permission: ResourcePermissionLevel
  user: { email: string; name: string | null }
}

export interface KnowledgeBaseDepartmentGrant {
  departmentId: string
  permission: ResourcePermissionLevel
  department: { name: string }
}

export interface KnowledgeBaseGroupGrant {
  groupId: string
  permission: ResourcePermissionLevel
  group: { name: string }
}

export interface KnowledgeBaseGrants {
  organizationId: string | null
  users: KnowledgeBaseUserGrant[]
  departments: KnowledgeBaseDepartmentGrant[]
  groups: KnowledgeBaseGroupGrant[]
}

export interface UpsertKnowledgeBaseGrantInput {
  targetType: ResourceGrantTargetType
  targetId: string
  permission: ResourcePermissionLevel
}

export type OrganizationRole = 'OWNER' | 'ADMIN' | 'KNOWLEDGE_ADMIN' | 'MEMBER' | 'SUPPORT'
export type OrganizationMemberStatus = 'INVITED' | 'ACTIVE' | 'SUSPENDED'

export interface OrganizationStructure extends OrganizationSummary {
  memberships: Array<{
    id: string
    userId: string
    role: OrganizationRole
    status: OrganizationMemberStatus
    joinedAt: string | null
    user: { email: string; name: string | null }
  }>
  departments: Array<{ id: string; name: string; parentId: string | null }>
  groups: Array<{ id: string; name: string; description: string | null }>
}
