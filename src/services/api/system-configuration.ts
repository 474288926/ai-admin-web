import { z } from 'zod'

import type {
  SystemConfigurationSnapshot,
  UpdateSystemConfigurationInput,
} from '@/types/system-configuration'
import { apiRequest } from './client'

const nonnegativeInteger = z.number().int().nonnegative()

export const systemConfigurationSchema = z.object({
  capturedAt: z.iso.datetime(),
  policy: z.object({
    source: z.enum(['environment', 'environment+database']),
    mutationSupported: z.literal(true),
    mutationAllowed: z.boolean(),
    restartRequired: z.literal(true),
    secretsExposed: z.literal(false),
    activeRevision: nonnegativeInteger,
    currentRevision: nonnegativeInteger,
  }),
  pending: z
    .object({
      revision: nonnegativeInteger,
      aiDefaultModelId: z.string().min(1),
      ragPromptVersion: z.string().min(1),
      updatedAt: z.iso.datetime(),
    })
    .nullable(),
  runtime: z.object({
    applicationName: z.string().min(1),
    environment: z.string().min(1),
    apiPrefix: z.string().min(1),
    port: z.number().int().positive(),
    swaggerEnabled: z.boolean(),
  }),
  ai: z.object({
    enabled: z.boolean(),
    provider: z.string().min(1),
    defaultModelId: z.string().min(1),
    defaultModel: z.string().min(1).nullable(),
    credentialConfigured: z.boolean(),
    models: z.array(
      z.object({
        id: z.string().min(1),
        provider: z.string().min(1),
        model: z.string().min(1).nullable(),
        enabled: z.boolean(),
        isDefault: z.boolean(),
        credentialConfigured: z.boolean(),
      }),
    ),
    requestTimeoutMs: nonnegativeInteger,
    maxOutputTokens: nonnegativeInteger,
    maxRetries: nonnegativeInteger,
    contextMessageLimit: nonnegativeInteger,
    rateLimitWindowSeconds: nonnegativeInteger,
    userRateLimit: nonnegativeInteger,
    embeddingModel: z.string().min(1),
    embeddingDimensions: nonnegativeInteger,
    embeddingBatchSize: nonnegativeInteger,
  }),
  retrieval: z.object({
    driver: z.string().min(1),
    mode: z.string().min(1),
    keywordCandidateMultiplier: nonnegativeInteger,
    keywordMinimumScore: z.number().min(0).max(1),
    rrfK: nonnegativeInteger,
    queryRewriteAiEnabled: z.boolean(),
    rerankEnabled: z.boolean(),
    rerankCandidateMultiplier: nonnegativeInteger,
    minimumEvidenceScore: z.number().min(0).max(1),
    strongEvidenceScore: z.number().min(0).max(1),
    requireCriticalExactTermMatch: z.boolean(),
    answerabilityAiEnabled: z.boolean(),
  }),
  rag: z.object({
    promptVersion: z.string().min(1),
    structuredResponseEnabled: z.boolean(),
    reasoningEffort: z.string().min(1),
    customerSafetyEnabled: z.boolean(),
    customerSafetyAiEnabled: z.boolean(),
    citationExcerptEnabled: z.boolean(),
    citationExcerptMaxChars: nonnegativeInteger,
    conflictDetectionEnabled: z.boolean(),
    conflictDetectionAiEnabled: z.boolean(),
    multiTurnQueryRewriteEnabled: z.boolean(),
    multiTurnQueryRewriteAiEnabled: z.boolean(),
    multiTurnHistoryMessageLimit: nonnegativeInteger,
  }),
  documents: z.object({
    storageDriver: z.string().min(1),
    storageCredentialConfigured: z.boolean(),
    maxFileSizeBytes: nonnegativeInteger,
    batchMaxFiles: nonnegativeInteger,
    batchMaxTotalSizeBytes: nonnegativeInteger,
    allowedExtensions: z.array(z.string().min(1)),
    chunkSizeChars: nonnegativeInteger,
    chunkOverlapChars: nonnegativeInteger,
    processingTimeoutMs: nonnegativeInteger,
    ocrEnabled: z.boolean(),
    ocrModel: z.string().min(1).nullable(),
    pipelineWorkerEnabled: z.boolean(),
    pipelineRecoveryEnabled: z.boolean(),
    pipelineMaxAttempts: nonnegativeInteger,
  }),
  evaluation: z.object({
    workerEnabled: z.boolean(),
    pollingIntervalMs: nonnegativeInteger,
    maxCasesPerSuite: nonnegativeInteger,
    maxAttempts: nonnegativeInteger,
    caseTimeoutMs: nonnegativeInteger,
  }),
})

export async function getSystemConfiguration(): Promise<SystemConfigurationSnapshot> {
  const result = await apiRequest<unknown>('/system/configuration')
  return systemConfigurationSchema.parse(result)
}

export async function updateSystemConfiguration(
  input: UpdateSystemConfigurationInput,
): Promise<SystemConfigurationSnapshot> {
  const result = await apiRequest<unknown>('/system/configuration', {
    method: 'PATCH',
    body: JSON.stringify(input),
  })
  return systemConfigurationSchema.parse(result)
}
