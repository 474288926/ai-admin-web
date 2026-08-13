import { z } from 'zod'

import type {
  EvaluationComparison,
  EvaluationImportValidation,
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
