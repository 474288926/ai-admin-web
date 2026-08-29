import type { PaginatedResult } from './knowledge-base'

export type DocumentStatus = 'UPLOADED' | 'PROCESSING' | 'READY' | 'FAILED'
export type DocumentEmbeddingStatus = 'NOT_READY' | 'PENDING' | 'PROCESSING' | 'READY' | 'FAILED'
export type DocumentLifecycleStatus = 'DRAFT' | 'PUBLISHED' | 'ARCHIVED'
export type DocumentIngestionJobStatus =
  | 'PENDING'
  | 'RUNNING'
  | 'SUCCEEDED'
  | 'FAILED'
  | 'CANCELLED'
export type DocumentIngestionStage = 'QUEUED' | 'PARSING' | 'EMBEDDING' | 'COMPLETED'

export interface DocumentIngestionJob {
  id: string
  documentId: string
  status: DocumentIngestionJobStatus
  stage: DocumentIngestionStage
  progress: number
  attempt: number
  maxAttempts: number
  lastErrorCode: string | null
  cancelRequestedAt: string | null
  startedAt: string | null
  finishedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface KnowledgeDocument {
  id: string
  ingestionJob: DocumentIngestionJob | null
  ownerUserId: string | null
  versionSeriesId: string
  replacesDocumentId: string | null
  originalName: string
  mimeType: string
  sizeBytes: number
  checksumSha256: string
  status: DocumentStatus
  embeddingStatus: DocumentEmbeddingStatus
  lifecycleStatus: DocumentLifecycleStatus
  accessMode: 'INHERIT' | 'RESTRICTED'
  sensitivityLevel: 'INTERNAL' | 'CONFIDENTIAL' | 'RESTRICTED'
  category: string | null
  businessDomain: string | null
  tags: string[]
  version: number
  versionLabel: string | null
  effectiveAt: string | null
  expiresAt: string | null
  publishedAt: string | null
  pageCount: number | null
  characterCount: number | null
  chunkCount: number
  errorCode: string | null
  processingStartedAt: string | null
  processedAt: string | null
  embeddingStartedAt: string | null
  embeddedAt: string | null
  embeddingErrorCode: string | null
  embeddingInputTokens: number | null
  embeddingGeneratedChunkCount: number
  embeddingReusedChunkCount: number
  embeddingProviderInputCount: number
  createdAt: string
  updatedAt: string
}

export type PaginatedDocuments = PaginatedResult<KnowledgeDocument>

export interface DocumentLifecycleSummary {
  published: number
  ready: number
  processing: number
  failed: number
  expired: number
  expiringSoon: number
  withoutExpiry: number
}

export interface DocumentBatchItem {
  id: string
  position: number
  originalName: string
  documentId: string | null
  existingDocumentId: string | null
  status: 'PENDING' | 'REJECTED' | 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'CANCELLED'
  progress: number
  errorCode: string | null
}

export interface DocumentBatch {
  id: string
  knowledgeBaseId: string
  status: 'PROCESSING' | 'SUCCEEDED' | 'PARTIALLY_SUCCEEDED' | 'FAILED' | 'CANCELLED'
  progress: number
  totalFiles: number
  acceptedFiles: number
  rejectedFiles: number
  pendingFiles: number
  runningFiles: number
  succeededFiles: number
  failedFiles: number
  cancelledFiles: number
  items: DocumentBatchItem[]
  createdAt: string
  updatedAt: string
}

export interface UpdateDocumentMetadataInput {
  accessMode?: 'INHERIT' | 'RESTRICTED'
  sensitivityLevel?: 'INTERNAL' | 'CONFIDENTIAL' | 'RESTRICTED'
  category?: string | null
  businessDomain?: string | null
  tags?: string[]
  versionLabel?: string | null
  effectiveAt?: string | null
  expiresAt?: string | null
}

export interface DocumentVersionList {
  versionSeriesId: string
  currentDocumentId: string | null
  items: KnowledgeDocument[]
}
