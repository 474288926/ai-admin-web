import { z } from 'zod'

import type { QualitySummary, QualitySummaryQuery } from '@/types/quality'
import { apiRequest } from './client'

const feedbackReasonSchema = z.enum([
  'INCORRECT',
  'INCOMPLETE',
  'INACCURATE_CITATION',
  'SHOULD_HAVE_ANSWERED',
  'SHOULD_HAVE_REFUSED',
  'NOT_ACTIONABLE',
  'EXPRESSION',
  'OTHER',
])
const qualityEventTypeSchema = z.enum(['NO_ANSWER', 'CONFLICT_REFUSAL', 'GENERATION_FAILURE'])

export const qualitySummarySchema = z.object({
  feedbackTotal: z.number().int().nonnegative(),
  helpfulCount: z.number().int().nonnegative(),
  unhelpfulCount: z.number().int().nonnegative(),
  helpfulRate: z.number().min(0).max(1).nullable(),
  reasonCounts: z.array(
    z.object({ reason: feedbackReasonSchema, count: z.number().int().nonnegative() }),
  ),
  qualityEventCounts: z.array(
    z.object({ type: qualityEventTypeSchema, count: z.number().int().nonnegative() }),
  ),
  frequentIssues: z.array(
    z.object({
      fingerprint: z.string().regex(/^[a-f0-9]{64}$/i),
      type: qualityEventTypeSchema,
      count: z.number().int().nonnegative(),
      lastOccurredAt: z.iso.datetime(),
    }),
  ),
})

export async function getQualitySummary(
  knowledgeBaseId: string,
  query: QualitySummaryQuery = {},
): Promise<QualitySummary> {
  const params = new URLSearchParams()
  if (query.from) params.set('from', query.from)
  if (query.to) params.set('to', query.to)
  if (query.topIssueLimit) params.set('topIssueLimit', String(query.topIssueLimit))
  const suffix = params.size ? `?${params}` : ''
  const result = await apiRequest<unknown>(
    `/knowledge-bases/${knowledgeBaseId}/quality/summary${suffix}`,
  )
  return qualitySummarySchema.parse(result)
}

const knowledgeBacklogResolutionBlockReasonSchema = z.enum([
  'DOCUMENT_NOT_LINKED',
  'DOCUMENT_DELETED',
  'DOCUMENT_NOT_READY',
  'EMBEDDING_NOT_READY',
  'DOCUMENT_NOT_PUBLISHED',
  'DOCUMENT_NOT_EFFECTIVE',
  'DOCUMENT_EXPIRED',
  'DOCUMENT_HAS_NO_CHUNKS',
  'VERIFICATION_RUN_NOT_LINKED',
  'VERIFICATION_RUN_NOT_FULL',
  'VERIFICATION_RUN_DOES_NOT_COVER_DOCUMENT',
  'VERIFICATION_RUN_TOO_OLD',
  'VERIFICATION_RUN_NOT_COMPLETED',
  'VERIFICATION_GATE_NOT_PASSED',
])
const knowledgeBacklogPrioritySchema = z.enum(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'])
const knowledgeBacklogRecommendedActionSchema = z.enum([
  'ADD_KNOWLEDGE',
  'CORRECT_KNOWLEDGE',
  'RUN_VERIFICATION',
  'FIX_AND_REVERIFY',
  'CLOSE_BACKLOG',
  'MONITOR',
])

export const knowledgeBacklogItemSchema = z.object({
  id: z.uuid(),
  questionFingerprint: z.string().regex(/^[a-f0-9]{64}$/i),
  linkedDocumentId: z.uuid().nullable(),
  linkedDocument: z
    .object({
      id: z.uuid(),
      originalName: z.string(),
      version: z.number().int().positive(),
      versionLabel: z.string().nullable(),
      status: z.enum(['UPLOADED', 'PROCESSING', 'READY', 'FAILED']),
      embeddingStatus: z.enum(['NOT_READY', 'PENDING', 'PROCESSING', 'READY', 'FAILED']),
      lifecycleStatus: z.enum(['DRAFT', 'PUBLISHED', 'ARCHIVED']),
      effectiveAt: z.iso.datetime().nullable(),
      expiresAt: z.iso.datetime().nullable(),
    })
    .nullable(),
  verificationRunId: z.uuid().nullable(),
  verificationRun: z
    .object({
      id: z.uuid(),
      suiteId: z.uuid(),
      suiteName: z.string(),
      suiteVersion: z.number().int().positive(),
      status: z.enum(['PENDING', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED']),
      gatePassed: z.boolean().nullable(),
      totalCases: z.number().int().nonnegative(),
      passedCases: z.number().int().nonnegative(),
      failedCases: z.number().int().nonnegative(),
      errorCases: z.number().int().nonnegative(),
      createdAt: z.iso.datetime(),
      finishedAt: z.iso.datetime().nullable(),
    })
    .nullable(),
  documentReady: z.boolean(),
  documentBlockedReasons: z.array(knowledgeBacklogResolutionBlockReasonSchema),
  verificationReady: z.boolean(),
  verificationBlockedReasons: z.array(knowledgeBacklogResolutionBlockReasonSchema),
  resolutionReady: z.boolean(),
  resolutionBlockedReasons: z.array(knowledgeBacklogResolutionBlockReasonSchema),
  noAnswerCount: z.number().int().nonnegative(),
  unhelpfulCount: z.number().int().nonnegative(),
  feedbackReasonCounts: z.record(z.string(), z.number().int().nonnegative()),
  priority: knowledgeBacklogPrioritySchema,
  priorityScore: z.number().int().min(0).max(100),
  recommendedAction: knowledgeBacklogRecommendedActionSchema,
  status: z.enum(['OPEN', 'TRIAGED', 'RESOLVED', 'DISMISSED']),
  title: z.string().nullable(),
  note: z.string().nullable(),
  dueAt: z.iso.datetime().nullable(),
  overdue: z.boolean(),
  dueSoon: z.boolean(),
  revision: z.number().int().nonnegative(),
  firstObservedAt: z.iso.datetime(),
  lastObservedAt: z.iso.datetime(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
})

export type KnowledgeBacklogItem = z.infer<typeof knowledgeBacklogItemSchema>

const knowledgeBacklogListResponseSchema = z.object({
  items: z.array(knowledgeBacklogItemSchema),
  meta: z.object({
    page: z.number().int().positive(),
    pageSize: z.number().int().positive().max(100),
    total: z.number().int().nonnegative(),
    totalPages: z.number().int().nonnegative(),
    scannedCount: z.number().int().nonnegative(),
    truncated: z.boolean(),
    scanLimit: z.number().int().positive(),
    hasNextPage: z.boolean(),
  }),
})

export type KnowledgeBacklogListResponse = z.infer<typeof knowledgeBacklogListResponseSchema>

const knowledgeBacklogOverviewSchema = z.object({
  activeCount: z.number().int().nonnegative(),
  scannedActiveCount: z.number().int().nonnegative(),
  truncated: z.boolean(),
  scanLimit: z.number().int().positive(),
  criticalCount: z.number().int().nonnegative(),
  highPriorityCount: z.number().int().nonnegative(),
  awaitingDocumentCount: z.number().int().nonnegative(),
  awaitingVerificationCount: z.number().int().nonnegative(),
  readyToCloseCount: z.number().int().nonnegative(),
  overdueCount: z.number().int().nonnegative(),
  dueSoonCount: z.number().int().nonnegative(),
  unplannedCount: z.number().int().nonnegative(),
})

export type KnowledgeBacklogOverview = z.infer<typeof knowledgeBacklogOverviewSchema>

const knowledgeBacklogHistoryItemSchema = z.object({
  id: z.uuid(),
  action: z.enum([
    'knowledge_backlog.created',
    'knowledge_backlog.refreshed',
    'knowledge_backlog.reopened',
    'knowledge_backlog.updated',
    'knowledge_backlog.verification_started',
  ]),
  changes: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])),
  createdAt: z.iso.datetime(),
  actor: z.object({ id: z.uuid(), email: z.email(), name: z.string().nullable() }).nullable(),
})

export type KnowledgeBacklogHistoryItem = z.infer<typeof knowledgeBacklogHistoryItemSchema>

export const knowledgeBacklogCandidateSchema = z.object({
  fingerprint: z.string().regex(/^[a-f0-9]{64}$/i),
  noAnswerCount: z.number().int().nonnegative(),
  unhelpfulCount: z.number().int().nonnegative(),
  feedbackReasonCounts: z.array(
    z.object({ reason: z.string(), count: z.number().int().nonnegative() }),
  ),
  firstObservedAt: z.iso.datetime(),
  lastObservedAt: z.iso.datetime(),
  alreadyTracked: z.boolean(),
})

export type KnowledgeBacklogCandidate = z.infer<typeof knowledgeBacklogCandidateSchema>

const knowledgeBacklogPreviewSchema = z.object({
  scannedFingerprintCount: z.number().int().nonnegative(),
  candidates: z.array(knowledgeBacklogCandidateSchema),
})

export type KnowledgeBacklogPreview = z.infer<typeof knowledgeBacklogPreviewSchema>

export type KnowledgeBacklogPreviewQuery = {
  from?: string
  to?: string
  minimumNoAnswerCount?: number
  minimumUnhelpfulCount?: number
  limit?: number
}

function backlogQueryString(query: KnowledgeBacklogPreviewQuery): string {
  const params = new URLSearchParams()
  if (query.from) params.set('from', query.from)
  if (query.to) params.set('to', query.to)
  if (query.minimumNoAnswerCount !== undefined)
    params.set('minimumNoAnswerCount', String(query.minimumNoAnswerCount))
  if (query.minimumUnhelpfulCount !== undefined)
    params.set('minimumUnhelpfulCount', String(query.minimumUnhelpfulCount))
  if (query.limit !== undefined) params.set('limit', String(query.limit))
  return params.size ? `?${params}` : ''
}

export async function listKnowledgeBacklog(
  knowledgeBaseId: string,
  query: {
    search?: string
    status?: 'ACTIVE' | 'OPEN' | 'TRIAGED' | 'RESOLVED' | 'DISMISSED'
    priority?: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW'
    stage?: 'AWAITING_DOCUMENT' | 'AWAITING_VERIFICATION' | 'READY_TO_CLOSE'
    deadline?: 'OVERDUE' | 'DUE_SOON' | 'NO_DUE_DATE'
    sort?: 'PRIORITY' | 'RECENT'
    page?: number
    pageSize?: number
  } = {},
): Promise<KnowledgeBacklogListResponse> {
  const params = new URLSearchParams()
  if (query.search) params.set('search', query.search)
  if (query.status) params.set('status', query.status)
  if (query.priority) params.set('priority', query.priority)
  if (query.stage) params.set('stage', query.stage)
  if (query.deadline) params.set('deadline', query.deadline)
  if (query.sort) params.set('sort', query.sort)
  if (query.page !== undefined) params.set('page', String(query.page))
  if (query.pageSize !== undefined) params.set('pageSize', String(query.pageSize))
  const result = await apiRequest<unknown>(
    `/knowledge-bases/${knowledgeBaseId}/quality/knowledge-backlog?${params}`,
  )
  return knowledgeBacklogListResponseSchema.parse(result)
}

export async function getKnowledgeBacklogOverview(
  knowledgeBaseId: string,
): Promise<KnowledgeBacklogOverview> {
  const result = await apiRequest<unknown>(
    `/knowledge-bases/${knowledgeBaseId}/quality/knowledge-backlog/overview`,
  )
  return knowledgeBacklogOverviewSchema.parse(result)
}

export async function getKnowledgeBacklogHistory(
  knowledgeBaseId: string,
  itemId: string,
): Promise<KnowledgeBacklogHistoryItem[]> {
  const result = await apiRequest<unknown>(
    `/knowledge-bases/${knowledgeBaseId}/quality/knowledge-backlog/${itemId}/history`,
  )
  return z.array(knowledgeBacklogHistoryItemSchema).parse(result)
}

export async function previewKnowledgeBacklog(
  knowledgeBaseId: string,
  query: KnowledgeBacklogPreviewQuery = {},
): Promise<KnowledgeBacklogPreview> {
  const result = await apiRequest<unknown>(
    `/knowledge-bases/${knowledgeBaseId}/quality/knowledge-backlog/preview${backlogQueryString(query)}`,
  )
  return knowledgeBacklogPreviewSchema.parse(result)
}

export async function createKnowledgeBacklog(
  knowledgeBaseId: string,
  input: KnowledgeBacklogPreviewQuery & { fingerprints: string[] },
): Promise<{
  createdOrUpdatedCount: number
  reopenedCount: number
  skippedFingerprints: string[]
  items: KnowledgeBacklogItem[]
}> {
  const result = await apiRequest<unknown>(
    `/knowledge-bases/${knowledgeBaseId}/quality/knowledge-backlog`,
    { method: 'POST', body: JSON.stringify(input) },
  )
  return z
    .object({
      createdOrUpdatedCount: z.number().int().nonnegative(),
      reopenedCount: z.number().int().nonnegative(),
      skippedFingerprints: z.array(z.string()),
      items: z.array(knowledgeBacklogItemSchema),
    })
    .parse(result)
}

export async function updateKnowledgeBacklog(
  knowledgeBaseId: string,
  itemId: string,
  input: {
    revision: number
    status?: 'OPEN' | 'TRIAGED' | 'RESOLVED' | 'DISMISSED'
    linkedDocumentId?: string | null
    verificationRunId?: string | null
    title?: string
    note?: string
    dueAt?: string | null
  },
): Promise<KnowledgeBacklogItem> {
  const result = await apiRequest<unknown>(
    `/knowledge-bases/${knowledgeBaseId}/quality/knowledge-backlog/${itemId}`,
    { method: 'PATCH', body: JSON.stringify(input) },
  )
  return knowledgeBacklogItemSchema.parse(result)
}

export async function batchUpdateKnowledgeBacklogDueAt(
  knowledgeBaseId: string,
  input: {
    items: Array<{ id: string; revision: number }>
    dueAt: string | null
  },
): Promise<{ updatedCount: number; items: KnowledgeBacklogItem[] }> {
  const result = await apiRequest<unknown>(
    `/knowledge-bases/${knowledgeBaseId}/quality/knowledge-backlog/batch/due-at`,
    { method: 'PATCH', body: JSON.stringify(input) },
  )
  return z
    .object({
      updatedCount: z.number().int().nonnegative(),
      items: z.array(knowledgeBacklogItemSchema),
    })
    .parse(result)
}
