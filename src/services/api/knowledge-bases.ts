import { z } from 'zod'

import type {
  CreateKnowledgeBaseInput,
  KnowledgeBase,
  KnowledgeBaseGrants,
  OrganizationSummary,
  OrganizationStructure,
  PaginatedResult,
  ResourceGrantTargetType,
  UpsertKnowledgeBaseGrantInput,
  UpdateKnowledgeBaseInput,
} from '@/types/knowledge-base'
import { apiRequest } from './client'

const knowledgeBaseSchema = z.object({
  id: z.uuid(),
  organizationId: z.uuid().nullable(),
  visibility: z.enum(['PRIVATE', 'ORGANIZATION', 'RESTRICTED']),
  name: z.string(),
  description: z.string().nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
})

const paginatedKnowledgeBasesSchema = z.object({
  items: z.array(knowledgeBaseSchema),
  meta: z.object({
    page: z.number().int().positive(),
    pageSize: z.number().int().positive(),
    total: z.number().int().nonnegative(),
    totalPages: z.number().int().nonnegative(),
    hasNextPage: z.boolean(),
  }),
})

const organizationSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  slug: z.string(),
  currentRole: z.enum(['OWNER', 'ADMIN', 'KNOWLEDGE_ADMIN', 'MEMBER', 'SUPPORT']),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
})

const permissionSchema = z.enum(['READ', 'EDIT', 'MANAGE'])
const knowledgeBaseGrantsSchema = z.object({
  organizationId: z.uuid().nullable(),
  users: z.array(
    z.object({
      userId: z.uuid(),
      permission: permissionSchema,
      user: z.object({ email: z.email(), name: z.string().nullable() }),
    }),
  ),
  departments: z.array(
    z.object({
      departmentId: z.uuid(),
      permission: permissionSchema,
      department: z.object({ name: z.string() }),
    }),
  ),
  groups: z.array(
    z.object({
      groupId: z.uuid(),
      permission: permissionSchema,
      group: z.object({ name: z.string() }),
    }),
  ),
})

const organizationStructureSchema = organizationSchema.extend({
  memberships: z.array(
    z.object({
      id: z.uuid(),
      userId: z.uuid(),
      role: z.enum(['OWNER', 'ADMIN', 'KNOWLEDGE_ADMIN', 'MEMBER', 'SUPPORT']),
      status: z.enum(['INVITED', 'ACTIVE', 'SUSPENDED']),
      joinedAt: z.iso.datetime().nullable(),
      user: z.object({ email: z.email(), name: z.string().nullable() }),
    }),
  ),
  departments: z.array(
    z.object({
      id: z.uuid(),
      name: z.string(),
      parentId: z.uuid().nullable(),
      sourceSystem: z.string().nullable(),
      memberIds: z.array(z.uuid()),
    }),
  ),
  groups: z.array(
    z.object({
      id: z.uuid(),
      name: z.string(),
      description: z.string().nullable(),
      memberIds: z.array(z.uuid()),
    }),
  ),
})

export async function listKnowledgeBases(
  page: number,
  pageSize: number,
): Promise<PaginatedResult<KnowledgeBase>> {
  const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) })
  const result = await apiRequest<unknown>(`/knowledge-bases?${params}`)
  return paginatedKnowledgeBasesSchema.parse(result)
}

export async function listOrganizations(): Promise<OrganizationSummary[]> {
  const result = await apiRequest<unknown>('/organizations')
  return z.array(organizationSchema).parse(result)
}

export async function getKnowledgeBase(id: string): Promise<KnowledgeBase> {
  const result = await apiRequest<unknown>(`/knowledge-bases/${id}`)
  return knowledgeBaseSchema.parse(result)
}

export async function getOrganization(id: string): Promise<OrganizationStructure> {
  const result = await apiRequest<unknown>(`/organizations/${id}`)
  return organizationStructureSchema.parse(result)
}

export async function listKnowledgeBaseGrants(id: string): Promise<KnowledgeBaseGrants> {
  const result = await apiRequest<unknown>(`/knowledge-bases/${id}/grants`)
  return knowledgeBaseGrantsSchema.parse(result)
}

export function upsertKnowledgeBaseGrant(
  id: string,
  input: UpsertKnowledgeBaseGrantInput,
): Promise<void> {
  return apiRequest<void>(`/knowledge-bases/${id}/grants`, {
    method: 'PUT',
    body: JSON.stringify(input),
  })
}

export function removeKnowledgeBaseGrant(
  id: string,
  targetType: ResourceGrantTargetType,
  targetId: string,
): Promise<void> {
  return apiRequest<void>(`/knowledge-bases/${id}/grants/${targetType}/${targetId}`, {
    method: 'DELETE',
  })
}

export async function createKnowledgeBase(input: CreateKnowledgeBaseInput): Promise<KnowledgeBase> {
  const result = await apiRequest<unknown>('/knowledge-bases', {
    method: 'POST',
    body: JSON.stringify(input),
  })
  return knowledgeBaseSchema.parse(result)
}

export async function updateKnowledgeBase(
  id: string,
  input: UpdateKnowledgeBaseInput,
): Promise<KnowledgeBase> {
  const result = await apiRequest<unknown>(`/knowledge-bases/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  })
  return knowledgeBaseSchema.parse(result)
}

export function deleteKnowledgeBase(id: string): Promise<void> {
  return apiRequest<void>(`/knowledge-bases/${id}`, { method: 'DELETE' })
}
