export interface SystemConfigurationSnapshot {
  capturedAt: string
  policy: {
    source: 'environment'
    mutationSupported: false
    restartRequired: true
    secretsExposed: false
  }
  runtime: {
    applicationName: string
    environment: string
    apiPrefix: string
    port: number
    swaggerEnabled: boolean
  }
  ai: {
    enabled: boolean
    provider: string
    defaultModel: string | null
    credentialConfigured: boolean
    requestTimeoutMs: number
    maxOutputTokens: number
    maxRetries: number
    contextMessageLimit: number
    rateLimitWindowSeconds: number
    userRateLimit: number
    embeddingModel: string
    embeddingDimensions: number
    embeddingBatchSize: number
  }
  retrieval: {
    driver: string
    mode: string
    keywordCandidateMultiplier: number
    keywordMinimumScore: number
    rrfK: number
    queryRewriteAiEnabled: boolean
    rerankEnabled: boolean
    rerankCandidateMultiplier: number
    minimumEvidenceScore: number
    strongEvidenceScore: number
    requireCriticalExactTermMatch: boolean
    answerabilityAiEnabled: boolean
  }
  rag: {
    promptVersion: string
    structuredResponseEnabled: boolean
    reasoningEffort: string
    customerSafetyEnabled: boolean
    customerSafetyAiEnabled: boolean
    citationExcerptEnabled: boolean
    citationExcerptMaxChars: number
    conflictDetectionEnabled: boolean
    conflictDetectionAiEnabled: boolean
    multiTurnQueryRewriteEnabled: boolean
    multiTurnQueryRewriteAiEnabled: boolean
    multiTurnHistoryMessageLimit: number
  }
  documents: {
    storageDriver: string
    storageCredentialConfigured: boolean
    maxFileSizeBytes: number
    batchMaxFiles: number
    batchMaxTotalSizeBytes: number
    allowedExtensions: string[]
    chunkSizeChars: number
    chunkOverlapChars: number
    processingTimeoutMs: number
    ocrEnabled: boolean
    ocrModel: string | null
    pipelineWorkerEnabled: boolean
    pipelineRecoveryEnabled: boolean
    pipelineMaxAttempts: number
  }
  evaluation: {
    workerEnabled: boolean
    pollingIntervalMs: number
    maxCasesPerSuite: number
    maxAttempts: number
    caseTimeoutMs: number
  }
}
