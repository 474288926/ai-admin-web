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
