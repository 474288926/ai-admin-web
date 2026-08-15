export interface SystemConfigurationSnapshot {
  capturedAt: string
  policy: {
    source: 'environment' | 'environment+database'
    mutationSupported: true
    mutationAllowed: boolean
    restartRequired: true
    secretsExposed: false
    activeRevision: number
    currentRevision: number
  }
  pending: {
    revision: number
    aiDefaultModelId: string
    ragPromptVersion: string
    updatedAt: string
  } | null
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
    defaultModelId: string
    defaultModel: string | null
    credentialConfigured: boolean
    models: {
      id: string
      provider: string
      model: string | null
      enabled: boolean
      isDefault: boolean
      credentialConfigured: boolean
    }[]
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

export interface UpdateSystemConfigurationInput {
  revision: number
  aiDefaultModelId?: string
  ragPromptVersion?: string
}
