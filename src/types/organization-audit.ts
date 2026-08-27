export type OrganizationAuditEntityType =
  | 'ORGANIZATION'
  | 'KNOWLEDGE_BASE'
  | 'DOCUMENT'
  | 'KNOWLEDGE_BACKLOG'
export type OrganizationAuditChangeValue = string | number | boolean | null

export interface OrganizationAuditActor {
  id: string
  email: string
  name: string | null
}

export interface OrganizationAuditLog {
  id: string
  entityType: OrganizationAuditEntityType
  entityId: string
  action: string
  changes: Record<string, OrganizationAuditChangeValue> | null
  createdAt: string
  actor: OrganizationAuditActor | null
}

export interface OrganizationAuditQuery {
  page?: number
  pageSize?: number
  entityType?: OrganizationAuditEntityType
  action?: string
  actorUserId?: string
  from?: string
  to?: string
}

export interface OrganizationAuditResult {
  items: OrganizationAuditLog[]
  meta: {
    page: number
    pageSize: number
    total: number
    totalPages: number
    hasNextPage: boolean
  }
}
