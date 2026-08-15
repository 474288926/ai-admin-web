import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  getSystemConfiguration,
  updateSystemConfiguration,
} from '@/services/api/system-configuration'

const snapshot = {
  capturedAt: '2026-08-12T08:00:00.000Z',
  policy: {
    source: 'environment',
    mutationSupported: true,
    mutationAllowed: true,
    restartRequired: true,
    secretsExposed: false,
    activeRevision: 0,
    currentRevision: 0,
  },
  pending: null,
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
    defaultModelId: 'openai',
    defaultModel: 'gpt-test',
    credentialConfigured: true,
    models: [
      {
        id: 'openai',
        provider: 'openai',
        model: 'gpt-test',
        enabled: true,
        isDefault: true,
        credentialConfigured: true,
      },
      {
        id: 'qwen',
        provider: 'qwen',
        model: 'qwen-test',
        enabled: false,
        isDefault: false,
        credentialConfigured: false,
      },
    ],
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
    expect(result.ai.models).toEqual([
      expect.objectContaining({ id: 'openai', isDefault: true, credentialConfigured: true }),
      expect.objectContaining({ id: 'qwen', enabled: false, credentialConfigured: false }),
    ])
    expect(result.policy.secretsExposed).toBe(false)
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('/system/configuration')
    expect(JSON.stringify(result)).not.toContain('apiKey')
  })

  it('saves an optimistic configuration update', async () => {
    const updated = {
      ...snapshot,
      policy: { ...snapshot.policy, currentRevision: 1 },
      pending: {
        revision: 1,
        aiDefaultModelId: 'openai',
        ragPromptVersion: 'rag-structured-response-2.0',
        updatedAt: '2026-08-15T04:00:00.000Z',
      },
    }
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(updated), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )
    vi.stubGlobal('fetch', fetchMock)

    const result = await updateSystemConfiguration({
      revision: 0,
      aiDefaultModelId: 'openai',
      ragPromptVersion: 'rag-structured-response-2.0',
    })

    expect(result.pending?.revision).toBe(1)
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/system/configuration'),
      expect.objectContaining({
        method: 'PATCH',
        body: expect.stringContaining('rag-structured-response-2.0'),
      }),
    )
  })
})
