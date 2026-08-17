import { z } from 'zod'

import type {
  AddOrganizationMemberByEmailInput,
  CreatedOrganizationInvitation,
  CreateOrganizationInvitationInput,
  DepartmentInput,
  OrganizationInvitation,
  OrganizationInvitationPreview,
  OrganizationStructure,
  OrganizationSummary,
  UpdateOrganizationMemberInput,
  UserGroupInput,
} from '@/types/organization'
import type { AuthSession } from '@/types/auth'
import { apiRequest } from './client'
import { authSessionSchema } from './schemas'

const organizationSummarySchema = z.object({
  id: z.uuid(),
  name: z.string(),
  slug: z.string(),
  currentRole: z.enum(['OWNER', 'ADMIN', 'KNOWLEDGE_ADMIN', 'MEMBER', 'SUPPORT']),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
})

const organizationMemberSchema = z.object({
  id: z.uuid(),
  userId: z.uuid(),
  role: z.enum(['OWNER', 'ADMIN', 'KNOWLEDGE_ADMIN', 'MEMBER', 'SUPPORT']),
  status: z.enum(['INVITED', 'ACTIVE', 'SUSPENDED']),
  joinedAt: z.iso.datetime().nullable(),
  user: z.object({ email: z.email(), name: z.string().nullable() }),
})

const organizationDepartmentSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  parentId: z.uuid().nullable(),
  sourceSystem: z.string().nullable(),
  memberIds: z.array(z.uuid()),
})

const organizationGroupSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  description: z.string().nullable(),
  memberIds: z.array(z.uuid()),
})

const organizationStructureSchema = organizationSummarySchema.extend({
  memberships: z.array(organizationMemberSchema),
  departments: z.array(organizationDepartmentSchema),
  groups: z.array(organizationGroupSchema),
})

const organizationMemberMutationSchema = organizationMemberSchema.omit({ user: true })
const assignableRoleSchema = z.enum(['ADMIN', 'KNOWLEDGE_ADMIN', 'MEMBER', 'SUPPORT'])
const organizationInvitationSchema = z.object({
  id: z.uuid(),
  email: z.email(),
  role: assignableRoleSchema,
  expiresAt: z.iso.datetime(),
  acceptedAt: z.iso.datetime().nullable(),
  revokedAt: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
})
const createdOrganizationInvitationSchema = organizationInvitationSchema
  .omit({ acceptedAt: true, revokedAt: true })
  .extend({ token: z.string().length(43) })
const organizationInvitationPreviewSchema = z.object({
  email: z.email(),
  role: assignableRoleSchema,
  expiresAt: z.iso.datetime(),
  organization: z.object({ id: z.uuid(), name: z.string() }),
})

export async function listOrganizations(): Promise<OrganizationSummary[]> {
  const result = await apiRequest<unknown>('/organizations')
  return z.array(organizationSummarySchema).parse(result)
}

export async function getOrganization(id: string): Promise<OrganizationStructure> {
  const result = await apiRequest<unknown>(`/organizations/${id}`)
  return organizationStructureSchema.parse(result)
}

export async function addMemberByEmail(
  organizationId: string,
  input: AddOrganizationMemberByEmailInput,
): Promise<void> {
  const result = await apiRequest<unknown>(`/organizations/${organizationId}/members/by-email`, {
    method: 'POST',
    body: JSON.stringify(input),
  })
  organizationMemberMutationSchema.parse(result)
}

export async function updateMember(
  organizationId: string,
  memberId: string,
  input: UpdateOrganizationMemberInput,
): Promise<void> {
  const result = await apiRequest<unknown>(`/organizations/${organizationId}/members/${memberId}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  })
  organizationMemberMutationSchema.parse(result)
}

export async function createDepartment(
  organizationId: string,
  input: DepartmentInput,
): Promise<void> {
  await apiRequest<unknown>(`/organizations/${organizationId}/departments`, {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export async function updateDepartment(
  organizationId: string,
  departmentId: string,
  input: DepartmentInput,
): Promise<void> {
  await apiRequest<unknown>(`/organizations/${organizationId}/departments/${departmentId}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  })
}

export function deleteDepartment(organizationId: string, departmentId: string): Promise<void> {
  return apiRequest<void>(`/organizations/${organizationId}/departments/${departmentId}`, {
    method: 'DELETE',
  })
}

export function addDepartmentMember(
  organizationId: string,
  departmentId: string,
  memberId: string,
): Promise<void> {
  return apiRequest<void>(
    `/organizations/${organizationId}/departments/${departmentId}/members/${memberId}`,
    { method: 'PUT' },
  )
}

export function removeDepartmentMember(
  organizationId: string,
  departmentId: string,
  memberId: string,
): Promise<void> {
  return apiRequest<void>(
    `/organizations/${organizationId}/departments/${departmentId}/members/${memberId}`,
    { method: 'DELETE' },
  )
}

export async function createGroup(organizationId: string, input: UserGroupInput): Promise<void> {
  await apiRequest<unknown>(`/organizations/${organizationId}/groups`, {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export async function updateGroup(
  organizationId: string,
  groupId: string,
  input: UserGroupInput,
): Promise<void> {
  await apiRequest<unknown>(`/organizations/${organizationId}/groups/${groupId}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  })
}

export function deleteGroup(organizationId: string, groupId: string): Promise<void> {
  return apiRequest<void>(`/organizations/${organizationId}/groups/${groupId}`, {
    method: 'DELETE',
  })
}

export function addGroupMember(
  organizationId: string,
  groupId: string,
  memberId: string,
): Promise<void> {
  return apiRequest<void>(
    `/organizations/${organizationId}/groups/${groupId}/members/${memberId}`,
    { method: 'PUT' },
  )
}

export function removeGroupMember(
  organizationId: string,
  groupId: string,
  memberId: string,
): Promise<void> {
  return apiRequest<void>(
    `/organizations/${organizationId}/groups/${groupId}/members/${memberId}`,
    { method: 'DELETE' },
  )
}

export async function listInvitations(organizationId: string): Promise<OrganizationInvitation[]> {
  const result = await apiRequest<unknown>(`/organizations/${organizationId}/invitations`)
  return z.array(organizationInvitationSchema).parse(result)
}

export async function createInvitation(
  organizationId: string,
  input: CreateOrganizationInvitationInput,
): Promise<CreatedOrganizationInvitation> {
  const result = await apiRequest<unknown>(`/organizations/${organizationId}/invitations`, {
    method: 'POST',
    body: JSON.stringify(input),
  })
  return createdOrganizationInvitationSchema.parse(result)
}

export function revokeInvitation(organizationId: string, invitationId: string): Promise<void> {
  return apiRequest<void>(`/organizations/${organizationId}/invitations/${invitationId}`, {
    method: 'DELETE',
  })
}

export async function previewInvitation(token: string): Promise<OrganizationInvitationPreview> {
  const result = await apiRequest<unknown>(`/organization-invitations/${token}`)
  return organizationInvitationPreviewSchema.parse(result)
}

export async function acceptInvitation(
  token: string,
  input: { name?: string; password: string },
): Promise<AuthSession> {
  const result = await apiRequest<unknown>(`/organization-invitations/${token}/accept`, {
    method: 'POST',
    body: JSON.stringify(input),
  })
  return authSessionSchema.parse(result)
}
