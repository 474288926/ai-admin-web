import { z } from 'zod'

import type {
  EvaluationCandidate,
  EvaluationCandidateGeneration,
  EvaluationCandidateStatus,
  EvaluationComparison,
  EvaluationImportValidation,
  RecommendedQuestions,
  EvaluationRun,
  EvaluationSuite,
  PaginatedEvaluations,
} from '@/types/evaluation'
import { apiRequest } from './client'

const paginationSchema = z.object({
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
  total: z.number().int().nonnegative(),
  totalPages: z.number().int().nonnegative(),
  hasNextPage: z.boolean(),
})
const severitySchema = z.enum(['NORMAL', 'HIGH', 'CRITICAL'])
const runStatusSchema = z.enum(['PENDING', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED'])
const caseStatusSchema = z.enum(['PENDING', 'RUNNING', 'PASSED', 'FAILED', 'ERROR', 'CANCELLED'])
const jsonRecordSchema = z.record(z.string(), z.unknown())
const recommendedQuestionSchema = z.object({
  id: z.uuid(),
  externalId: z.string(),
  scenario: z.string(),
  question: z.string(),
  suiteId: z.uuid(),
  suiteName: z.string(),
  suiteVersion: z.number().int().positive(),
})
const recommendedQuestionsSchema = z.object({
  suiteId: z.uuid().nullable(),
  suiteName: z.string().nullable(),
  suiteVersion: z.number().int().positive().nullable(),
  items: z.array(recommendedQuestionSchema),
})
const candidateGenerationSchema = z.object({
  id: z.uuid(),
  status: z.enum(['PENDING', 'RUNNING', 'COMPLETED', 'FAILED']),
  documentCount: z.number().int().nonnegative(),
  questionsPerDocument: z.number().int().positive(),
  includeBoundaryCases: z.boolean(),
  generatedCaseCount: z.number().int().nonnegative(),
  provider: z.string().nullable(),
  model: z.string().nullable(),
  failureCode: z.string().nullable(),
  createdAt: z.iso.datetime(),
  startedAt: z.iso.datetime().nullable(),
  finishedAt: z.iso.datetime().nullable(),
})
const evaluationCandidateSchema = z.object({
  id: z.uuid(),
  generationId: z.uuid(),
  externalId: z.string(),
  scenario: z.string(),
  question: z.string(),
  expectedOutcome: z.enum(['ANSWER', 'NO_ANSWER']),
  expectedAnswerPoints: z.array(z.string()),
  expectedDocumentIds: z.array(z.string()),
  criticalEntities: z.array(z.string()),
  severity: severitySchema,
  tags: z.array(z.string()),
  status: z.enum(['DRAFT', 'APPROVED', 'REJECTED', 'PUBLISHED']),
  revision: z.number().int().nonnegative(),
  reviewNote: z.string().nullable(),
  stale: z.boolean(),
  staleReasons: z.array(z.string()),
  sourceDocuments: z.array(
    z.object({
      id: z.uuid(),
      originalName: z.string(),
      version: z.number().int().positive(),
      checksumSha256: z.string(),
    }),
  ),
  publishedSuiteId: z.uuid().nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
})

export const evaluationSuiteSchema = z.object({
  id: z.uuid(),
  knowledgeBaseId: z.uuid(),
  name: z.string(),
  description: z.string().nullable(),
  version: z.number().int().positive(),
  datasetChecksum: z.string(),
  externalDatasetId: z.string().nullable(),
  externalDatasetVersion: z.string().nullable(),
  sourceSnapshot: z.array(jsonRecordSchema),
  minimumOverallScore: z.number(),
  minimumCitationAccuracyScore: z.number(),
  minimumFaithfulnessScore: z.number().default(0.5),
  minimumRefusalAccuracy: z.number(),
  caseCount: z.number().int().nonnegative(),
  cases: z.array(
    z.object({
      id: z.uuid(),
      externalId: z.string(),
      scenario: z.string(),
      question: z.string(),
      expectedOutcome: z.enum(['ANSWER', 'NO_ANSWER']),
      expectedAnswerPoints: z.array(z.string()),
      expectedDocumentIds: z.array(z.string()),
      criticalEntities: z.array(z.string()),
      severity: severitySchema,
      tags: z.array(z.string()),
      position: z.number().int().positive(),
    }),
  ),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
})

const evaluationRunCaseSchema = z.object({
  id: z.uuid(),
  evaluationCaseId: z.uuid(),
  externalId: z.string(),
  expectedScenario: z.string(),
  expectedOutcome: z.enum(['ANSWER', 'NO_ANSWER']),
  severity: severitySchema,
  tags: z.array(z.string()),
  status: caseStatusSchema,
  actualScenario: z.string().nullable(),
  refused: z.boolean().nullable(),
  citationDocumentIds: z.array(z.string()),
  correctnessScore: z.number().nullable(),
  completenessScore: z.number().nullable(),
  faithfulnessScore: z.number().nullable(),
  citationAccuracyScore: z.number().nullable(),
  overallScore: z.number().nullable(),
  errorCode: z.string().nullable(),
  durationMs: z.number().nonnegative().nullable(),
  inputTokens: z.number().int().nonnegative().nullable(),
  outputTokens: z.number().int().nonnegative().nullable(),
  totalTokens: z.number().int().nonnegative().nullable(),
  cachedInputTokens: z.number().int().nonnegative().nullable(),
  reasoningOutputTokens: z.number().int().nonnegative().nullable(),
})

export const evaluationRunSchema = z.object({
  id: z.uuid(),
  suiteId: z.uuid(),
  datasetChecksum: z.string(),
  status: runStatusSchema,
  progress: z.number().min(0).max(100),
  totalCases: z.number().int().nonnegative(),
  completedCases: z.number().int().nonnegative(),
  passedCases: z.number().int().nonnegative(),
  failedCases: z.number().int().nonnegative(),
  errorCases: z.number().int().nonnegative(),
  gatePassed: z.boolean().nullable(),
  metrics: jsonRecordSchema.nullable(),
  configSnapshot: jsonRecordSchema,
  retryOfRunId: z.uuid().nullable(),
  cases: z.array(evaluationRunCaseSchema),
  createdAt: z.iso.datetime(),
  startedAt: z.iso.datetime().nullable(),
  finishedAt: z.iso.datetime().nullable(),
})

const importValidationSchema = z.object({
  valid: z.boolean(),
  datasetId: z.string(),
  datasetVersion: z.string(),
  caseCount: z.number().int().nonnegative(),
  mappedDocumentCount: z.number().int().nonnegative(),
  documentMappings: z.array(
    z.object({
      key: z.string(),
      originalName: z.string(),
      documentId: z.uuid().nullable(),
      errorCode: z.string().nullable(),
    }),
  ),
  issues: z.array(z.object({ code: z.string(), path: z.string(), message: z.string() })),
})

export async function listEvaluationSuites(
  knowledgeBaseId: string,
  page = 1,
  pageSize = 20,
): Promise<PaginatedEvaluations<EvaluationSuite>> {
  const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) })
  const result = await apiRequest<unknown>(
    `/knowledge-bases/${knowledgeBaseId}/evaluation-suites?${params}`,
  )
  return z.object({ items: z.array(evaluationSuiteSchema), meta: paginationSchema }).parse(result)
}

export async function listRecommendedQuestions(
  knowledgeBaseId: string,
): Promise<RecommendedQuestions> {
  const result = await apiRequest<unknown>(
    `/knowledge-bases/${knowledgeBaseId}/evaluation-suites/recommended`,
  )
  return recommendedQuestionsSchema.parse(result)
}

export async function listEvaluationRuns(
  knowledgeBaseId: string,
  suiteId: string,
  page = 1,
  pageSize = 20,
): Promise<PaginatedEvaluations<EvaluationRun>> {
  const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) })
  const result = await apiRequest<unknown>(
    `/knowledge-bases/${knowledgeBaseId}/evaluation-suites/${suiteId}/runs?${params}`,
  )
  return z.object({ items: z.array(evaluationRunSchema), meta: paginationSchema }).parse(result)
}

export async function getEvaluationRun(knowledgeBaseId: string, suiteId: string, runId: string) {
  const result = await apiRequest<unknown>(
    `/knowledge-bases/${knowledgeBaseId}/evaluation-suites/${suiteId}/runs/${runId}`,
  )
  return evaluationRunSchema.parse(result)
}

export async function startEvaluationRun(knowledgeBaseId: string, suiteId: string) {
  const result = await apiRequest<unknown>(
    `/knowledge-bases/${knowledgeBaseId}/evaluation-suites/${suiteId}/runs`,
    { method: 'POST' },
  )
  return evaluationRunSchema.parse(result)
}

export async function startKnowledgeBacklogVerificationRun(
  knowledgeBaseId: string,
  suiteId: string,
  backlogItemId: string,
  revision: number,
) {
  const result = await apiRequest<unknown>(
    `/knowledge-bases/${knowledgeBaseId}/evaluation-suites/${suiteId}/runs/knowledge-backlog/${backlogItemId}`,
    { method: 'POST', body: JSON.stringify({ revision }) },
  )
  return evaluationRunSchema.parse(result)
}

export async function cancelEvaluationRun(knowledgeBaseId: string, suiteId: string, runId: string) {
  const result = await apiRequest<unknown>(
    `/knowledge-bases/${knowledgeBaseId}/evaluation-suites/${suiteId}/runs/${runId}/cancel`,
    { method: 'POST' },
  )
  return evaluationRunSchema.parse(result)
}

export async function retryEvaluationRun(knowledgeBaseId: string, suiteId: string, runId: string) {
  const result = await apiRequest<unknown>(
    `/knowledge-bases/${knowledgeBaseId}/evaluation-suites/${suiteId}/runs/${runId}/retry-failed`,
    { method: 'POST' },
  )
  return evaluationRunSchema.parse(result)
}

export async function compareEvaluationRuns(
  knowledgeBaseId: string,
  suiteId: string,
  candidateRunId: string,
  baselineRunId: string,
): Promise<EvaluationComparison> {
  const result = await apiRequest<unknown>(
    `/knowledge-bases/${knowledgeBaseId}/evaluation-suites/${suiteId}/runs/${candidateRunId}/comparisons/${baselineRunId}`,
  )
  return z
    .object({
      baselineRunId: z.uuid(),
      candidateRunId: z.uuid(),
      sameDatasetChecksum: z.boolean(),
      sameCaseSet: z.boolean(),
      changedConfigKeys: z.array(z.string()),
      metricDeltas: z.record(
        z.string(),
        z.object({
          baseline: z.number().nullable(),
          candidate: z.number().nullable(),
          delta: z.number().nullable(),
        }),
      ),
      regressedCases: z.number().int().nonnegative(),
      improvedCases: z.number().int().nonnegative(),
      unchangedCases: z.number().int().nonnegative(),
      addedCases: z.number().int().nonnegative(),
      removedCases: z.number().int().nonnegative(),
      cases: z.array(
        z.object({
          externalId: z.string(),
          changeType: z.enum(['REGRESSED', 'IMPROVED', 'UNCHANGED', 'ADDED', 'REMOVED']),
          baselineStatus: caseStatusSchema.nullable(),
          candidateStatus: caseStatusSchema.nullable(),
          baselineOverallScore: z.number().nullable(),
          candidateOverallScore: z.number().nullable(),
          overallScoreDelta: z.number().nullable(),
          baselineErrorCode: z.string().nullable(),
          candidateErrorCode: z.string().nullable(),
        }),
      ),
    })
    .parse(result)
}

export async function validateEvaluationImport(
  knowledgeBaseId: string,
  dataset: Record<string, unknown>,
): Promise<EvaluationImportValidation> {
  const result = await apiRequest<unknown>(
    `/knowledge-bases/${knowledgeBaseId}/evaluation-suites/imports/validate`,
    { method: 'POST', body: JSON.stringify(dataset) },
  )
  return importValidationSchema.parse(result)
}

export async function importEvaluationSuite(
  knowledgeBaseId: string,
  dataset: Record<string, unknown>,
): Promise<EvaluationSuite> {
  const result = await apiRequest<unknown>(
    `/knowledge-bases/${knowledgeBaseId}/evaluation-suites/imports`,
    { method: 'POST', body: JSON.stringify(dataset) },
  )
  return evaluationSuiteSchema.parse(result)
}

export async function createEvaluationCandidateGeneration(
  knowledgeBaseId: string,
  input: {
    documentIds: string[]
    questionsPerDocument: number
    includeBoundaryCases: boolean
  },
): Promise<EvaluationCandidateGeneration> {
  const result = await apiRequest<unknown>(
    `/knowledge-bases/${knowledgeBaseId}/evaluation-candidates/generations`,
    { method: 'POST', body: JSON.stringify(input) },
  )
  return candidateGenerationSchema.parse(result)
}

export async function listEvaluationCandidateGenerations(
  knowledgeBaseId: string,
  page = 1,
  pageSize = 20,
): Promise<PaginatedEvaluations<EvaluationCandidateGeneration>> {
  const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) })
  const result = await apiRequest<unknown>(
    `/knowledge-bases/${knowledgeBaseId}/evaluation-candidates/generations?${params}`,
  )
  return z
    .object({ items: z.array(candidateGenerationSchema), meta: paginationSchema })
    .parse(result)
}

export async function listEvaluationCandidates(
  knowledgeBaseId: string,
  status?: EvaluationCandidateStatus,
  page = 1,
  pageSize = 100,
): Promise<PaginatedEvaluations<EvaluationCandidate>> {
  const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) })
  if (status) params.set('status', status)
  const result = await apiRequest<unknown>(
    `/knowledge-bases/${knowledgeBaseId}/evaluation-candidates?${params}`,
  )
  return z
    .object({ items: z.array(evaluationCandidateSchema), meta: paginationSchema })
    .parse(result)
}

export async function updateEvaluationCandidate(
  knowledgeBaseId: string,
  candidateId: string,
  input: Partial<
    Pick<
      EvaluationCandidate,
      | 'question'
      | 'scenario'
      | 'expectedOutcome'
      | 'expectedAnswerPoints'
      | 'expectedDocumentIds'
      | 'criticalEntities'
      | 'severity'
      | 'tags'
      | 'status'
      | 'reviewNote'
    >
  > & { revision: number },
): Promise<EvaluationCandidate> {
  const result = await apiRequest<unknown>(
    `/knowledge-bases/${knowledgeBaseId}/evaluation-candidates/${candidateId}`,
    { method: 'PATCH', body: JSON.stringify(input) },
  )
  return evaluationCandidateSchema.parse(result)
}

export async function publishEvaluationCandidates(
  knowledgeBaseId: string,
  input: {
    candidateIds: string[]
    baseSuiteId?: string
    name: string
    description?: string
    minimumOverallScore?: number
    minimumCitationAccuracyScore?: number
    minimumFaithfulnessScore?: number
    minimumRefusalAccuracy?: number
  },
): Promise<EvaluationSuite> {
  const result = await apiRequest<unknown>(
    `/knowledge-bases/${knowledgeBaseId}/evaluation-candidates/publish`,
    { method: 'POST', body: JSON.stringify(input) },
  )
  return evaluationSuiteSchema.parse(result)
}
