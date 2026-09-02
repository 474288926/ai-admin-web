export type KnowledgeApprovalType = 'DOCUMENT_AUDIENCE_CONTRACT'
export type KnowledgeApprovalStatus =
  | 'PENDING'
  | 'APPROVED'
  | 'REJECTED'
  | 'CANCELLED'
  | 'INVALIDATED'
export type KnowledgeApprovalRole =
  | 'BUSINESS_OWNER'
  | 'KNOWLEDGE_OPERATIONS'
  | 'RETRIEVAL_MAINTAINER'
export type KnowledgeApprovalDecision = 'APPROVED' | 'REJECTED'

export interface KnowledgeApprovalUser {
  id: string
  email: string
  name: string | null
}

export interface KnowledgeApprovalStep {
  id: string
  role: KnowledgeApprovalRole
  position: number
  decision: KnowledgeApprovalDecision | null
  comment: string | null
  decidedByUserId: string | null
  decidedByUser: KnowledgeApprovalUser | null
  decidedAt: string | null
  assignedToUserId: string | null
  assignedToUser: KnowledgeApprovalUser | null
  assignedByUserId: string | null
  assignedByUser: KnowledgeApprovalUser | null
  assignedAt: string | null
  canDecide: boolean
  ineligibleReason: string | null
}

export interface KnowledgeApprovalImpactSummary {
  knowledgeBaseCount: number
  currentPublishedDocumentCount: number
  customerCitableDocumentCount: number
  internalOnlyDocumentCount: number
  unclassifiedDocumentCount: number
  invalidDocumentCount: number
  legacyAudienceSignalDocumentCount: number
  currentRoutingCustomerCitableDocumentCount: number
  targetRoutingCustomerCitableDocumentCount: number
  targetRoutingNewlyExcludedDocumentCount: number
  potentialAffectedSuiteCount: number
  potentialAffectedCustomerServiceCaseCount: number
}

export interface KnowledgeApproval {
  id: string
  reference: string
  organizationId: string
  type: KnowledgeApprovalType
  status: KnowledgeApprovalStatus
  subjectId: string
  subjectVersion: string
  subjectSha256: string
  knowledgeBaseIds: string[]
  revision: number
  createdBy: KnowledgeApprovalUser
  cancelledBy: KnowledgeApprovalUser | null
  cancelledAt: string | null
  completedAt: string | null
  createdAt: string
  updatedAt: string
  steps: KnowledgeApprovalStep[]
  events: Array<{
    id: string
    action: string
    metadata: unknown
    createdAt: string
    actorUser: KnowledgeApprovalUser | null
  }>
  progress: { approved: number; required: number }
  capabilities: {
    canCancel: boolean
    canReissue: boolean
    canExport: boolean
    canAssign: boolean
  }
  snapshotCurrent: boolean
  subject?: Record<string, unknown>
  impactSnapshot?: {
    summary: KnowledgeApprovalImpactSummary
    readiness: { blockerCodes: string[]; nextAction: string }
    documents: Array<{
      id: string
      knowledgeBaseName: string
      originalName: string
      classification: string
      audienceTags: string[]
    }>
    potentialAffectedSuites: Array<{
      id: string
      name: string
      version: number
      customerServiceCaseCount: number
    }>
  }
}

export interface KnowledgeApprovalCapabilities {
  canCreate: boolean
  currentUserRole: string
  requiredDistinctApprovers: number
  maximumDistinctApprovers: number
  readyToComplete: boolean
  blocker: string | null
  roles: Array<{ role: KnowledgeApprovalRole; users: KnowledgeApprovalUser[] }>
}

export interface PaginatedKnowledgeApprovals {
  items: KnowledgeApproval[]
  meta: {
    page: number
    pageSize: number
    total: number
    totalPages: number
    hasNextPage: boolean
  }
}
