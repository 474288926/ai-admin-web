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
  audienceEvidence: DocumentAudienceEvidence | null
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

export interface DocumentAudienceEvidence {
  id: string
  proposedAudienceTag: 'audience:customer-citable' | 'audience:internal-only'
  documentChecksumSha256: string
  documentVersion: number
  businessEvidenceId: string | null
  approvalId: string | null
  businessOwner: string
  businessEvidenceReference: string
  approvalReference: string
  approvalAt: string
  decision: 'APPROVED' | 'REJECTED'
  comment: string | null
  submittedByUserId: string
  createdAt: string
  updatedAt: string
}

export interface UpsertDocumentAudienceEvidenceInput {
  proposedAudienceTag: DocumentAudienceEvidence['proposedAudienceTag']
  businessOwner: string
  businessEvidenceId: string
  approvalId: string
  businessEvidenceReference?: string
  approvalReference?: string
  approvalAt?: string
  decision: DocumentAudienceEvidence['decision']
  comment?: string | null
}

export interface DocumentBusinessEvidence {
  id: string
  documentId: string
  documentChecksumSha256: string
  documentVersion: number
  reference: string
  title: string
  details: string
  detailsHtml: string
  attachments: DocumentBusinessEvidenceAttachment[]
  createdByUserId: string
  createdAt: string
  updatedAt: string
}

export interface DocumentBusinessEvidenceAttachment {
  id: string
  evidenceId: string
  originalName: string
  mimeType: string
  sizeBytes: number
  checksumSha256: string
  createdByUserId: string
  createdAt: string
}

export interface DocumentAudienceApproval {
  id: string
  reference: string
  documentId: string
  documentChecksumSha256: string
  documentVersion: number
  businessEvidenceId: string
  businessEvidence: Pick<DocumentBusinessEvidence, 'id' | 'reference' | 'title'>
  proposedAudienceTag: DocumentAudienceEvidence['proposedAudienceTag']
  businessOwner: string
  status: 'PENDING' | 'APPROVED' | 'REJECTED'
  decisionComment: string | null
  createdByUser: { id: string; email: string; name: string | null }
  decidedByUser: { id: string; email: string; name: string | null } | null
  assignedToUserId: string | null
  assignedByUserId: string | null
  assignedToUser: DocumentApprovalUser | null
  assignedByUser: DocumentApprovalUser | null
  assignedAt: string | null
  dueAt: string
  assignments: DocumentAudienceApprovalAssignment[]
  decidedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface DocumentApprovalUser {
  id: string
  email: string
  name: string | null
}

export interface DocumentAudienceApprovalAssignment {
  id: string
  fromUserId: string | null
  toUserId: string
  assignedByUserId: string
  reason: string | null
  dueAt: string
  createdAt: string
  fromUser: DocumentApprovalUser | null
  toUser: DocumentApprovalUser
  assignedByUser: DocumentApprovalUser
}

export interface DocumentAudiencePreparation {
  id: string
  documentId: string
  documentChecksumSha256: string
  documentVersion: number
  assignedToUserId: string
  assignedByUserId: string
  assignedToUser: DocumentApprovalUser
  assignedByUser: DocumentApprovalUser
  dueAt: string
  reason: string
  completedAt: string | null
  completedByUserId: string | null
  createdAt: string
  updatedAt: string
}

export interface DocumentAudienceApprovalSummary {
  preparationPending: number
  preparationActionable: number
  preparationOverdue: number
  preparationItems: DocumentAudiencePreparationTodoItem[]
  pending: number
  actionable: number
  overdue: number
  escalationRequired: number
  truncated: boolean
  items: DocumentAudienceApprovalTodoItem[]
}

export interface DocumentAudiencePreparationTodoItem {
  preparationId: string
  documentId: string
  documentName: string
  documentVersion: number
  assignedToUserId: string
  assignedToDisplayName: string
  assignedByDisplayName: string
  dueAt: string
  reason: string
  createdAt: string
  overdue: boolean
}

export type DocumentAudienceApprovalQueueStage =
  | 'NOT_STARTED'
  | 'PREPARATION'
  | 'PENDING'
  | 'READY_TO_FINALIZE'
  | 'COMPLETED'
  | 'REJECTED'

export interface DocumentAudienceApprovalQueueItem {
  documentId: string
  stage: DocumentAudienceApprovalQueueStage
  latestApprovalReference: string | null
  latestApprovalDueAt: string | null
  preparation: DocumentAudiencePreparation | null
  document: KnowledgeDocument
}

export interface DocumentAudienceApprovalQueueCounts {
  total: number
  notStarted: number
  preparation: number
  pending: number
  readyToFinalize: number
  completed: number
  rejected: number
}

export interface DocumentAudienceApprovalQueue {
  items: DocumentAudienceApprovalQueueItem[]
  counts: DocumentAudienceApprovalQueueCounts
  meta: PaginatedResult<never>['meta']
}

export interface DocumentAudienceApprovalTodoItem {
  approvalId: string
  reference: string
  documentId: string
  documentName: string
  documentVersion: number
  businessEvidenceReference: string
  businessEvidenceTitle: string
  proposedAudienceTag: DocumentAudienceEvidence['proposedAudienceTag']
  businessOwner: string
  createdByDisplayName: string
  assignedToUserId: string | null
  assignedToDisplayName: string | null
  dueAt: string
  canDecide: boolean
  createdAt: string
  ageHours: number
  overdue: boolean
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
