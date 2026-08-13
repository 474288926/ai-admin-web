import { afterEach, describe, expect, it, vi } from 'vitest'

import { getSystemConfiguration } from '@/services/api/system-configuration'

const snapshot = {
  capturedAt: '2026-08-12T08:00:00.000Z',
  policy: {
    source: 'environment',
    mutationSupported: false,
    restartRequired: true,
    secretsExposed: false,
  },
  runtime: {
    applicationName: 'ai-backend',
    environment: 'development',
    apiPrefix: 'api/v1',
    port: 3000,
    swaggerEnabled: true,
  },
  ai: {
    enabled: true,
    provider: 'openai',
    defaultModel: 'gpt-test',
    credentialConfigured: true,
    requestTimeoutMs: 30000,
    maxOutputTokens: 2048,
    maxRetries: 2,
    contextMessageLimit: 20,
    rateLimitWindowSeconds: 60,
    userRateLimit: 10,
    embeddingModel: 'text-embedding-test',
    embeddingDimensions: 1536,
    embeddingBatchSize: 64,
  },
  retrieval: {
    driver: 'pgvector',
    mode: 'hybrid',
    keywordCandidateMultiplier: 4,
    keywordMinimumScore: 0.1,
    rrfK: 60,
    queryRewriteAiEnabled: false,
    rerankEnabled: true,
    rerankCandidateMultiplier: 4,
    minimumEvidenceScore: 0.3,
    strongEvidenceScore: 0.65,
    requireCriticalExactTermMatch: true,
    answerabilityAiEnabled: false,
  },
  rag: {
    promptVersion: 'rag-structured-response-1.0',
    structuredResponseEnabled: true,
    reasoningEffort: 'minimal',
    customerSafetyEnabled: true,
    customerSafetyAiEnabled: false,
    citationExcerptEnabled: true,
    citationExcerptMaxChars: 300,
    conflictDetectionEnabled: true,
    conflictDetectionAiEnabled: false,
    multiTurnQueryRewriteEnabled: true,
    multiTurnQueryRewriteAiEnabled: false,
    multiTurnHistoryMessageLimit: 6,
  },
  documents: {
    storageDriver: 'local',
    storageCredentialConfigured: true,
    maxFileSizeBytes: 20971520,
    batchMaxFiles: 20,
    batchMaxTotalSizeBytes: 104857600,
    allowedExtensions: ['.pdf', '.docx'],
    chunkSizeChars: 1000,
    chunkOverlapChars: 150,
    processingTimeoutMs: 120000,
    ocrEnabled: false,
    ocrModel: null,
    pipelineWorkerEnabled: true,
    pipelineRecoveryEnabled: true,
    pipelineMaxAttempts: 3,
  },
  evaluation: {
    workerEnabled: true,
    pollingIntervalMs: 1000,
    maxCasesPerSuite: 200,
    maxAttempts: 2,
    caseTimeoutMs: 120000,
  },
}

afterEach(() => vi.unstubAllGlobals())

describe('system configuration api', () => {
  it('loads and validates a secret-safe runtime snapshot', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(snapshot), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )
    vi.stubGlobal('fetch', fetchMock)

    const result = await getSystemConfiguration()

    expect(result.retrieval.mode).toBe('hybrid')
    expect(result.ai.credentialConfigured).toBe(true)
    expect(result.policy.secretsExposed).toBe(false)
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('/system/configuration')
    expect(JSON.stringify(result)).not.toContain('apiKey')
  })
})
