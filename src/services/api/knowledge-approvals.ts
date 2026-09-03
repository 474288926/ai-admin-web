import { z } from 'zod'

import type {
  ApprovalComplianceReportSummary,
  ApprovalReportStatus,
  ApprovalReportType,
  ApprovalNotification,
  ApprovalNotificationEventType,
  ApprovalNotificationStatus,
  KnowledgeApproval,
  KnowledgeApprovalCapabilities,
  KnowledgeApprovalDecision,
  KnowledgeApprovalRole,
  KnowledgeApprovalStatus,
  PaginatedKnowledgeApprovals,
  PaginatedApprovalNotifications,
} from '@/types/knowledge-approval'
import { apiRequest } from './client'

const userSchema = z.object({ id: z.uuid(), email: z.email(), name: z.string().nullable() })
const roleSchema = z.enum(['BUSINESS_OWNER', 'KNOWLEDGE_OPERATIONS', 'RETRIEVAL_MAINTAINER'])
const decisionSchema = z.enum(['APPROVED', 'REJECTED'])
const statusSchema = z.enum(['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED', 'INVALIDATED'])
const stepSchema = z.object({
  id: z.uuid(),
  role: roleSchema,
  position: z.number().int().positive(),
  decision: decisionSchema.nullable(),
  comment: z.string().nullable(),
  decidedByUserId: z.uuid().nullable(),
  decidedByUser: userSchema.nullable(),
  decidedAt: z.iso.datetime().nullable(),
  assignedToUserId: z.uuid().nullable(),
  assignedToUser: userSchema.nullable(),
  assignedByUserId: z.uuid().nullable(),
  assignedByUser: userSchema.nullable(),
  assignedAt: z.iso.datetime().nullable(),
  canDecide: z.boolean(),
  ineligibleReason: z.string().nullable(),
})
const impactSummarySchema = z.object({
  knowledgeBaseCount: z.number().int().nonnegative(),
  currentPublishedDocumentCount: z.number().int().nonnegative(),
  customerCitableDocumentCount: z.number().int().nonnegative(),
  internalOnlyDocumentCount: z.number().int().nonnegative(),
  unclassifiedDocumentCount: z.number().int().nonnegative(),
  invalidDocumentCount: z.number().int().nonnegative(),
  legacyAudienceSignalDocumentCount: z.number().int().nonnegative(),
  currentRoutingCustomerCitableDocumentCount: z.number().int().nonnegative(),
  targetRoutingCustomerCitableDocumentCount: z.number().int().nonnegative(),
  targetRoutingNewlyExcludedDocumentCount: z.number().int().nonnegative(),
  potentialAffectedSuiteCount: z.number().int().nonnegative(),
  potentialAffectedCustomerServiceCaseCount: z.number().int().nonnegative(),
})
const approvalSchema = z.object({
  id: z.uuid(),
  reference: z.string(),
  organizationId: z.uuid(),
  type: z.literal('DOCUMENT_AUDIENCE_CONTRACT'),
  status: statusSchema,
  subjectId: z.string(),
  subjectVersion: z.string(),
  subjectSha256: z.string().length(64),
  knowledgeBaseIds: z.array(z.uuid()),
  revision: z.number().int().nonnegative(),
  createdBy: userSchema,
  cancelledBy: userSchema.nullable(),
  cancelledAt: z.iso.datetime().nullable(),
  completedAt: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  steps: z.array(stepSchema),
  events: z.array(
    z.object({
      id: z.uuid(),
      action: z.string(),
      metadata: z.unknown().nullable(),
      createdAt: z.iso.datetime(),
      actorUser: userSchema.nullable(),
    }),
  ),
  progress: z.object({ approved: z.number().int(), required: z.number().int() }),
  capabilities: z.object({
    canCancel: z.boolean(),
    canReissue: z.boolean(),
    canExport: z.boolean(),
    canAssign: z.boolean(),
  }),
  snapshotCurrent: z.boolean(),
  subject: z.record(z.string(), z.unknown()).optional(),
  impactSnapshot: z
    .object({
      summary: impactSummarySchema,
      readiness: z.object({ blockerCodes: z.array(z.string()), nextAction: z.string() }),
      documents: z.array(
        z.object({
          id: z.uuid(),
          knowledgeBaseName: z.string(),
          originalName: z.string(),
          classification: z.string(),
          audienceTags: z.array(z.string()),
        }),
      ),
      potentialAffectedSuites: z.array(
        z.object({
          id: z.uuid(),
          name: z.string(),
          version: z.number().int(),
          customerServiceCaseCount: z.number().int(),
        }),
      ),
    })
    .optional(),
})
const paginationSchema = z.object({
  page: z.number().int(),
  pageSize: z.number().int(),
  total: z.number().int(),
  totalPages: z.number().int(),
  hasNextPage: z.boolean(),
})
const capabilitiesSchema = z.object({
  canCreate: z.boolean(),
  currentUserRole: z.string(),
  requiredDistinctApprovers: z.number().int(),
  maximumDistinctApprovers: z.number().int(),
  readyToComplete: z.boolean(),
  blocker: z.string().nullable(),
  roles: z.array(z.object({ role: roleSchema, users: z.array(userSchema) })),
})
const reportTypeSchema = z.enum(['ALL', 'DOCUMENT_AUDIENCE_CONTRACT', 'DOCUMENT_AUDIENCE_APPROVAL'])
const reportStatusSchema = z.union([z.literal('ALL'), statusSchema])
const complianceReportSummarySchema = z.object({
  organization: z.object({ id: z.uuid(), name: z.string() }),
  filters: z.object({
    organizationId: z.uuid(),
    type: reportTypeSchema,
    status: reportStatusSchema,
    from: z.iso.datetime().nullable(),
    to: z.iso.datetime().nullable(),
  }),
  total: z.number().int().nonnegative(),
  byType: z.object({
    DOCUMENT_AUDIENCE_CONTRACT: z.number().int().nonnegative(),
    DOCUMENT_AUDIENCE_APPROVAL: z.number().int().nonnegative(),
  }),
  byStatus: z.object({
    PENDING: z.number().int().nonnegative(),
    APPROVED: z.number().int().nonnegative(),
    REJECTED: z.number().int().nonnegative(),
    CANCELLED: z.number().int().nonnegative(),
    INVALIDATED: z.number().int().nonnegative(),
  }),
  generatedAt: z.iso.datetime(),
  controls: z.object({ reportIsReadOnly: z.boolean() }),
})
const notificationStatusSchema = z.enum(['PENDING', 'PROCESSING', 'DELIVERED', 'FAILED', 'SKIPPED'])
const notificationEventTypeSchema = z.enum([
  'DOCUMENT_PREPARATION_ASSIGNED',
  'DOCUMENT_APPROVAL_CREATED',
  'DOCUMENT_APPROVAL_ASSIGNED',
  'DOCUMENT_APPROVAL_DECIDED',
])
const notificationAttemptSchema = z.object({
  id: z.uuid(),
  attempt: z.number().int().positive(),
  trigger: z.enum(['AUTOMATIC', 'MANUAL']),
  status: notificationStatusSchema,
  statusCode: z.number().int().nullable(),
  errorCode: z.string().nullable(),
  attemptedAt: z.iso.datetime(),
})
const approvalNotificationSchema = z.object({
  id: z.uuid(),
  eventType: notificationEventTypeSchema,
  status: notificationStatusSchema,
  title: z.string(),
  message: z.string(),
  actionUrl: z.url(),
  attempt: z.number().int().nonnegative(),
  maxAttempts: z.number().int().positive(),
  nextAttemptAt: z.iso.datetime(),
  lastAttemptAt: z.iso.datetime().nullable(),
  deliveredAt: z.iso.datetime().nullable(),
  lastStatusCode: z.number().int().nullable(),
  lastErrorCode: z.string().nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  recipientUser: userSchema,
  attempts: z.array(notificationAttemptSchema),
})

function complianceReportParams(input: {
  organizationId: string
  type: ApprovalReportType
  status: ApprovalReportStatus
  from?: string
  to?: string
}): URLSearchParams {
  const params = new URLSearchParams({
    organizationId: input.organizationId,
    type: input.type,
    status: input.status,
  })
  if (input.from) params.set('from', input.from)
  if (input.to) params.set('to', input.to)
  return params
}

export async function getApprovalComplianceReportSummary(input: {
  organizationId: string
  type: ApprovalReportType
  status: ApprovalReportStatus
  from?: string
  to?: string
}): Promise<ApprovalComplianceReportSummary> {
  const params = complianceReportParams(input)
  return complianceReportSummarySchema.parse(
    await apiRequest<unknown>(`/knowledge-approvals/compliance-report/summary?${params}`),
  )
}

export function exportApprovalComplianceReport(input: {
  organizationId: string
  type: ApprovalReportType
  status: ApprovalReportStatus
  from?: string
  to?: string
}): Promise<unknown> {
  const params = complianceReportParams(input)
  return apiRequest<unknown>(`/knowledge-approvals/compliance-report/export?${params}`)
}

export async function listKnowledgeApprovals(input: {
  organizationId: string
  page?: number
  pageSize?: number
  status?: KnowledgeApprovalStatus
}): Promise<PaginatedKnowledgeApprovals> {
  const params = new URLSearchParams({
    organizationId: input.organizationId,
    page: String(input.page ?? 1),
    pageSize: String(input.pageSize ?? 20),
  })
  if (input.status) params.set('status', input.status)
  const result = await apiRequest<unknown>(`/knowledge-approvals?${params}`)
  return z.object({ items: z.array(approvalSchema), meta: paginationSchema }).parse(result)
}

export async function getKnowledgeApproval(id: string): Promise<KnowledgeApproval> {
  return approvalSchema.parse(await apiRequest<unknown>(`/knowledge-approvals/${id}`))
}

export async function getKnowledgeApprovalCapabilities(
  organizationId: string,
): Promise<KnowledgeApprovalCapabilities> {
  const params = new URLSearchParams({ organizationId })
  return capabilitiesSchema.parse(
    await apiRequest<unknown>(`/knowledge-approvals/capabilities?${params}`),
  )
}

export async function createDocumentAudienceApproval(
  organizationId: string,
): Promise<KnowledgeApproval> {
  return approvalSchema.parse(
    await apiRequest<unknown>('/knowledge-approvals/document-audience-contract', {
      method: 'POST',
      body: JSON.stringify({ organizationId }),
    }),
  )
}

export async function decideKnowledgeApproval(
  id: string,
  input: {
    role: KnowledgeApprovalRole
    decision: KnowledgeApprovalDecision
    comment?: string
    revision: number
  },
): Promise<KnowledgeApproval> {
  return approvalSchema.parse(
    await apiRequest<unknown>(`/knowledge-approvals/${id}/decision`, {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  )
}

export async function assignKnowledgeApprovalRoles(
  id: string,
  input: {
    revision: number
    assignments: Array<{ role: KnowledgeApprovalRole; userId: string }>
  },
): Promise<KnowledgeApproval> {
  return approvalSchema.parse(
    await apiRequest<unknown>(`/knowledge-approvals/${id}/assignments`, {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  )
}

export async function cancelKnowledgeApproval(
  id: string,
  revision: number,
  reason?: string,
): Promise<KnowledgeApproval> {
  return approvalSchema.parse(
    await apiRequest<unknown>(`/knowledge-approvals/${id}/cancel`, {
      method: 'POST',
      body: JSON.stringify({ revision, reason }),
    }),
  )
}

export async function reissueKnowledgeApproval(
  id: string,
  revision: number,
): Promise<KnowledgeApproval> {
  return approvalSchema.parse(
    await apiRequest<unknown>(`/knowledge-approvals/${id}/reissue`, {
      method: 'POST',
      body: JSON.stringify({ revision }),
    }),
  )
}

export function exportKnowledgeApproval(id: string): Promise<unknown> {
  return apiRequest<unknown>(`/knowledge-approvals/${id}/export`)
}

export async function listApprovalNotifications(input: {
  organizationId: string
  page?: number
  pageSize?: number
  status?: ApprovalNotificationStatus
  eventType?: ApprovalNotificationEventType
}): Promise<PaginatedApprovalNotifications> {
  const params = new URLSearchParams({
    organizationId: input.organizationId,
    page: String(input.page ?? 1),
    pageSize: String(input.pageSize ?? 20),
  })
  if (input.status) params.set('status', input.status)
  if (input.eventType) params.set('eventType', input.eventType)
  return z
    .object({ items: z.array(approvalNotificationSchema), meta: paginationSchema })
    .parse(await apiRequest<unknown>(`/knowledge-approvals/notifications?${params}`))
}

export async function retryApprovalNotification(id: string): Promise<ApprovalNotification> {
  return approvalNotificationSchema.parse(
    await apiRequest<unknown>(`/knowledge-approvals/notifications/${id}/retry`, {
      method: 'POST',
    }),
  )
}
