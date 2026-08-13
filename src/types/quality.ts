export type FeedbackReason =
  | 'INCORRECT'
  | 'INCOMPLETE'
  | 'INACCURATE_CITATION'
  | 'SHOULD_HAVE_ANSWERED'
  | 'SHOULD_HAVE_REFUSED'
  | 'NOT_ACTIONABLE'
  | 'EXPRESSION'
  | 'OTHER'

export type QualityEventType = 'NO_ANSWER' | 'CONFLICT_REFUSAL' | 'GENERATION_FAILURE'

export interface QualitySummaryQuery {
  from?: string
  to?: string
  topIssueLimit?: number
}

export interface QualitySummary {
  feedbackTotal: number
  helpfulCount: number
  unhelpfulCount: number
  helpfulRate: number | null
  reasonCounts: Array<{ reason: FeedbackReason; count: number }>
  qualityEventCounts: Array<{ type: QualityEventType; count: number }>
  frequentIssues: Array<{
    fingerprint: string
    type: QualityEventType
    count: number
    lastOccurredAt: string
  }>
}
