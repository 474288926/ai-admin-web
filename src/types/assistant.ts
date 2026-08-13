import type { PaginatedResult } from './knowledge-base'

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
  usage: {
    inputTokens: number
    outputTokens: number
    totalTokens: number
    cachedInputTokens: number
    reasoningOutputTokens: number
  } | null
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
