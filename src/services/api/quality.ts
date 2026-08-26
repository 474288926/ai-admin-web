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

export const knowledgeBacklogItemSchema = z.object({
  id: z.uuid(),
  questionFingerprint: z.string().regex(/^[a-f0-9]{64}$/i),
  linkedDocumentId: z.uuid().nullable(),
  noAnswerCount: z.number().int().nonnegative(),
  unhelpfulCount: z.number().int().nonnegative(),
  feedbackReasonCounts: z.record(z.string(), z.number().int().nonnegative()),
  status: z.enum(['OPEN', 'TRIAGED', 'RESOLVED', 'DISMISSED']),
  title: z.string().nullable(),
  note: z.string().nullable(),
  revision: z.number().int().nonnegative(),
  firstObservedAt: z.iso.datetime(),
  lastObservedAt: z.iso.datetime(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
})

export type KnowledgeBacklogItem = z.infer<typeof knowledgeBacklogItemSchema>

export const knowledgeBacklogCandidateSchema = z.object({
  fingerprint: z.string().regex(/^[a-f0-9]{64}$/i),
  noAnswerCount: z.number().int().nonnegative(),
  unhelpfulCount: z.number().int().nonnegative(),
  feedbackReasonCounts: z.array(z.object({ reason: z.string(), count: z.number().int().nonnegative() })),
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
  status?: 'OPEN' | 'TRIAGED' | 'RESOLVED' | 'DISMISSED',
): Promise<KnowledgeBacklogItem[]> {
  const params = new URLSearchParams({ limit: '100' })
  if (status) params.set('status', status)
  const result = await apiRequest<unknown>(
    `/knowledge-bases/${knowledgeBaseId}/quality/knowledge-backlog?${params}`,
  )
  return z.array(knowledgeBacklogItemSchema).parse(result)
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
): Promise<{ createdOrUpdatedCount: number; skippedFingerprints: string[]; items: KnowledgeBacklogItem[] }> {
  const result = await apiRequest<unknown>(
    `/knowledge-bases/${knowledgeBaseId}/quality/knowledge-backlog`,
    { method: 'POST', body: JSON.stringify(input) },
  )
  return z.object({
    createdOrUpdatedCount: z.number().int().nonnegative(),
    skippedFingerprints: z.array(z.string()),
    items: z.array(knowledgeBacklogItemSchema),
  }).parse(result)
}

export async function updateKnowledgeBacklog(
  knowledgeBaseId: string,
  itemId: string,
  input: { revision: number; status?: 'OPEN' | 'TRIAGED' | 'RESOLVED' | 'DISMISSED'; linkedDocumentId?: string | null; title?: string; note?: string },
): Promise<KnowledgeBacklogItem> {
  const result = await apiRequest<unknown>(
    `/knowledge-bases/${knowledgeBaseId}/quality/knowledge-backlog/${itemId}`,
    { method: 'PATCH', body: JSON.stringify(input) },
  )
  return knowledgeBacklogItemSchema.parse(result)
}
