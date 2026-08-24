import { describe, expect, it } from 'vitest'

import type { EvaluationRun } from '@/types/evaluation'
import {
  evaluationRunKindLabel,
  fullRunsFirst,
  latestCompletedFullEvaluationRun,
  preferredEvaluationRun,
} from '@/utils/evaluation-runs'

function run(
  id: string,
  status: EvaluationRun['status'],
  retryOfRunId: string | null,
): EvaluationRun {
  return {
    id,
    suiteId: 'suite-id',
    datasetChecksum: 'a'.repeat(64),
    status,
    progress: 100,
    totalCases: 1,
    completedCases: 1,
    passedCases: 1,
    failedCases: 0,
    errorCases: 0,
    gatePassed: true,
    metrics: { averageOverallScore: 1 },
    configSnapshot: {},
    retryOfRunId,
    cases: [],
    createdAt: '2026-08-20T01:00:00.000Z',
    startedAt: '2026-08-20T01:00:00.000Z',
    finishedAt: '2026-08-20T01:01:00.000Z',
  }
}

describe('evaluation run presentation', () => {
  const full = run('full', 'COMPLETED', null)
  const retry = run('retry', 'COMPLETED', full.id)

  it('uses a full run for the default selection and summary metrics', () => {
    expect(preferredEvaluationRun([retry, full])).toBe(full)
    expect(latestCompletedFullEvaluationRun([retry, full])).toBe(full)
  })

  it('does not use a running full run as the latest completed summary', () => {
    const running = run('running', 'RUNNING', null)
    expect(latestCompletedFullEvaluationRun([running, retry, full])).toBe(full)
  })

  it('labels retries and places full comparison baselines first', () => {
    expect(evaluationRunKindLabel(full)).toBe('完整运行')
    expect(evaluationRunKindLabel(retry)).toBe('失败题重试')
    expect(fullRunsFirst([retry, full])).toEqual([full, retry])
  })
})
