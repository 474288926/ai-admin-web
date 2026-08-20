import type { PaginationMeta } from './knowledge-base'

export type EvaluationRunStatus = 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'CANCELLED'
export type EvaluationCaseStatus =
  | 'PENDING'
  | 'RUNNING'
  | 'PASSED'
  | 'FAILED'
  | 'ERROR'
  | 'CANCELLED'
export type EvaluationCaseSeverity = 'NORMAL' | 'HIGH' | 'CRITICAL'

export interface RecommendedQuestion {
  id: string
  externalId: string
  scenario: string
  question: string
  suiteId: string
  suiteName: string
  suiteVersion: number
}

export interface RecommendedQuestions {
  suiteId: string | null
  suiteName: string | null
  suiteVersion: number | null
  items: RecommendedQuestion[]
}

export interface EvaluationSuite {
  id: string
  knowledgeBaseId: string
  name: string
  description: string | null
  version: number
  datasetChecksum: string
  externalDatasetId: string | null
  externalDatasetVersion: string | null
  sourceSnapshot: Record<string, unknown>[]
  minimumOverallScore: number
  minimumCitationAccuracyScore: number
  minimumRefusalAccuracy: number
  caseCount: number
  cases: Array<{
    id: string
    externalId: string
    scenario: string
    question: string
    expectedOutcome: 'ANSWER' | 'NO_ANSWER'
    expectedAnswerPoints: string[]
    expectedDocumentIds: string[]
    criticalEntities: string[]
    severity: EvaluationCaseSeverity
    tags: string[]
    position: number
  }>
  createdAt: string
  updatedAt: string
}

export interface EvaluationRunCase {
  id: string
  evaluationCaseId: string
  externalId: string
  expectedScenario: string
  expectedOutcome: 'ANSWER' | 'NO_ANSWER'
  severity: EvaluationCaseSeverity
  tags: string[]
  status: EvaluationCaseStatus
  actualScenario: string | null
  refused: boolean | null
  citationDocumentIds: string[]
  correctnessScore: number | null
  completenessScore: number | null
  faithfulnessScore: number | null
  citationAccuracyScore: number | null
  overallScore: number | null
  errorCode: string | null
  durationMs: number | null
  inputTokens: number | null
  outputTokens: number | null
  totalTokens: number | null
  cachedInputTokens: number | null
  reasoningOutputTokens: number | null
}

export interface EvaluationRun {
  id: string
  suiteId: string
  datasetChecksum: string
  status: EvaluationRunStatus
  progress: number
  totalCases: number
  completedCases: number
  passedCases: number
  failedCases: number
  errorCases: number
  gatePassed: boolean | null
  metrics: Record<string, unknown> | null
  configSnapshot: Record<string, unknown>
  retryOfRunId: string | null
  cases: EvaluationRunCase[]
  createdAt: string
  startedAt: string | null
  finishedAt: string | null
}

export interface EvaluationComparison {
  baselineRunId: string
  candidateRunId: string
  sameDatasetChecksum: boolean
  sameCaseSet: boolean
  changedConfigKeys: string[]
  metricDeltas: Record<
    string,
    { baseline: number | null; candidate: number | null; delta: number | null }
  >
  regressedCases: number
  improvedCases: number
  unchangedCases: number
  addedCases: number
  removedCases: number
  cases: Array<{
    externalId: string
    changeType: 'REGRESSED' | 'IMPROVED' | 'UNCHANGED' | 'ADDED' | 'REMOVED'
    baselineStatus: EvaluationCaseStatus | null
    candidateStatus: EvaluationCaseStatus | null
    baselineOverallScore: number | null
    candidateOverallScore: number | null
    overallScoreDelta: number | null
    baselineErrorCode: string | null
    candidateErrorCode: string | null
  }>
}

export interface EvaluationImportValidation {
  valid: boolean
  datasetId: string
  datasetVersion: string
  caseCount: number
  mappedDocumentCount: number
  documentMappings: Array<{
    key: string
    originalName: string
    documentId: string | null
    errorCode: string | null
  }>
  issues: Array<{ code: string; path: string; message: string }>
}

export interface PaginatedEvaluations<T> {
  items: T[]
  meta: PaginationMeta
}
