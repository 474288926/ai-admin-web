import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  compareEvaluationRuns,
  createEvaluationCandidateGeneration,
  listEvaluationCandidates,
  listEvaluationRuns,
  listEvaluationSuites,
  publishEvaluationCandidates,
  startEvaluationRun,
  startKnowledgeBacklogVerificationRun,
  validateEvaluationImport,
} from '@/services/api/evaluations'

const knowledgeBaseId = '03c7a80e-c672-41f0-8b9c-cfb915eabe4c'
const suiteId = '9b148f19-fd93-4c74-be98-35fa2008efc8'
const runId = '241a10e1-b6f3-468e-b6ed-d8619e7520b7'
const baselineRunId = '63d3f9f8-55ef-418d-8300-402e7b64607b'

const suite = {
  id: suiteId,
  knowledgeBaseId,
  name: '回答评测集',
  description: null,
  version: 1,
  datasetChecksum: 'a'.repeat(64),
  externalDatasetId: 'answer-golden-set',
  externalDatasetVersion: '1.0.0',
  sourceSnapshot: [],
  minimumOverallScore: 0.8,
  minimumCitationAccuracyScore: 0.8,
  minimumRefusalAccuracy: 0.9,
  caseCount: 1,
  cases: [],
  createdAt: '2026-08-12T01:00:00.000Z',
  updatedAt: '2026-08-12T01:00:00.000Z',
}
const run = {
  id: runId,
  suiteId,
  datasetChecksum: 'a'.repeat(64),
  status: 'COMPLETED',
  progress: 100,
  totalCases: 1,
  completedCases: 1,
  passedCases: 1,
  failedCases: 0,
  errorCases: 0,
  gatePassed: true,
  metrics: { averageOverallScore: 0.95 },
  configSnapshot: {},
  retryOfRunId: null,
  cases: [
    {
      id: '741a10e1-b6f3-468e-b6ed-d8619e7520b7',
      evaluationCaseId: '851a10e1-b6f3-468e-b6ed-d8619e7520b7',
      externalId: 'case-1',
      expectedScenario: 'product_documentation',
      expectedOutcome: 'ANSWER',
      severity: 'NORMAL',
      tags: [],
      status: 'PASSED',
      actualScenario: 'product_documentation',
      refused: false,
      citationDocumentIds: [],
      correctnessScore: 1,
      completenessScore: 1,
      faithfulnessScore: 1,
      citationAccuracyScore: 1,
      overallScore: 1,
      errorCode: null,
      durationMs: 1200,
      inputTokens: 100,
      outputTokens: 50,
      totalTokens: 150,
      cachedInputTokens: 0,
      reasoningOutputTokens: 0,
    },
  ],
  createdAt: '2026-08-12T01:00:00.000Z',
  startedAt: '2026-08-12T01:00:01.000Z',
  finishedAt: '2026-08-12T01:00:05.000Z',
}
const pagination = { page: 1, pageSize: 20, total: 1, totalPages: 1, hasNextPage: false }

afterEach(() => vi.unstubAllGlobals())

describe('evaluations api', () => {
  it('loads suites and runs and starts an evaluation', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ items: [suite], meta: pagination }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ items: [run], meta: pagination }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify(run), {
          status: 201,
          headers: { 'Content-Type': 'application/json' },
        }),
      )
    vi.stubGlobal('fetch', fetchMock)

    expect((await listEvaluationSuites(knowledgeBaseId)).items[0]?.caseCount).toBe(1)
    expect((await listEvaluationRuns(knowledgeBaseId, suiteId)).items[0]?.gatePassed).toBe(true)
    await startEvaluationRun(knowledgeBaseId, suiteId)

    expect(fetchMock.mock.calls[2]?.[1]).toMatchObject({ method: 'POST' })
  })

  it('starts an atomic knowledge backlog verification run', async () => {
    const backlogItemId = '1d8a3787-d6f7-49dc-992f-849c1add3362'
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(run), {
        status: 201,
        headers: { 'Content-Type': 'application/json' },
      }),
    )
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      startKnowledgeBacklogVerificationRun(knowledgeBaseId, suiteId, backlogItemId, 3),
    ).resolves.toMatchObject({ id: runId, gatePassed: true })
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain(
      `/runs/knowledge-backlog/${backlogItemId}`,
    )
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({ revision: 3 })
  })

  it('validates imports and compares completed runs', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            valid: true,
            datasetId: 'answer-set',
            datasetVersion: '1.0',
            caseCount: 1,
            mappedDocumentCount: 1,
            documentMappings: [],
            issues: [],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            baselineRunId,
            candidateRunId: runId,
            sameDatasetChecksum: true,
            sameCaseSet: true,
            changedConfigKeys: [],
            metricDeltas: { averageOverallScore: { baseline: 0.9, candidate: 0.95, delta: 0.05 } },
            regressedCases: 0,
            improvedCases: 1,
            unchangedCases: 0,
            addedCases: 0,
            removedCases: 0,
            cases: [],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      )
    vi.stubGlobal('fetch', fetchMock)

    expect((await validateEvaluationImport(knowledgeBaseId, { schemaVersion: 1 })).valid).toBe(true)
    const comparison = await compareEvaluationRuns(knowledgeBaseId, suiteId, runId, baselineRunId)
    expect(comparison.metricDeltas.averageOverallScore?.delta).toBe(0.05)
    expect(String(fetchMock.mock.calls[1]?.[0])).toContain('/comparisons/')
  })

  it('creates generation jobs and parses reviewable candidates', async () => {
    const generationId = 'd82dba1c-11c5-433c-9d7f-21a4dd1a7bab'
    const documentId = 'df76a995-c58a-421d-be5e-bcaa0734794a'
    const generation = {
      id: generationId,
      status: 'PENDING',
      documentCount: 1,
      questionsPerDocument: 5,
      includeBoundaryCases: true,
      generatedCaseCount: 0,
      provider: null,
      model: null,
      failureCode: null,
      createdAt: '2026-08-21T01:00:00.000Z',
      startedAt: null,
      finishedAt: null,
    }
    const candidate = {
      id: '1f45a9b4-bff3-4445-b198-e35ad8ddf2bb',
      generationId,
      externalId: 'AUTO-001',
      scenario: 'product_documentation',
      question: '产品是否支持在线协作？',
      expectedOutcome: 'ANSWER',
      expectedAnswerPoints: ['支持在线协作'],
      expectedDocumentIds: [documentId],
      criticalEntities: [],
      severity: 'NORMAL',
      tags: ['auto_generated'],
      status: 'DRAFT',
      revision: 0,
      reviewNote: null,
      stale: false,
      staleReasons: [],
      sourceDocuments: [
        {
          id: documentId,
          originalName: '产品说明.pdf',
          version: 1,
          checksumSha256: 'a'.repeat(64),
        },
      ],
      publishedSuiteId: null,
      createdAt: '2026-08-21T01:00:10.000Z',
      updatedAt: '2026-08-21T01:00:10.000Z',
    }
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify(generation), {
          status: 201,
          headers: { 'Content-Type': 'application/json' },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ items: [candidate], meta: pagination }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      )
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      createEvaluationCandidateGeneration(knowledgeBaseId, {
        documentIds: [documentId],
        questionsPerDocument: 5,
        includeBoundaryCases: true,
      }),
    ).resolves.toMatchObject({ status: 'PENDING', documentCount: 1 })
    await expect(listEvaluationCandidates(knowledgeBaseId)).resolves.toMatchObject({
      items: [expect.objectContaining({ status: 'DRAFT', stale: false })],
    })
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ method: 'POST' })
  })

  it('publishes candidates on top of an existing complete suite', async () => {
    const candidateId = '1f45a9b4-bff3-4445-b198-e35ad8ddf2bb'
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(suite), {
        status: 201,
        headers: { 'Content-Type': 'application/json' },
      }),
    )
    vi.stubGlobal('fetch', fetchMock)

    await publishEvaluationCandidates(knowledgeBaseId, {
      candidateIds: [candidateId],
      baseSuiteId: suiteId,
      name: '继承后的完整测试基线',
    })

    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toMatchObject({
      candidateIds: [candidateId],
      baseSuiteId: suiteId,
      name: '继承后的完整测试基线',
    })
  })
})
