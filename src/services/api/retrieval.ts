import { z } from 'zod'

import type { RetrievalDebugInput, RetrievalDebugResult } from '@/types/retrieval'
import { apiRequest } from './client'

const evidenceLevelSchema = z.enum(['strong', 'weak', 'insufficient', 'unassessed'])
const fallbackReasonSchema = z
  .enum(['rate_limited', 'timeout', 'invalid_response', 'provider_error'])
  .nullable()

const retrievalItemSchema = z.object({
  chunkId: z.uuid(),
  documentId: z.uuid(),
  documentName: z.string(),
  position: z.number().int().positive(),
  content: z.string(),
  tokenCount: z.number().int().nonnegative().nullable(),
  metadata: z.unknown().nullable(),
  similarityScore: z.number(),
  finalRank: z.number().int().positive(),
  recallRank: z.number().int().positive(),
  sources: z.array(z.enum(['vector', 'keyword'])),
  vector: z.object({ rank: z.number().int().positive(), similarityScore: z.number() }).nullable(),
  keyword: z
    .object({
      rank: z.number().int().positive(),
      keywordScore: z.number(),
      fullTextScore: z.number(),
      trigramScore: z.number(),
      exactPhraseMatch: z.boolean(),
    })
    .nullable(),
  rrfScore: z.number().nullable(),
  rerankScore: z.number().nullable(),
  evidenceLevel: evidenceLevelSchema,
})

export const retrievalDebugResultSchema = z.object({
  mode: z.enum(['vector', 'keyword', 'hybrid']),
  queryLength: z.number().int().nonnegative(),
  requestedTopK: z.number().int().positive(),
  candidateLimit: z.number().int().positive(),
  vectorDriver: z.enum(['memory', 'pgvector']).nullable(),
  embedding: z
    .object({
      provider: z.string(),
      model: z.string(),
      dimensions: z.number().int().positive(),
      durationMs: z.number().nonnegative(),
    })
    .nullable(),
  queryProcessing: z.object({
    normalizedQuery: z.string(),
    vectorQuery: z.string(),
    keywordQuery: z.string(),
    keywords: z.array(z.string()),
    exactTerms: z.array(z.string()),
    strategy: z.enum(['deterministic', 'ai']),
    rewriteApplied: z.boolean(),
    fallbackReason: fallbackReasonSchema,
    durationMs: z.number().nonnegative(),
  }),
  reranking: z.object({
    strategy: z.enum(['disabled', 'deterministic', 'model', 'model_fallback']),
    evidenceLevel: evidenceLevelSchema,
    bestScore: z.number().nullable(),
    minimumEvidenceScore: z.number(),
    strongEvidenceScore: z.number(),
    durationMs: z.number().nonnegative(),
    acceptedCount: z.number().int().nonnegative(),
    rejectedCount: z.number().int().nonnegative(),
    candidates: z.array(
      z.object({
        chunkId: z.uuid(),
        recallRank: z.number().int().positive(),
        finalRank: z.number().int().positive().nullable(),
        rerankScore: z.number().nullable(),
        evidenceLevel: evidenceLevelSchema,
        accepted: z.boolean(),
        rejectionReason: z
          .enum(['low_score', 'critical_exact_term_missing', 'outside_top_k'])
          .nullable(),
        features: z
          .object({
            vectorScore: z.number().nullable(),
            keywordScore: z.number().nullable(),
            exactTermCoverage: z.number().nullable(),
            criticalExactTermCoverage: z.number().nullable(),
            keywordCoverage: z.number().nullable(),
            sourceAgreement: z.number(),
            recallRankScore: z.number(),
          })
          .nullable(),
      }),
    ),
  }),
  answerability: z.object({
    strategy: z.enum(['disabled', 'deterministic', 'model', 'model_fallback']),
    status: z.enum(['supported', 'partially_supported', 'unsupported', 'unassessed']),
    supportedChunkIds: z.array(z.string()),
    missingFacts: z.array(z.string()),
    reason: z.string(),
    fallbackReason: fallbackReasonSchema,
    provider: z.string().nullable(),
    model: z.string().nullable(),
    durationMs: z.number().nonnegative(),
  }),
  timings: z.object({
    vectorMs: z.number().nonnegative(),
    keywordMs: z.number().nonnegative(),
    fusionMs: z.number().nonnegative(),
    rerankMs: z.number().nonnegative(),
    answerabilityMs: z.number().nonnegative(),
    totalMs: z.number().nonnegative(),
  }),
  candidateCounts: z.object({
    vector: z.number().int().nonnegative(),
    keyword: z.number().int().nonnegative(),
    union: z.number().int().nonnegative(),
    returned: z.number().int().nonnegative(),
    rejected: z.number().int().nonnegative(),
  }),
  items: z.array(retrievalItemSchema),
})

export async function debugRetrieval(
  knowledgeBaseId: string,
  input: RetrievalDebugInput,
): Promise<RetrievalDebugResult> {
  const result = await apiRequest<unknown>(`/knowledge-bases/${knowledgeBaseId}/retrieval/debug`, {
    method: 'POST',
    body: JSON.stringify(input),
  })
  return retrievalDebugResultSchema.parse(result)
}
