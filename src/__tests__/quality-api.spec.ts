import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  batchUpdateKnowledgeBacklogDueAt,
  getQualitySummary,
  getKnowledgeBacklogOverview,
  getKnowledgeBacklogHistory,
  listKnowledgeBacklog,
  updateKnowledgeBacklog,
} from '@/services/api/quality'

const knowledgeBaseId = '03c7a80e-c672-41f0-8b9c-cfb915eabe4c'
const documentId = 'e9cb552d-2eb4-4c96-8a12-b0f26efc51af'
const backlogItem = {
  id: '1d8a3787-d6f7-49dc-992f-849c1add3362',
  questionFingerprint: 'a'.repeat(64),
  linkedDocumentId: documentId,
  linkedDocument: {
    id: documentId,
    originalName: '补充知识.md',
    version: 1,
    versionLabel: null,
    status: 'READY',
    embeddingStatus: 'READY',
    lifecycleStatus: 'PUBLISHED',
    effectiveAt: null,
    expiresAt: null,
  },
  verificationRunId: null,
  verificationRun: null,
  documentReady: true,
  documentBlockedReasons: [],
  verificationReady: false,
  verificationBlockedReasons: ['VERIFICATION_RUN_NOT_LINKED'],
  resolutionReady: false,
  resolutionBlockedReasons: ['VERIFICATION_RUN_NOT_LINKED'],
  noAnswerCount: 2,
  unhelpfulCount: 1,
  feedbackReasonCounts: { INCOMPLETE: 1 },
  priority: 'MEDIUM',
  priorityScore: 16,
  recommendedAction: 'RUN_VERIFICATION',
  status: 'TRIAGED',
  title: null,
  note: null,
  dueAt: '2026-08-22T03:00:00.000Z',
  overdue: false,
  dueSoon: true,
  revision: 1,
  firstObservedAt: '2026-08-20T01:00:00.000Z',
  lastObservedAt: '2026-08-20T03:00:00.000Z',
  createdAt: '2026-08-20T03:00:00.000Z',
  updatedAt: '2026-08-20T03:00:00.000Z',
}

afterEach(() => vi.unstubAllGlobals())

describe('quality api', () => {
  it('parses privacy-safe quality aggregates and sends date filters', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          feedbackTotal: 8,
          helpfulCount: 6,
          unhelpfulCount: 2,
          helpfulRate: 0.75,
          reasonCounts: [
            { reason: 'INCOMPLETE', count: 1 },
            { reason: 'INACCURATE_CITATION', count: 1 },
          ],
          qualityEventCounts: [{ type: 'NO_ANSWER', count: 3 }],
          frequentIssues: [
            {
              fingerprint: 'a'.repeat(64),
              type: 'NO_ANSWER',
              count: 3,
              lastOccurredAt: '2026-08-12T01:00:00.000Z',
            },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    )
    vi.stubGlobal('fetch', fetchMock)

    const result = await getQualitySummary(knowledgeBaseId, {
      from: '2026-08-01T00:00:00.000Z',
      to: '2026-08-12T00:00:00.000Z',
      topIssueLimit: 20,
    })

    expect(result.helpfulRate).toBe(0.75)
    expect(result.reasonCounts[1]?.reason).toBe('INACCURATE_CITATION')
    const requestedUrl = String(fetchMock.mock.calls[0]?.[0])
    expect(requestedUrl).toContain('/quality/summary?')
    expect(requestedUrl).toContain('topIssueLimit=20')
    expect(requestedUrl).toContain('from=')
  })

  it('parses linked document readiness for knowledge backlog items', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            items: [backlogItem],
            meta: {
              page: 2,
              pageSize: 50,
              total: 51,
              totalPages: 2,
              scannedCount: 80,
              truncated: true,
              scanLimit: 500,
              hasNextPage: false,
            },
          }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          },
        ),
      ),
    )

    const result = await listKnowledgeBacklog(knowledgeBaseId, {
      search: '设备登录',
      status: 'TRIAGED',
      priority: 'MEDIUM',
      stage: 'AWAITING_VERIFICATION',
      deadline: 'DUE_SOON',
      sort: 'RECENT',
      page: 2,
      pageSize: 50,
    })

    expect(result.items[0]).toMatchObject({
      linkedDocument: { originalName: '补充知识.md' },
      documentReady: true,
      verificationReady: false,
      resolutionReady: false,
      resolutionBlockedReasons: ['VERIFICATION_RUN_NOT_LINKED'],
      priority: 'MEDIUM',
      priorityScore: 16,
      recommendedAction: 'RUN_VERIFICATION',
    })
    expect(result.meta).toMatchObject({ total: 51, totalPages: 2, truncated: true })
    const requestedUrl = String((fetch as ReturnType<typeof vi.fn>).mock.calls[0]?.[0])
    expect(requestedUrl).toContain('status=TRIAGED')
    expect(requestedUrl).toContain('search=%E8%AE%BE%E5%A4%87%E7%99%BB%E5%BD%95')
    expect(requestedUrl).toContain('priority=MEDIUM')
    expect(requestedUrl).toContain('stage=AWAITING_VERIFICATION')
    expect(requestedUrl).toContain('deadline=DUE_SOON')
    expect(requestedUrl).toContain('sort=RECENT')
    expect(requestedUrl).toContain('page=2')
    expect(requestedUrl).toContain('pageSize=50')
  })

  it('parses the bounded active backlog overview', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            activeCount: 9,
            scannedActiveCount: 9,
            truncated: false,
            scanLimit: 500,
            criticalCount: 1,
            highPriorityCount: 3,
            awaitingDocumentCount: 4,
            awaitingVerificationCount: 3,
            readyToCloseCount: 2,
            overdueCount: 2,
            dueSoonCount: 1,
            unplannedCount: 3,
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      ),
    )

    const result = await getKnowledgeBacklogOverview(knowledgeBaseId)

    expect(result).toMatchObject({
      activeCount: 9,
      highPriorityCount: 3,
      readyToCloseCount: 2,
      overdueCount: 2,
      truncated: false,
    })
  })

  it('parses privacy-safe backlog history records', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify([
            {
              id: 'd9d0bb67-3922-48ea-98c8-a827d23a7d39',
              action: 'knowledge_backlog.updated',
              changes: {
                statusFrom: 'OPEN',
                statusTo: 'TRIAGED',
                titleChanged: true,
                dueAtFrom: null,
                dueAtTo: '2026-08-25T03:00:00.000Z',
                revisionFrom: 1,
                revisionTo: 2,
              },
              createdAt: '2026-08-20T05:00:00.000Z',
              actor: {
                id: '550e8400-e29b-41d4-a716-446655440000',
                email: 'admin@example.com',
                name: '管理员',
              },
            },
          ]),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      ),
    )

    const result = await getKnowledgeBacklogHistory(knowledgeBaseId, backlogItem.id)

    expect(result[0]).toMatchObject({
      action: 'knowledge_backlog.updated',
      changes: {
        titleChanged: true,
        dueAtTo: '2026-08-25T03:00:00.000Z',
        revisionTo: 2,
      },
      actor: { name: '管理员' },
    })
  })

  it('updates a privacy-safe backlog title and disposition note', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          ...backlogItem,
          title: '补充设备首次登录说明',
          note: '请产品团队确认默认密码和重置边界。',
          dueAt: '2026-08-25T03:00:00.000Z',
          revision: 2,
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    )
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      updateKnowledgeBacklog(knowledgeBaseId, backlogItem.id, {
        revision: 1,
        title: '补充设备首次登录说明',
        note: '请产品团队确认默认密码和重置边界。',
        dueAt: '2026-08-25T03:00:00.000Z',
      }),
    ).resolves.toMatchObject({ title: '补充设备首次登录说明', revision: 2 })
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ method: 'PATCH' })
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({
      revision: 1,
      title: '补充设备首次登录说明',
      note: '请产品团队确认默认密码和重置边界。',
      dueAt: '2026-08-25T03:00:00.000Z',
    })
  })

  it('batch schedules selected backlog revisions', async () => {
    const dueAt = '2026-08-26T03:00:00.000Z'
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          updatedCount: 1,
          items: [{ ...backlogItem, dueAt, dueSoon: false, revision: 2 }],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    )
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      batchUpdateKnowledgeBacklogDueAt(knowledgeBaseId, {
        items: [{ id: backlogItem.id, revision: 1 }],
        dueAt,
      }),
    ).resolves.toMatchObject({ updatedCount: 1, items: [{ dueAt, revision: 2 }] })
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('/knowledge-backlog/batch/due-at')
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({
      items: [{ id: backlogItem.id, revision: 1 }],
      dueAt,
    })
  })
})
