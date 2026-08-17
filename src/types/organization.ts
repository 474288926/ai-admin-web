export type OrganizationRole = 'OWNER' | 'ADMIN' | 'KNOWLEDGE_ADMIN' | 'MEMBER' | 'SUPPORT'
export type OrganizationMemberStatus = 'INVITED' | 'ACTIVE' | 'SUSPENDED'

export interface OrganizationSummary {
  id: string
  name: string
  slug: string
  currentRole: OrganizationRole
  createdAt: string
  updatedAt: string
}

export interface OrganizationMember {
  id: string
  userId: string
  role: OrganizationRole
  status: OrganizationMemberStatus
  joinedAt: string | null
  user: { email: string; name: string | null }
}

export interface OrganizationDepartment {
  id: string
  name: string
  parentId: string | null
  sourceSystem: string | null
  memberIds: string[]
}

export interface OrganizationGroup {
  id: string
  name: string
  description: string | null
  memberIds: string[]
}

export interface OrganizationStructure extends OrganizationSummary {
  memberships: OrganizationMember[]
  departments: OrganizationDepartment[]
  groups: OrganizationGroup[]
}

export interface DepartmentInput {
  name: string
  parentId: string | null
}

export interface UserGroupInput {
  name: string
  description: string | null
}

export interface AddOrganizationMemberByEmailInput {
  email: string
  role: Exclude<OrganizationRole, 'OWNER'>
}

export interface UpdateOrganizationMemberInput {
  role?: Exclude<OrganizationRole, 'OWNER'>
  status?: OrganizationMemberStatus
}

export interface OrganizationInvitation {
  id: string
  email: string
  role: Exclude<OrganizationRole, 'OWNER'>
  expiresAt: string
  acceptedAt: string | null
  revokedAt: string | null
  createdAt: string
}

export interface CreateOrganizationInvitationInput {
  email: string
  role: Exclude<OrganizationRole, 'OWNER'>
}

export interface CreatedOrganizationInvitation {
  id: string
  email: string
  role: Exclude<OrganizationRole, 'OWNER'>
  expiresAt: string
  createdAt: string
  token: string
}

export interface OrganizationInvitationPreview {
  email: string
  role: Exclude<OrganizationRole, 'OWNER'>
  expiresAt: string
  organization: { id: string; name: string }
}
