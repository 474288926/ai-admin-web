import { afterEach, describe, expect, it, vi } from 'vitest'

import { getQualitySummary } from '@/services/api/quality'

const knowledgeBaseId = '03c7a80e-c672-41f0-8b9c-cfb915eabe4c'

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
})
