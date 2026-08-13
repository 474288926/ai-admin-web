import { z } from 'zod'

import type {
  CreateDocumentSourceInput,
  DocumentSource,
  DocumentSyncRun,
  UpdateDocumentSourceInput,
} from '@/types/document-source'
import { apiRequest } from './client'

const syncSummarySchema = z.object({
  discovered: z.number().int().nonnegative(),
  created: z.number().int().nonnegative(),
  updated: z.number().int().nonnegative(),
  unchanged: z.number().int().nonnegative(),
  missing: z.number().int().nonnegative(),
  failed: z.number().int().nonnegative(),
})

const syncRunSchema = z.object({
  id: z.uuid(),
  status: z.enum(['RUNNING', 'SUCCEEDED', 'PARTIALLY_SUCCEEDED', 'FAILED']),
  summary: syncSummarySchema,
  errors: z.array(z.object({ externalId: z.string(), code: z.string() })),
  startedAt: z.iso.datetime(),
  finishedAt: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
})

const documentSourceSchema = z.object({
  id: z.uuid(),
  knowledgeBaseId: z.uuid(),
  name: z.string(),
  type: z.literal('LOCAL_DIRECTORY'),
  rootPath: z.string(),
  enabled: z.boolean(),
  recursive: z.boolean(),
  lastSyncedAt: z.iso.datetime().nullable(),
  lastRunStatus: z.enum(['RUNNING', 'SUCCEEDED', 'PARTIALLY_SUCCEEDED', 'FAILED']).nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  _count: z.object({ items: z.number().int(), runs: z.number().int() }).optional(),
  runs: z.array(syncRunSchema).optional(),
})

export async function listDocumentSources(knowledgeBaseId: string): Promise<DocumentSource[]> {
  const result = await apiRequest<unknown>(`/knowledge-bases/${knowledgeBaseId}/document-sources`)
  return z.array(documentSourceSchema).parse(result)
}

export async function createDocumentSource(
  knowledgeBaseId: string,
  input: CreateDocumentSourceInput,
): Promise<DocumentSource> {
  const result = await apiRequest<unknown>(`/knowledge-bases/${knowledgeBaseId}/document-sources`, {
    method: 'POST',
    body: JSON.stringify(input),
  })
  return documentSourceSchema.parse(result)
}

export async function updateDocumentSource(
  knowledgeBaseId: string,
  sourceId: string,
  input: UpdateDocumentSourceInput,
): Promise<DocumentSource> {
  const result = await apiRequest<unknown>(
    `/knowledge-bases/${knowledgeBaseId}/document-sources/${sourceId}`,
    { method: 'PATCH', body: JSON.stringify(input) },
  )
  return documentSourceSchema.parse(result)
}

export function deleteDocumentSource(knowledgeBaseId: string, sourceId: string): Promise<void> {
  return apiRequest<void>(`/knowledge-bases/${knowledgeBaseId}/document-sources/${sourceId}`, {
    method: 'DELETE',
  })
}

export async function synchronizeDocumentSource(
  knowledgeBaseId: string,
  sourceId: string,
): Promise<DocumentSyncRun> {
  const result = await apiRequest<unknown>(
    `/knowledge-bases/${knowledgeBaseId}/document-sources/${sourceId}/sync`,
    { method: 'POST' },
  )
  return syncRunSchema.parse(result)
}

export async function listDocumentSyncRuns(
  knowledgeBaseId: string,
  sourceId: string,
): Promise<DocumentSyncRun[]> {
  const result = await apiRequest<unknown>(
    `/knowledge-bases/${knowledgeBaseId}/document-sources/${sourceId}/runs`,
  )
  return z.array(syncRunSchema).parse(result)
}
