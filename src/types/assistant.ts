import type { PaginatedResult } from './knowledge-base'

export type AiModelProvider = 'openai' | 'qwen' | 'deepseek' | 'doubao'

export interface AiModelPricing {
  currency: 'CNY' | 'USD'
  inputPerMillionTokens: number
  cachedInputPerMillionTokens: number
  outputPerMillionTokens: number
  effectiveDate: string
}

export interface AiModelOption {
  id: string
  provider: AiModelProvider
  displayName: string
  isDefault: boolean
  pricing: AiModelPricing | null
}

export interface AiUsageTokenSummary {
  callCount: number
  inputTokens: number
  outputTokens: number
  totalTokens: number
  cachedInputTokens: number
  reasoningOutputTokens: number
}

export interface AiUsageCostSummary {
  currency: AiModelPricing['currency']
  amount: number
  budget: number | null
  usageRatio: number | null
}

export interface AiUsageModelSummary extends AiUsageTokenSummary {
  provider: string
  model: string
  cost: Pick<AiUsageCostSummary, 'currency' | 'amount'> | null
}

export interface AiUsageDailySummary extends AiUsageTokenSummary {
  date: string
  costs: Array<Pick<AiUsageCostSummary, 'currency' | 'amount'>>
}

export interface AiUsageReport {
  month: string
  timeZone: string
  budgetPolicy: {
    warningRatio: number
    fallbackRatio: number
    autoFallbackEnabled: boolean
  }
  totals: AiUsageTokenSummary
  costs: AiUsageCostSummary[]
  byModel: AiUsageModelSummary[]
  daily: AiUsageDailySummary[]
}

export type AiProviderHealthStatus = 'healthy' | 'degraded' | 'unavailable' | 'idle'

export interface AiProviderHealthTotals {
  requests: number
  successes: number
  failures: number
  successRate: number | null
  averageDurationMs: number | null
  failovers: number
}

export interface AiProviderHealthModel extends AiProviderHealthTotals {
  modelId: string
  provider: AiModelProvider
  displayName: string
  status: AiProviderHealthStatus
  circuitOpen: boolean
  circuitRetryAfterSeconds: number | null
  timeoutCount: number
  rateLimitCount: number
  unavailableCount: number
  providerErrorCount: number
  failoverOutCount: number
  failoverInCount: number
  lastActivityDate: string | null
}

export interface AiProviderHealthDaily extends AiProviderHealthTotals {
  date: string
}

export type AiProviderIncidentType = 'circuit_opened' | 'circuit_recovered'

export interface AiProviderIncident {
  id: string
  type: AiProviderIncidentType
  modelId: string
  occurredAt: string
  reason: AiProviderFailover['reason'] | null
  failureCount: number | null
  openSeconds: number | null
}

export interface AiProviderHealthReport {
  period: {
    days: number
    from: string
    to: string
    timeZone: string
  }
  totals: AiProviderHealthTotals
  models: AiProviderHealthModel[]
  daily: AiProviderHealthDaily[]
  incidents: AiProviderIncident[]
  alertDeliveries: AiProviderAlertDelivery[]
}

export type AiProviderAlertFailureReason = 'alerts_disabled' | 'network_error' | 'http_error'

export interface AiProviderAlertDelivery {
  id: string
  incidentId: string
  incidentType: AiProviderIncidentType
  modelId: string
  incidentOccurredAt: string
  reason: AiProviderFailover['reason'] | null
  failureCount: number | null
  openSeconds: number | null
  attempt: number
  trigger: 'initial' | 'automatic' | 'manual'
  retriedFromDeliveryId: string | null
  attemptedAt: string
  status: 'disabled' | 'delivered' | 'failed'
  channel: 'generic' | 'wecom' | 'dingtalk'
  statusCode: number | null
  failureReason: AiProviderAlertFailureReason | null
}

export interface AiProviderAlertTestInput {
  modelId: string
  type: AiProviderIncidentType
}

export interface AiProviderAlertTestResult {
  status: 'disabled' | 'delivered' | 'failed'
  channel: 'generic' | 'wecom' | 'dingtalk'
  statusCode: number | null
  failureReason: AiProviderAlertFailureReason | null
  incidentType: AiProviderIncidentType
  modelId: string
}

export interface AiProviderAlertRetryResult extends AiProviderAlertTestResult {
  retriedFromDeliveryId: string
}

export type AiBudgetStatus = 'untracked' | 'normal' | 'warning' | 'limit' | 'fallback'

export interface AiBudgetDecision {
  requestedModelId: string
  effectiveModelId: string
  status: AiBudgetStatus
  currency: AiModelPricing['currency'] | null
  spent: number | null
  budget: number | null
  usageRatio: number | null
}

export interface AiProviderFailover {
  fromModelId: string
  toModelId: string
  reason: 'timeout' | 'rate_limited' | 'unavailable' | 'provider_error' | 'circuit_open'
}

export interface Conversation {
  id: string
  title: string | null
  knowledgeBaseId: string | null
  createdAt: string
  updatedAt: string
}

export interface CitationLocation {
  pageStart: number | null
  pageEnd: number | null
  sectionPath: string[] | null
  worksheetName: string | null
  cellRange: string | null
  chunkPosition: number
}

export interface CitationDocumentVersion {
  versionSeriesId: string
  version: number
  versionLabel: string | null
  effectiveAt: string | null
  expiresAt: string | null
  publishedAt: string | null
}

export interface Citation {
  sourceId: string
  chunkId: string
  documentId: string
  documentName: string
  position: number
  similarityScore: number
  documentVersion?: CitationDocumentVersion
  location?: CitationLocation
  excerpt?: string | null
  excerptTruncated?: boolean
  excerptWithheldReason?: 'sensitive_information'
}

export type RagScenario =
  | 'internal_policy'
  | 'product_documentation'
  | 'operation_manual'
  | 'customer_service_assist'
  | 'unknown'

export interface CustomerServiceResponse {
  customerFacingReply: string
  internalTroubleshooting: string[]
  followUpQuestions: string[]
  escalationConditions: string[]
  prohibitedCommitments: string[]
}

export interface StructuredResponse {
  schemaVersion: '1.0'
  scenario: RagScenario
  answer: string
  steps: string[]
  applicableConditions: string[]
  riskWarnings: string[]
  citations: string[]
  missingInformation: string[]
  refusalReason: string | null
  customerService: CustomerServiceResponse | null
}

export interface AiTokenUsage {
  inputTokens: number
  outputTokens: number
  totalTokens: number
  cachedInputTokens: number
  reasoningOutputTokens: number
}

export interface ConversationMessage {
  id: string
  position: number
  role: 'SYSTEM' | 'USER' | 'ASSISTANT' | 'TOOL'
  status: 'PENDING' | 'COMPLETED' | 'FAILED'
  content: string | null
  clientRequestId: string | null
  parentMessageId: string | null
  provider: string | null
  model: string | null
  providerResponseId: string | null
  finishReason: string | null
  usage: AiTokenUsage | null
  citations: Citation[] | null
  structuredResponse: StructuredResponse | null
  errorCode: string | null
  createdAt: string
  updatedAt: string
}

export type FeedbackRating = 'HELPFUL' | 'UNHELPFUL'
export type FeedbackReason =
  | 'INCORRECT'
  | 'INCOMPLETE'
  | 'INACCURATE_CITATION'
  | 'SHOULD_HAVE_ANSWERED'
  | 'SHOULD_HAVE_REFUSED'
  | 'NOT_ACTIONABLE'
  | 'EXPRESSION'
  | 'OTHER'

export interface MessageFeedback {
  id: string
  assistantMessageId: string
  rating: FeedbackRating
  reason: FeedbackReason | null
  comment: string | null
  clientRequestId: string
  createdAt: string
  updatedAt: string
}

export type PaginatedConversations = PaginatedResult<Conversation>
export type PaginatedMessages = PaginatedResult<ConversationMessage>
