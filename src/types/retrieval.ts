export type RetrievalMode = 'vector' | 'keyword' | 'hybrid'
export type EvidenceLevel = 'strong' | 'weak' | 'insufficient' | 'unassessed'

export interface RetrievalDebugInput {
  query: string
  topK: number
  minSimilarity: number
  mode: RetrievalMode
}

export interface RetrievalDebugItem {
  chunkId: string
  documentId: string
  documentName: string
  position: number
  content: string
  tokenCount: number | null
  metadata: unknown
  similarityScore: number
  finalRank: number
  recallRank: number
  sources: Array<'vector' | 'keyword'>
  vector: { rank: number; similarityScore: number } | null
  keyword: {
    rank: number
    keywordScore: number
    fullTextScore: number
    trigramScore: number
    exactPhraseMatch: boolean
  } | null
  rrfScore: number | null
  rerankScore: number | null
  evidenceLevel: EvidenceLevel
}

export interface RetrievalDebugResult {
  mode: RetrievalMode
  queryLength: number
  requestedTopK: number
  candidateLimit: number
  vectorDriver: 'memory' | 'pgvector' | null
  embedding: {
    provider: string
    model: string
    dimensions: number
    durationMs: number
  } | null
  queryProcessing: {
    normalizedQuery: string
    vectorQuery: string
    keywordQuery: string
    keywords: string[]
    exactTerms: string[]
    strategy: 'deterministic' | 'ai'
    rewriteApplied: boolean
    fallbackReason: 'rate_limited' | 'timeout' | 'invalid_response' | 'provider_error' | null
    durationMs: number
  }
  reranking: {
    strategy: 'disabled' | 'deterministic' | 'model' | 'model_fallback'
    evidenceLevel: EvidenceLevel
    bestScore: number | null
    minimumEvidenceScore: number
    strongEvidenceScore: number
    durationMs: number
    acceptedCount: number
    rejectedCount: number
    candidates: Array<{
      chunkId: string
      recallRank: number
      finalRank: number | null
      rerankScore: number | null
      evidenceLevel: EvidenceLevel
      accepted: boolean
      rejectionReason: 'low_score' | 'critical_exact_term_missing' | 'outside_top_k' | null
      features: {
        vectorScore: number | null
        keywordScore: number | null
        exactTermCoverage: number | null
        criticalExactTermCoverage: number | null
        keywordCoverage: number | null
        sourceAgreement: number
        recallRankScore: number
      } | null
    }>
  }
  answerability: {
    strategy: 'disabled' | 'deterministic' | 'model' | 'model_fallback'
    status: 'supported' | 'partially_supported' | 'unsupported' | 'unassessed'
    supportedChunkIds: string[]
    missingFacts: string[]
    reason: string
    fallbackReason: 'rate_limited' | 'timeout' | 'invalid_response' | 'provider_error' | null
    provider: string | null
    model: string | null
    durationMs: number
  }
  timings: {
    vectorMs: number
    keywordMs: number
    fusionMs: number
    rerankMs: number
    answerabilityMs: number
    totalMs: number
  }
  candidateCounts: {
    vector: number
    keyword: number
    union: number
    returned: number
    rejected: number
  }
  items: RetrievalDebugItem[]
}
