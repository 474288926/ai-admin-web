import { afterEach, describe, expect, it, vi } from 'vitest'

import { debugRetrieval } from '@/services/api/retrieval'

const chunkId = '61df41fd-680d-4e93-85a4-f963e03e0185'
const documentId = '3700d6b5-2fd1-453b-b31a-5d35307817ef'
const knowledgeBaseId = '03c7a80e-c672-41f0-8b9c-cfb915eabe4c'

afterEach(() => vi.unstubAllGlobals())

describe('retrieval api', () => {
  it('parses full retrieval diagnostics and sends debug parameters', async () => {
    const response = {
      mode: 'hybrid',
      queryLength: 9,
      requestedTopK: 5,
      candidateLimit: 20,
      vectorDriver: 'pgvector',
      embedding: {
        provider: 'openai',
        model: 'text-embedding-3-small',
        dimensions: 1536,
        durationMs: 10,
      },
      queryProcessing: {
        normalizedQuery: 'E1001 如何处理',
        vectorQuery: 'E1001 故障处理',
        keywordQuery: 'E1001 处理',
        keywords: ['E1001', '处理'],
        exactTerms: ['E1001'],
        strategy: 'deterministic',
        rewriteApplied: false,
        fallbackReason: null,
        durationMs: 1,
      },
      reranking: {
        strategy: 'deterministic',
        evidenceLevel: 'strong',
        bestScore: 0.9,
        minimumEvidenceScore: 0.3,
        strongEvidenceScore: 0.65,
        durationMs: 1,
        acceptedCount: 1,
        rejectedCount: 0,
        candidates: [
          {
            chunkId,
            recallRank: 2,
            finalRank: 1,
            rerankScore: 0.9,
            evidenceLevel: 'strong',
            accepted: true,
            rejectionReason: null,
            features: {
              vectorScore: 0.92,
              keywordScore: 0.8,
              exactTermCoverage: 1,
              criticalExactTermCoverage: 1,
              keywordCoverage: 1,
              sourceAgreement: 1,
              recallRankScore: 0.5,
            },
          },
        ],
      },
      answerability: {
        strategy: 'deterministic',
        status: 'supported',
        supportedChunkIds: [chunkId],
        missingFacts: [],
        reason: '检索证据充分',
        fallbackReason: null,
        provider: null,
        model: null,
        durationMs: 1,
      },
      timings: {
        vectorMs: 2,
        keywordMs: 3,
        fusionMs: 1,
        rerankMs: 1,
        answerabilityMs: 1,
        totalMs: 15,
      },
      candidateCounts: { vector: 2, keyword: 2, union: 3, returned: 1, rejected: 0 },
      items: [
        {
          chunkId,
          documentId,
          documentName: '产品手册.md',
          position: 1,
          content: 'E1001 的处理步骤。',
          tokenCount: 8,
          metadata: { heading: '故障处理' },
          similarityScore: 0.92,
          finalRank: 1,
          recallRank: 2,
          sources: ['vector', 'keyword'],
          vector: { rank: 1, similarityScore: 0.92 },
          keyword: {
            rank: 2,
            keywordScore: 0.8,
            fullTextScore: 0.4,
            trigramScore: 0.8,
            exactPhraseMatch: false,
          },
          rrfScore: 0.0325,
          rerankScore: 0.9,
          evidenceLevel: 'strong',
        },
      ],
    }
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(response), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )
    vi.stubGlobal('fetch', fetchMock)

    const result = await debugRetrieval(knowledgeBaseId, {
      query: 'E1001 如何处理',
      mode: 'hybrid',
      topK: 5,
      minSimilarity: 0.2,
    })

    expect(result.items[0]?.sources).toEqual(['vector', 'keyword'])
    expect(result.reranking.bestScore).toBe(0.9)
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('/retrieval/debug')
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ method: 'POST' })
  })
})
