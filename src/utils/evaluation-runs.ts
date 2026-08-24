import type { EvaluationRun } from '@/types/evaluation'

export function isFullEvaluationRun(run: EvaluationRun): boolean {
  return run.retryOfRunId === null
}

export function preferredEvaluationRun(runs: readonly EvaluationRun[]): EvaluationRun | undefined {
  return runs.find(isFullEvaluationRun) ?? runs[0]
}

export function latestCompletedFullEvaluationRun(
  runs: readonly EvaluationRun[],
): EvaluationRun | undefined {
  return runs.find((run) => isFullEvaluationRun(run) && run.status === 'COMPLETED')
}

export function evaluationRunKindLabel(run: EvaluationRun): '完整运行' | '失败题重试' {
  return isFullEvaluationRun(run) ? '完整运行' : '失败题重试'
}

export function fullRunsFirst(runs: readonly EvaluationRun[]): EvaluationRun[] {
  return [...runs.filter(isFullEvaluationRun), ...runs.filter((run) => !isFullEvaluationRun(run))]
}
