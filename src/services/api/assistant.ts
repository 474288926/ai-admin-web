import { z } from 'zod'

import type {
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

export async function sendMessage(conversationId: string, content: string) {
  const result = await apiRequest<unknown>(`/conversations/${conversationId}/messages`, {
    method: 'POST',
    body: JSON.stringify({ clientRequestId: crypto.randomUUID(), content, mode: 'standard' }),
  })
  return z
    .object({
      userMessage: conversationMessageSchema,
      assistantMessage: conversationMessageSchema,
      replayed: z.boolean(),
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
