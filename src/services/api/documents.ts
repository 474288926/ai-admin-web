import { z } from 'zod'

import type {
  DocumentBatch,
  DocumentVersionList,
  PaginatedDocuments,
  UpdateDocumentMetadataInput,
} from '@/types/document'
import { apiRequest, createClientRequestId } from './client'

const nullableDateTime = z.iso.datetime().nullable()
export const ingestionJobSchema = z.object({
  id: z.uuid(),
  documentId: z.uuid(),
  status: z.enum(['PENDING', 'RUNNING', 'SUCCEEDED', 'FAILED', 'CANCELLED']),
  stage: z.enum(['QUEUED', 'PARSING', 'EMBEDDING', 'COMPLETED']),
  progress: z.number().min(0).max(100),
  attempt: z.number().int().nonnegative(),
  maxAttempts: z.number().int().positive(),
  lastErrorCode: z.string().nullable(),
  cancelRequestedAt: nullableDateTime,
  startedAt: nullableDateTime,
  finishedAt: nullableDateTime,
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
})

export const documentSchema = z.object({
  id: z.uuid(),
  ingestionJob: ingestionJobSchema.nullable(),
  ownerUserId: z.uuid().nullable(),
  versionSeriesId: z.uuid(),
  replacesDocumentId: z.uuid().nullable(),
  originalName: z.string(),
  mimeType: z.string(),
  sizeBytes: z.number().int().nonnegative(),
  checksumSha256: z.string(),
  status: z.enum(['UPLOADED', 'PROCESSING', 'READY', 'FAILED']),
  embeddingStatus: z.enum(['NOT_READY', 'PENDING', 'PROCESSING', 'READY', 'FAILED']),
  lifecycleStatus: z.enum(['DRAFT', 'PUBLISHED', 'ARCHIVED']),
  accessMode: z.enum(['INHERIT', 'RESTRICTED']),
  sensitivityLevel: z.enum(['INTERNAL', 'CONFIDENTIAL', 'RESTRICTED']),
  category: z.string().nullable(),
  businessDomain: z.string().nullable(),
  tags: z.array(z.string()),
  version: z.number().int().positive(),
  versionLabel: z.string().nullable(),
  effectiveAt: nullableDateTime,
  expiresAt: nullableDateTime,
  publishedAt: nullableDateTime,
  pageCount: z.number().int().nonnegative().nullable(),
  characterCount: z.number().int().nonnegative().nullable(),
  chunkCount: z.number().int().nonnegative(),
  errorCode: z.string().nullable(),
  processingStartedAt: nullableDateTime,
  processedAt: nullableDateTime,
  embeddingStartedAt: nullableDateTime,
  embeddedAt: nullableDateTime,
  embeddingErrorCode: z.string().nullable(),
  embeddingInputTokens: z.number().int().nonnegative().nullable(),
  embeddingGeneratedChunkCount: z.number().int().nonnegative(),
  embeddingReusedChunkCount: z.number().int().nonnegative(),
  embeddingProviderInputCount: z.number().int().nonnegative(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
})

const paginatedDocumentsSchema = z.object({
  items: z.array(documentSchema),
  meta: z.object({
    page: z.number().int().positive(),
    pageSize: z.number().int().positive(),
    total: z.number().int().nonnegative(),
    totalPages: z.number().int().nonnegative(),
    hasNextPage: z.boolean(),
  }),
})

export const documentBatchSchema = z.object({
  id: z.uuid(),
  knowledgeBaseId: z.uuid(),
  status: z.enum(['PROCESSING', 'SUCCEEDED', 'PARTIALLY_SUCCEEDED', 'FAILED', 'CANCELLED']),
  progress: z.number().min(0).max(100),
  totalFiles: z.number().int().positive(),
  acceptedFiles: z.number().int().nonnegative(),
  rejectedFiles: z.number().int().nonnegative(),
  pendingFiles: z.number().int().nonnegative(),
  runningFiles: z.number().int().nonnegative(),
  succeededFiles: z.number().int().nonnegative(),
  failedFiles: z.number().int().nonnegative(),
  cancelledFiles: z.number().int().nonnegative(),
  items: z.array(
    z.object({
      id: z.uuid(),
      position: z.number().int().positive(),
      originalName: z.string(),
      documentId: z.uuid().nullable(),
      existingDocumentId: z.uuid().nullable(),
      status: z.enum(['PENDING', 'REJECTED', 'RUNNING', 'SUCCEEDED', 'FAILED', 'CANCELLED']),
      progress: z.number().min(0).max(100),
      errorCode: z.string().nullable(),
    }),
  ),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
})

export async function listDocuments(
  knowledgeBaseId: string,
  page: number,
  pageSize: number,
): Promise<PaginatedDocuments> {
  const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) })
  const result = await apiRequest<unknown>(
    `/knowledge-bases/${knowledgeBaseId}/documents?${params}`,
  )
  return paginatedDocumentsSchema.parse(result)
}

export async function uploadDocuments(
  knowledgeBaseId: string,
  files: File[],
): Promise<DocumentBatch> {
  const formData = new FormData()
  files.forEach((file) => formData.append('files', file))
  const result = await apiRequest<unknown>(`/knowledge-bases/${knowledgeBaseId}/document-batches`, {
    method: 'POST',
    headers: { 'Idempotency-Key': createClientRequestId() },
    body: formData,
  })
  return documentBatchSchema.parse(result)
}

export async function listDocumentBatches(
  knowledgeBaseId: string,
  page: number,
  pageSize: number,
): Promise<{ items: DocumentBatch[]; meta: PaginatedDocuments['meta'] }> {
  const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) })
  const result = await apiRequest<unknown>(
    `/knowledge-bases/${knowledgeBaseId}/document-batches?${params}`,
  )
  return z
    .object({ items: z.array(documentBatchSchema), meta: paginatedDocumentsSchema.shape.meta })
    .parse(result)
}

export async function retryDocumentJob(knowledgeBaseId: string, documentId: string) {
  const result = await apiRequest<unknown>(
    `/knowledge-bases/${knowledgeBaseId}/documents/${documentId}/ingestion-job/retry`,
    { method: 'POST' },
  )
  return ingestionJobSchema.parse(result)
}

export async function cancelDocumentJob(knowledgeBaseId: string, documentId: string) {
  const result = await apiRequest<unknown>(
    `/knowledge-bases/${knowledgeBaseId}/documents/${documentId}/ingestion-job/cancel`,
    { method: 'POST' },
  )
  return ingestionJobSchema.parse(result)
}

export async function reindexDocument(knowledgeBaseId: string, documentId: string) {
  const result = await apiRequest<unknown>(
    `/knowledge-bases/${knowledgeBaseId}/documents/${documentId}/reindex`,
    { method: 'POST' },
  )
  return ingestionJobSchema.parse(result)
}

export async function cancelDocumentBatch(knowledgeBaseId: string, batchId: string) {
  const result = await apiRequest<unknown>(
    `/knowledge-bases/${knowledgeBaseId}/document-batches/${batchId}/cancel`,
    { method: 'POST' },
  )
  return documentBatchSchema.parse(result)
}

export async function retryDocumentBatch(knowledgeBaseId: string, batchId: string) {
  const result = await apiRequest<unknown>(
    `/knowledge-bases/${knowledgeBaseId}/document-batches/${batchId}/retry-failed`,
    { method: 'POST' },
  )
  return z
    .object({ retriedFiles: z.number().int().nonnegative(), batch: documentBatchSchema })
    .parse(result)
}

export function deleteDocument(knowledgeBaseId: string, documentId: string): Promise<void> {
  return apiRequest<void>(`/knowledge-bases/${knowledgeBaseId}/documents/${documentId}`, {
    method: 'DELETE',
  })
}

export async function updateDocumentMetadata(
  knowledgeBaseId: string,
  documentId: string,
  input: UpdateDocumentMetadataInput,
): Promise<void> {
  await apiRequest<unknown>(
    `/knowledge-bases/${knowledgeBaseId}/documents/${documentId}/metadata`,
    { method: 'PATCH', body: JSON.stringify(input) },
  )
}

export async function listDocumentVersions(
  knowledgeBaseId: string,
  documentId: string,
): Promise<DocumentVersionList> {
  const result = await apiRequest<unknown>(
    `/knowledge-bases/${knowledgeBaseId}/documents/${documentId}/versions`,
  )
  return z
    .object({
      versionSeriesId: z.uuid(),
      currentDocumentId: z.uuid().nullable(),
      items: z.array(documentSchema),
    })
    .parse(result)
}

export async function uploadDocumentVersion(
  knowledgeBaseId: string,
  documentId: string,
  file: File,
  versionLabel?: string,
) {
  const formData = new FormData()
  formData.append('file', file)
  if (versionLabel?.trim()) formData.append('versionLabel', versionLabel.trim())
  const result = await apiRequest<unknown>(
    `/knowledge-bases/${knowledgeBaseId}/documents/${documentId}/versions`,
    {
      method: 'POST',
      headers: { 'Idempotency-Key': createClientRequestId() },
      body: formData,
    },
  )
  return documentSchema.parse(result)
}

export async function activateDocumentVersion(
  knowledgeBaseId: string,
  documentId: string,
  versionId: string,
) {
  const result = await apiRequest<unknown>(
    `/knowledge-bases/${knowledgeBaseId}/documents/${documentId}/versions/${versionId}/activate`,
    { method: 'POST' },
  )
  return documentSchema.parse(result)
}
