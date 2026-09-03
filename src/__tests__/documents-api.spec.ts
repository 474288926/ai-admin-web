import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  cancelDocumentBatch,
  cancelDocumentJob,
  activateDocumentVersion,
  deleteDocument,
  listDocumentBatches,
  listDocuments,
  getDocument,
  getDocumentAudienceApprovalSummary,
  assignDocumentAudiencePreparation,
  assignDocumentAudiencePreparationBatch,
  reindexDocument,
  retryDocumentBatch,
  retryDocumentJob,
  uploadDocuments,
  listDocumentVersions,
  updateDocumentMetadata,
  uploadDocumentVersion,
} from '@/services/api/documents'

const knowledgeBaseId = '03c7a80e-c672-41f0-8b9c-cfb915eabe4c'
const documentId = '3700d6b5-2fd1-453b-b31a-5d35307817ef'

afterEach(() => vi.unstubAllGlobals())

describe('documents api', () => {
  it('loads paginated documents', async () => {
    const document = {
      id: documentId,
      ingestionJob: null,
      ownerUserId: null,
      versionSeriesId: '8ac53342-b1bd-486c-a8f7-c2eed7795994',
      replacesDocumentId: null,
      originalName: '制度.md',
      mimeType: 'text/markdown',
      sizeBytes: 100,
      checksumSha256: 'a'.repeat(64),
      status: 'READY',
      embeddingStatus: 'READY',
      lifecycleStatus: 'PUBLISHED',
      accessMode: 'INHERIT',
      sensitivityLevel: 'INTERNAL',
      category: null,
      businessDomain: null,
      tags: [],
      version: 1,
      versionLabel: null,
      effectiveAt: null,
      expiresAt: null,
      publishedAt: null,
      pageCount: null,
      characterCount: 20,
      chunkCount: 1,
      errorCode: null,
      processingStartedAt: null,
      processedAt: null,
      embeddingStartedAt: null,
      embeddedAt: null,
      embeddingErrorCode: null,
      embeddingInputTokens: null,
      embeddingGeneratedChunkCount: 1,
      embeddingReusedChunkCount: 0,
      embeddingProviderInputCount: 1,
      createdAt: '2026-08-12T01:00:00.000Z',
      updatedAt: '2026-08-12T01:00:00.000Z',
    }
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          items: [document],
          meta: { page: 1, pageSize: 20, total: 1, totalPages: 1, hasNextPage: false },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    )
    vi.stubGlobal('fetch', fetchMock)

    const result = await listDocuments(knowledgeBaseId, 1, 20)
    expect(result.items[0]?.originalName).toBe('制度.md')
  })

  it('includes draft versions when loading ingestion tasks', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          items: [],
          meta: { page: 1, pageSize: 20, total: 0, totalPages: 0, hasNextPage: false },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    )
    vi.stubGlobal('fetch', fetchMock)

    await listDocuments(knowledgeBaseId, 1, 20, { includeDrafts: true })

    const requestUrl = new URL(String(fetchMock.mock.calls[0]?.[0]), 'http://localhost')
    expect(requestUrl.searchParams.get('includeDrafts')).toBe('true')
  })

  it('loads one document and actionable approval todo details', async () => {
    const fullDocument = {
      id: documentId,
      audienceEvidence: null,
      ingestionJob: null,
      ownerUserId: null,
      versionSeriesId: '8ac53342-b1bd-486c-a8f7-c2eed7795994',
      replacesDocumentId: null,
      originalName: '运维手册.md',
      mimeType: 'text/markdown',
      sizeBytes: 100,
      checksumSha256: 'a'.repeat(64),
      status: 'READY',
      embeddingStatus: 'READY',
      lifecycleStatus: 'PUBLISHED',
      accessMode: 'INHERIT',
      sensitivityLevel: 'INTERNAL',
      category: null,
      businessDomain: null,
      tags: [],
      version: 2,
      versionLabel: null,
      effectiveAt: null,
      expiresAt: null,
      publishedAt: null,
      pageCount: null,
      characterCount: 20,
      chunkCount: 1,
      errorCode: null,
      processingStartedAt: null,
      processedAt: null,
      embeddingStartedAt: null,
      embeddedAt: null,
      embeddingErrorCode: null,
      embeddingInputTokens: null,
      embeddingGeneratedChunkCount: 1,
      embeddingReusedChunkCount: 0,
      embeddingProviderInputCount: 1,
      createdAt: '2026-09-01T01:00:00.000Z',
      updatedAt: '2026-09-01T01:00:00.000Z',
    }
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify(fullDocument), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            preparationPending: 1,
            preparationActionable: 1,
            preparationOverdue: 0,
            preparationItems: [
              {
                preparationId: '8f1f5613-21a3-483f-a513-b61603362d55',
                documentId,
                documentName: '运维手册.md',
                documentVersion: 2,
                assignedToUserId: '550e8400-e29b-41d4-a716-446655440000',
                assignedToDisplayName: '准备人',
                assignedByDisplayName: '管理员',
                dueAt: '2026-09-03T01:00:00.000Z',
                reason: '补充业务证据',
                createdAt: '2026-09-02T01:00:00.000Z',
                overdue: false,
              },
            ],
            pending: 2,
            actionable: 1,
            overdue: 1,
            escalationRequired: 1,
            truncated: false,
            items: [
              {
                approvalId: '51f6f782-590e-4029-84d4-c07662ee05c6',
                reference: 'DBA-20260902-TEST0001',
                documentId,
                documentName: '运维手册.md',
                documentVersion: 2,
                businessEvidenceReference: 'DBE-20260902-TEST0001',
                businessEvidenceTitle: '运维评审记录',
                proposedAudienceTag: 'audience:internal-only',
                businessOwner: '运维负责人',
                createdByDisplayName: 'creator@example.com',
                assignedToUserId: '550e8400-e29b-41d4-a716-446655440000',
                assignedToDisplayName: '审批人',
                dueAt: '2026-09-02T01:00:00.000Z',
                canDecide: true,
                createdAt: '2026-09-01T01:00:00.000Z',
                ageHours: 25,
                overdue: true,
              },
            ],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      )
    vi.stubGlobal('fetch', fetchMock)

    const document = await getDocument(knowledgeBaseId, documentId)
    const summary = await getDocumentAudienceApprovalSummary(knowledgeBaseId)

    expect(document.originalName).toBe('运维手册.md')
    expect(summary.items[0]).toMatchObject({
      overdue: true,
      ageHours: 25,
      assignedToDisplayName: '审批人',
    })
    expect(summary.preparationItems[0]).toMatchObject({
      assignedToDisplayName: '准备人',
      reason: '补充业务证据',
    })
  })

  it('assigns document audience preparation independently from approval', async () => {
    const preparation = {
      id: '8f1f5613-21a3-483f-a513-b61603362d55',
      documentId,
      documentChecksumSha256: 'a'.repeat(64),
      documentVersion: 2,
      assignedToUserId: '550e8400-e29b-41d4-a716-446655440000',
      assignedByUserId: '8bd95dfc-d44a-4837-995a-b2d95cc45663',
      assignedToUser: {
        id: '550e8400-e29b-41d4-a716-446655440000',
        email: 'preparer@example.com',
        name: '准备人',
      },
      assignedByUser: {
        id: '8bd95dfc-d44a-4837-995a-b2d95cc45663',
        email: 'admin@example.com',
        name: '管理员',
      },
      dueAt: '2026-09-03T01:00:00.000Z',
      reason: '收集业务证据',
      completedAt: null,
      completedByUserId: null,
      createdAt: '2026-09-02T01:00:00.000Z',
      updatedAt: '2026-09-02T01:00:00.000Z',
    }
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(preparation), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )
    vi.stubGlobal('fetch', fetchMock)

    await assignDocumentAudiencePreparation(knowledgeBaseId, documentId, {
      assignedToUserId: preparation.assignedToUserId,
      dueAt: preparation.dueAt,
      reason: preparation.reason,
    })

    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('/preparation/assignment')
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ method: 'POST' })
  })

  it('assigns document audience preparation in one batch request', async () => {
    const secondDocumentId = '70cc8dba-16c7-4589-bac3-c58c42e37e52'
    const preparation = {
      id: '8f1f5613-21a3-483f-a513-b61603362d55',
      documentId,
      documentChecksumSha256: 'a'.repeat(64),
      documentVersion: 2,
      assignedToUserId: '550e8400-e29b-41d4-a716-446655440000',
      assignedByUserId: '8bd95dfc-d44a-4837-995a-b2d95cc45663',
      assignedToUser: {
        id: '550e8400-e29b-41d4-a716-446655440000',
        email: 'preparer@example.com',
        name: '准备人',
      },
      assignedByUser: {
        id: '8bd95dfc-d44a-4837-995a-b2d95cc45663',
        email: 'admin@example.com',
        name: '管理员',
      },
      dueAt: '2026-09-04T01:00:00.000Z',
      reason: '批量收集业务证据',
      completedAt: null,
      completedByUserId: null,
      createdAt: '2026-09-03T01:00:00.000Z',
      updatedAt: '2026-09-03T01:00:00.000Z',
    }
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ updatedCount: 2, items: [preparation, preparation] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )
    vi.stubGlobal('fetch', fetchMock)

    const result = await assignDocumentAudiencePreparationBatch(knowledgeBaseId, {
      documentIds: [documentId, secondDocumentId],
      assignedToUserId: preparation.assignedToUserId,
      dueAt: preparation.dueAt,
      reason: preparation.reason,
    })

    expect(result.updatedCount).toBe(2)
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('/preparation/assignments')
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toMatchObject({
      documentIds: [documentId, secondDocumentId],
      assignedToUserId: preparation.assignedToUserId,
      reason: '批量收集业务证据',
    })
  })

  it('uploads files as multipart batch with an idempotency key', async () => {
    const batch = {
      id: '624ba733-f33a-42f4-99bc-257980ce7c18',
      knowledgeBaseId,
      status: 'PROCESSING',
      progress: 0,
      totalFiles: 1,
      acceptedFiles: 1,
      rejectedFiles: 0,
      pendingFiles: 1,
      runningFiles: 0,
      succeededFiles: 0,
      failedFiles: 0,
      cancelledFiles: 0,
      items: [
        {
          id: '97039d10-a5c8-4181-b70d-06353772f546',
          position: 1,
          originalName: '制度.md',
          documentId,
          existingDocumentId: null,
          status: 'PENDING',
          progress: 0,
          errorCode: null,
        },
      ],
      createdAt: '2026-08-12T01:00:00.000Z',
      updatedAt: '2026-08-12T01:00:00.000Z',
    }
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(batch), {
        status: 201,
        headers: { 'Content-Type': 'application/json' },
      }),
    )
    vi.stubGlobal('fetch', fetchMock)
    vi.stubGlobal('crypto', { randomUUID: () => '72db40d2-c32f-4b51-b750-f97db1a974f8' })

    await uploadDocuments(knowledgeBaseId, [
      new File(['content'], '制度.md', { type: 'text/markdown' }),
    ])
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit
    expect(init.method).toBe('POST')
    expect(init.body).toBeInstanceOf(FormData)
    expect(new Headers(init.headers).get('Idempotency-Key')).toBeTruthy()
  })

  it('uses the document delete endpoint', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }))
    vi.stubGlobal('fetch', fetchMock)
    await deleteDocument(knowledgeBaseId, documentId)
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining(`/documents/${documentId}`),
      expect.objectContaining({ method: 'DELETE' }),
    )
  })

  it('loads batch history and calls task action endpoints', async () => {
    const job = {
      id: '97039d10-a5c8-4181-b70d-06353772f546',
      documentId,
      status: 'PENDING',
      stage: 'QUEUED',
      progress: 0,
      attempt: 0,
      maxAttempts: 3,
      lastErrorCode: null,
      cancelRequestedAt: null,
      startedAt: null,
      finishedAt: null,
      createdAt: '2026-08-12T01:00:00.000Z',
      updatedAt: '2026-08-12T01:00:00.000Z',
    }
    const batch = {
      id: '624ba733-f33a-42f4-99bc-257980ce7c18',
      knowledgeBaseId,
      status: 'PROCESSING',
      progress: 0,
      totalFiles: 1,
      acceptedFiles: 1,
      rejectedFiles: 0,
      pendingFiles: 1,
      runningFiles: 0,
      succeededFiles: 0,
      failedFiles: 0,
      cancelledFiles: 0,
      items: [
        {
          id: '1a7551e0-d2d4-42f2-8682-32e5a7736c5a',
          position: 1,
          originalName: '制度.md',
          documentId,
          existingDocumentId: null,
          status: 'PENDING',
          progress: 0,
          errorCode: null,
        },
      ],
      createdAt: '2026-08-12T01:00:00.000Z',
      updatedAt: '2026-08-12T01:00:00.000Z',
    }
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            items: [batch],
            meta: {
              page: 1,
              pageSize: 20,
              total: 1,
              totalPages: 1,
              hasNextPage: false,
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify(job), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify(job), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify(job), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify(batch), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ retriedFiles: 1, batch }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      )
    vi.stubGlobal('fetch', fetchMock)

    await listDocumentBatches(knowledgeBaseId, 1, 20)
    await retryDocumentJob(knowledgeBaseId, documentId)
    await cancelDocumentJob(knowledgeBaseId, documentId)
    await reindexDocument(knowledgeBaseId, documentId)
    await cancelDocumentBatch(knowledgeBaseId, batch.id)
    await retryDocumentBatch(knowledgeBaseId, batch.id)

    expect(fetchMock).toHaveBeenCalledTimes(6)
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('document-batches?page=1&pageSize=20')
    expect(String(fetchMock.mock.calls[1]?.[0])).toContain('ingestion-job/retry')
    expect(String(fetchMock.mock.calls[3]?.[0])).toContain('/reindex')
    expect(String(fetchMock.mock.calls[5]?.[0])).toContain('retry-failed')
  })

  it('manages metadata and document versions', async () => {
    const fullDocument = {
      id: documentId,
      ingestionJob: null,
      ownerUserId: null,
      versionSeriesId: '8ac53342-b1bd-486c-a8f7-c2eed7795994',
      replacesDocumentId: null,
      originalName: '制度.md',
      mimeType: 'text/markdown',
      sizeBytes: 100,
      checksumSha256: 'a'.repeat(64),
      status: 'READY',
      embeddingStatus: 'READY',
      lifecycleStatus: 'PUBLISHED',
      accessMode: 'INHERIT',
      sensitivityLevel: 'INTERNAL',
      category: null,
      businessDomain: null,
      tags: [],
      version: 1,
      versionLabel: null,
      effectiveAt: null,
      expiresAt: null,
      publishedAt: null,
      pageCount: null,
      characterCount: 20,
      chunkCount: 1,
      errorCode: null,
      processingStartedAt: null,
      processedAt: null,
      embeddingStartedAt: null,
      embeddedAt: null,
      embeddingErrorCode: null,
      embeddingInputTokens: null,
      embeddingGeneratedChunkCount: 1,
      embeddingReusedChunkCount: 0,
      embeddingProviderInputCount: 1,
      createdAt: '2026-08-12T01:00:00.000Z',
      updatedAt: '2026-08-12T01:00:00.000Z',
    }
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ id: documentId }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            versionSeriesId: fullDocument.versionSeriesId,
            currentDocumentId: documentId,
            items: [fullDocument],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify(fullDocument), {
          status: 201,
          headers: { 'Content-Type': 'application/json' },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify(fullDocument), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      )
    vi.stubGlobal('fetch', fetchMock)
    vi.stubGlobal('crypto', { randomUUID: () => '72db40d2-c32f-4b51-b750-f97db1a974f8' })

    await updateDocumentMetadata(knowledgeBaseId, documentId, {
      category: '制度',
      tags: ['人事'],
    })
    const versions = await listDocumentVersions(knowledgeBaseId, documentId)
    await uploadDocumentVersion(
      knowledgeBaseId,
      documentId,
      new File(['new'], '制度-v2.md', { type: 'text/markdown' }),
      'V2',
    )
    await activateDocumentVersion(knowledgeBaseId, documentId, documentId)

    expect(versions.currentDocumentId).toBe(documentId)
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ method: 'PATCH' })
    expect(fetchMock.mock.calls[2]?.[1]?.body).toBeInstanceOf(FormData)
    expect(String(fetchMock.mock.calls[3]?.[0])).toContain('/activate')
  })
})
