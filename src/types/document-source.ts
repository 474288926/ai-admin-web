export type DocumentSyncRunStatus = 'RUNNING' | 'SUCCEEDED' | 'PARTIALLY_SUCCEEDED' | 'FAILED'

export interface DocumentSyncSummary {
  discovered: number
  created: number
  updated: number
  unchanged: number
  missing: number
  failed: number
}

export interface DocumentSyncRun {
  id: string
  status: DocumentSyncRunStatus
  summary: DocumentSyncSummary
  errors: Array<{ externalId: string; code: string }>
  startedAt: string
  finishedAt: string | null
  createdAt: string
}

export interface DocumentSource {
  id: string
  knowledgeBaseId: string
  name: string
  type: 'LOCAL_DIRECTORY'
  rootPath: string
  enabled: boolean
  recursive: boolean
  lastSyncedAt: string | null
  lastRunStatus: DocumentSyncRunStatus | null
  createdAt: string
  updatedAt: string
  _count?: { items: number; runs: number }
  runs?: DocumentSyncRun[]
}

export interface CreateDocumentSourceInput {
  name: string
  rootPath: string
  recursive: boolean
}

export interface UpdateDocumentSourceInput {
  name?: string
  rootPath?: string
  recursive?: boolean
  enabled?: boolean
}
