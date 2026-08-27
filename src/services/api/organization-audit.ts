import { z } from 'zod'

import type { OrganizationAuditQuery, OrganizationAuditResult } from '@/types/organization-audit'
import { apiRequest } from './client'

const auditChangeValueSchema = z.union([z.string(), z.number(), z.boolean(), z.null()])

export const organizationAuditResultSchema = z.object({
  items: z.array(
    z.object({
      id: z.uuid(),
      entityType: z.enum(['ORGANIZATION', 'KNOWLEDGE_BASE', 'DOCUMENT', 'KNOWLEDGE_BACKLOG']),
      entityId: z.uuid(),
      action: z.string().min(1),
      changes: z.record(z.string(), auditChangeValueSchema).nullable(),
      createdAt: z.iso.datetime(),
      actor: z
        .object({
          id: z.uuid(),
          email: z.email(),
          name: z.string().nullable(),
        })
        .nullable(),
    }),
  ),
  meta: z.object({
    page: z.number().int().positive(),
    pageSize: z.number().int().positive(),
    total: z.number().int().nonnegative(),
    totalPages: z.number().int().nonnegative(),
    hasNextPage: z.boolean(),
  }),
})

export async function listOrganizationAuditLogs(
  organizationId: string,
  query: OrganizationAuditQuery = {},
): Promise<OrganizationAuditResult> {
  const search = new URLSearchParams()
  if (query.page !== undefined) search.set('page', String(query.page))
  if (query.pageSize !== undefined) search.set('pageSize', String(query.pageSize))
  if (query.entityType) search.set('entityType', query.entityType)
  if (query.action) search.set('action', query.action)
  if (query.actorUserId) search.set('actorUserId', query.actorUserId)
  if (query.from) search.set('from', query.from)
  if (query.to) search.set('to', query.to)

  const suffix = search.size > 0 ? `?${search.toString()}` : ''
  const result = await apiRequest<unknown>(`/organizations/${organizationId}/audit-logs${suffix}`)
  return organizationAuditResultSchema.parse(result)
}
