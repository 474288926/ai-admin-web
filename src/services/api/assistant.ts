import { z } from 'zod'

import type {
  AiModelOption,
  AiProviderAlertTestInput,
  AiProviderAlertTestResult,
  AiProviderAlertRetryResult,
  AiProviderHealthReport,
  AiUsageReport,
  Conversation,
  FeedbackRating,
  FeedbackReason,
  MessageFeedback,
  PaginatedConversations,
  PaginatedMessages,
} from '@/types/assistant'
import { apiRequest } from './client'

const paginationSchema = z.object({
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
  total: z.number().int().nonnegative(),
  totalPages: z.number().int().nonnegative(),
  hasNextPage: z.boolean(),
})

const conversationSchema = z.object({
  id: z.uuid(),
  title: z.string().nullable(),
  knowledgeBaseId: z.uuid().nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
})

const aiModelOptionSchema = z.object({
  id: z.string().min(1),
  provider: z.enum(['openai', 'qwen', 'deepseek', 'doubao']),
  displayName: z.string().min(1),
  isDefault: z.boolean(),
  pricing: z
    .object({
      currency: z.enum(['CNY', 'USD']),
      inputPerMillionTokens: z.number().nonnegative(),
      cachedInputPerMillionTokens: z.number().nonnegative(),
      outputPerMillionTokens: z.number().nonnegative(),
      effectiveDate: z.iso.date(),
    })
    .nullable(),
})

const aiUsageTokenSummarySchema = z.object({
  callCount: z.number().int().nonnegative(),
  inputTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative(),
  totalTokens: z.number().int().nonnegative(),
  cachedInputTokens: z.number().int().nonnegative(),
  reasoningOutputTokens: z.number().int().nonnegative(),
})

const aiUsageCostSchema = z.object({
  currency: z.enum(['CNY', 'USD']),
  amount: z.number().nonnegative(),
  budget: z.number().nonnegative().nullable(),
  usageRatio: z.number().nonnegative().nullable(),
})

const aiUsageReportSchema = z.object({
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
  timeZone: z.string().min(1),
  budgetPolicy: z.object({
    warningRatio: z.number().nonnegative(),
    fallbackRatio: z.number().nonnegative(),
    autoFallbackEnabled: z.boolean(),
  }),
  totals: aiUsageTokenSummarySchema,
  costs: z.array(aiUsageCostSchema),
  byModel: z.array(
    aiUsageTokenSummarySchema.extend({
      provider: z.string().min(1),
      model: z.string().min(1),
      cost: aiUsageCostSchema.pick({ currency: true, amount: true }).nullable(),
    }),
  ),
  daily: z.array(
    aiUsageTokenSummarySchema.extend({
      date: z.iso.date(),
      costs: z.array(aiUsageCostSchema.pick({ currency: true, amount: true })),
    }),
  ),
})

const aiProviderHealthTotalsSchema = z.object({
  requests: z.number().int().nonnegative(),
  successes: z.number().int().nonnegative(),
  failures: z.number().int().nonnegative(),
  successRate: z.number().min(0).max(1).nullable(),
  averageDurationMs: z.number().int().nonnegative().nullable(),
  failovers: z.number().int().nonnegative(),
})

const aiProviderHealthReportSchema = z.object({
  period: z.object({
    days: z.number().int().min(1).max(30),
    from: z.iso.date(),
    to: z.iso.date(),
    timeZone: z.string().min(1),
  }),
  totals: aiProviderHealthTotalsSchema,
  models: z.array(
    aiProviderHealthTotalsSchema.extend({
      modelId: z.string().min(1),
      provider: z.enum(['openai', 'qwen', 'deepseek', 'doubao']),
      displayName: z.string().min(1),
      status: z.enum(['healthy', 'degraded', 'unavailable', 'idle']),
      circuitOpen: z.boolean(),
      circuitRetryAfterSeconds: z.number().int().positive().nullable(),
      timeoutCount: z.number().int().nonnegative(),
      rateLimitCount: z.number().int().nonnegative(),
      unavailableCount: z.number().int().nonnegative(),
      providerErrorCount: z.number().int().nonnegative(),
      failoverOutCount: z.number().int().nonnegative(),
      failoverInCount: z.number().int().nonnegative(),
      lastActivityDate: z.iso.date().nullable(),
    }),
  ),
  daily: z.array(
    aiProviderHealthTotalsSchema.extend({
      date: z.iso.date(),
    }),
  ),
  incidents: z.array(
    z.object({
      id: z.uuid(),
      type: z.enum(['circuit_opened', 'circuit_recovered']),
      modelId: z.string().min(1),
      occurredAt: z.iso.datetime(),
      reason: z
        .enum(['timeout', 'rate_limited', 'unavailable', 'provider_error', 'circuit_open'])
        .nullable(),
      failureCount: z.number().int().positive().nullable(),
      openSeconds: z.number().int().positive().nullable(),
    }),
  ),
  alertDeliveries: z.array(
    z.object({
      id: z.uuid(),
      incidentId: z.uuid(),
      incidentType: z.enum(['circuit_opened', 'circuit_recovered']),
      modelId: z.string().min(1),
      incidentOccurredAt: z.iso.datetime(),
      reason: z
        .enum(['timeout', 'rate_limited', 'unavailable', 'provider_error', 'circuit_open'])
        .nullable(),
      failureCount: z.number().int().nonnegative().nullable(),
      openSeconds: z.number().int().nonnegative().nullable(),
      attempt: z.number().int().positive(),
      trigger: z.enum(['initial', 'automatic', 'manual']),
      retriedFromDeliveryId: z.uuid().nullable(),
      attemptedAt: z.iso.datetime(),
      status: z.enum(['disabled', 'delivered', 'failed']),
      channel: z.enum(['generic', 'wecom', 'dingtalk']),
      statusCode: z.number().int().min(100).max(599).nullable(),
      failureReason: z.enum(['alerts_disabled', 'network_error', 'http_error']).nullable(),
    }),
  ),
})

const aiProviderAlertTestResultSchema = z.object({
  status: z.enum(['disabled', 'delivered', 'failed']),
  channel: z.enum(['generic', 'wecom', 'dingtalk']),
  statusCode: z.number().int().min(100).max(599).nullable(),
  failureReason: z.enum(['alerts_disabled', 'network_error', 'http_error']).nullable(),
  incidentType: z.enum(['circuit_opened', 'circuit_recovered']),
  modelId: z.string().min(1),
})

const aiProviderAlertRetryResultSchema = aiProviderAlertTestResultSchema.extend({
  retriedFromDeliveryId: z.uuid(),
})

const aiBudgetDecisionSchema = z.object({
  requestedModelId: z.string().min(1),
  effectiveModelId: z.string().min(1),
  status: z.enum(['untracked', 'normal', 'warning', 'limit', 'fallback']),
  currency: z.enum(['CNY', 'USD']).nullable(),
  spent: z.number().nonnegative().nullable(),
  budget: z.number().nonnegative().nullable(),
  usageRatio: z.number().nonnegative().nullable(),
})

const aiProviderFailoverSchema = z.object({
  fromModelId: z.string().min(1),
  toModelId: z.string().min(1),
  reason: z.enum(['timeout', 'rate_limited', 'unavailable', 'provider_error', 'circuit_open']),
})

const citationLocationSchema = z.object({
  pageStart: z.number().int().positive().nullable(),
  pageEnd: z.number().int().positive().nullable(),
  sectionPath: z.array(z.string()).nullable(),
  worksheetName: z.string().nullable(),
  cellRange: z.string().nullable(),
  chunkPosition: z.number().int().positive(),
})

const citationDocumentVersionSchema = z.object({
  versionSeriesId: z.uuid(),
  version: z.number().int().positive(),
  versionLabel: z.string().nullable(),
  effectiveAt: z.iso.datetime().nullable(),
  expiresAt: z.iso.datetime().nullable(),
  publishedAt: z.iso.datetime().nullable(),
})

const citationSchema = z.object({
  sourceId: z.string().min(1),
  chunkId: z.uuid(),
  documentId: z.uuid(),
  documentName: z.string().min(1),
  position: z.number().int().positive(),
  similarityScore: z.number().min(-1).max(1),
  documentVersion: citationDocumentVersionSchema.optional(),
  location: citationLocationSchema.optional(),
  excerpt: z.string().nullable().optional(),
  excerptTruncated: z.boolean().optional(),
  excerptWithheldReason: z.literal('sensitive_information').optional(),
})

const customerServiceSchema = z.object({
  customerFacingReply: z.string(),
  internalTroubleshooting: z.array(z.string()),
  followUpQuestions: z.array(z.string()),
  escalationConditions: z.array(z.string()),
  prohibitedCommitments: z.array(z.string()),
})

const structuredResponseSchema = z.object({
  schemaVersion: z.literal('1.0'),
  scenario: z.enum([
    'internal_policy',
    'product_documentation',
    'operation_manual',
    'customer_service_assist',
    'unknown',
  ]),
  answer: z.string(),
  steps: z.array(z.string()),
  applicableConditions: z.array(z.string()),
  riskWarnings: z.array(z.string()),
  citations: z.array(z.string()),
  missingInformation: z.array(z.string()),
  refusalReason: z.string().nullable(),
  customerService: customerServiceSchema.nullable(),
})

export const conversationMessageSchema = z.object({
  id: z.uuid(),
  position: z.number().int().positive(),
  role: z.enum(['SYSTEM', 'USER', 'ASSISTANT', 'TOOL']),
  status: z.enum(['PENDING', 'COMPLETED', 'FAILED']),
  content: z.string().nullable(),
  clientRequestId: z.uuid().nullable(),
  parentMessageId: z.uuid().nullable(),
  provider: z.string().nullable(),
  model: z.string().nullable(),
  providerResponseId: z.string().nullable(),
  finishReason: z.string().nullable(),
  usage: z
    .object({
      inputTokens: z.number().int().nonnegative(),
      outputTokens: z.number().int().nonnegative(),
      totalTokens: z.number().int().nonnegative(),
      cachedInputTokens: z.number().int().nonnegative(),
      reasoningOutputTokens: z.number().int().nonnegative(),
    })
    .nullable(),
  citations: z.array(citationSchema).nullable(),
  structuredResponse: structuredResponseSchema.nullable(),
  errorCode: z.string().nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
})

const feedbackSchema = z.object({
  id: z.uuid(),
  assistantMessageId: z.uuid(),
  rating: z.enum(['HELPFUL', 'UNHELPFUL']),
  reason: z
    .enum([
      'INCORRECT',
      'INCOMPLETE',
      'INACCURATE_CITATION',
      'SHOULD_HAVE_ANSWERED',
      'SHOULD_HAVE_REFUSED',
      'NOT_ACTIONABLE',
      'EXPRESSION',
      'OTHER',
    ])
    .nullable(),
  comment: z.string().nullable(),
  clientRequestId: z.uuid(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
})

export async function listConversations(page = 1, pageSize = 100): Promise<PaginatedConversations> {
  const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) })
  const result = await apiRequest<unknown>(`/conversations?${params}`)
  return z.object({ items: z.array(conversationSchema), meta: paginationSchema }).parse(result)
}

export async function listAiModels(): Promise<AiModelOption[]> {
  const result = await apiRequest<unknown>('/ai/models')
  return z.array(aiModelOptionSchema).parse(result)
}

export async function getAiUsageSummary(month?: string): Promise<AiUsageReport> {
  const params = new URLSearchParams()
  if (month) params.set('month', month)
  const query = params.size ? `?${params}` : ''
  const result = await apiRequest<unknown>(`/ai/usage/summary${query}`)
  return aiUsageReportSchema.parse(result)
}

export async function getAiProviderHealthSummary(days = 7): Promise<AiProviderHealthReport> {
  const result = await apiRequest<unknown>(`/ai/health/summary?days=${days}`)
  return aiProviderHealthReportSchema.parse(result)
}

export async function sendAiProviderAlertTest(
  input: AiProviderAlertTestInput,
): Promise<AiProviderAlertTestResult> {
  const result = await apiRequest<unknown>('/ai/health/alerts/test', {
    method: 'POST',
    body: JSON.stringify(input),
  })
  return aiProviderAlertTestResultSchema.parse(result)
}

export async function retryAiProviderAlertDelivery(
  deliveryId: string,
): Promise<AiProviderAlertRetryResult> {
  const result = await apiRequest<unknown>(`/ai/health/alerts/deliveries/${deliveryId}/retry`, {
    method: 'POST',
  })
  return aiProviderAlertRetryResultSchema.parse(result)
}

export async function createConversation(input: {
  knowledgeBaseId: string
  title?: string
}): Promise<Conversation> {
  const result = await apiRequest<unknown>('/conversations', {
    method: 'POST',
    body: JSON.stringify(input),
  })
  return conversationSchema.parse(result)
}

export function deleteConversation(conversationId: string): Promise<void> {
  return apiRequest<void>(`/conversations/${conversationId}`, { method: 'DELETE' })
}

export async function listMessages(
  conversationId: string,
  page = 1,
  pageSize = 100,
): Promise<PaginatedMessages> {
  const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) })
  const result = await apiRequest<unknown>(`/conversations/${conversationId}/messages?${params}`)
  return z
    .object({ items: z.array(conversationMessageSchema), meta: paginationSchema })
    .parse(result)
}

export async function sendMessage(conversationId: string, content: string, modelId?: string) {
  const result = await apiRequest<unknown>(`/conversations/${conversationId}/messages`, {
    method: 'POST',
    body: JSON.stringify({
      clientRequestId: crypto.randomUUID(),
      content,
      mode: 'standard',
      ...(modelId ? { modelId } : {}),
    }),
  })
  return z
    .object({
      userMessage: conversationMessageSchema,
      assistantMessage: conversationMessageSchema,
      replayed: z.boolean(),
      modelSelection: aiBudgetDecisionSchema.optional(),
      providerFailover: aiProviderFailoverSchema.optional(),
    })
    .parse(result)
}

export async function getMessageFeedback(
  conversationId: string,
  messageId: string,
): Promise<MessageFeedback> {
  const result = await apiRequest<unknown>(
    `/conversations/${conversationId}/messages/${messageId}/feedback`,
  )
  return feedbackSchema.parse(result)
}

export async function upsertMessageFeedback(
  conversationId: string,
  messageId: string,
  input: { rating: FeedbackRating; reason?: FeedbackReason; comment?: string },
): Promise<MessageFeedback> {
  const result = await apiRequest<unknown>(
    `/conversations/${conversationId}/messages/${messageId}/feedback`,
    {
      method: 'PUT',
      body: JSON.stringify({ ...input, clientRequestId: crypto.randomUUID() }),
    },
  )
  return feedbackSchema.parse(result)
}
