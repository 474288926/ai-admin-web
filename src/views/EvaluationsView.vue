<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query'
import {
  CircleCheck,
  CircleClose,
  DataAnalysis,
  DocumentAdd,
  EditPen,
  Files,
  MagicStick,
  Refresh,
  TrendCharts,
  UploadFilled,
  VideoPlay,
} from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox, type UploadFile } from 'element-plus'
import { useRoute, useRouter } from 'vue-router'

import * as evaluationApi from '@/services/api/evaluations'
import * as documentApi from '@/services/api/documents'
import * as knowledgeBaseApi from '@/services/api/knowledge-bases'
import { getErrorCodeMessage, getErrorMessage } from '@/services/error-feedback'
import type {
  EvaluationCandidate,
  EvaluationCandidateStatus,
  EvaluationCaseSeverity,
  EvaluationComparison,
  EvaluationRun,
  EvaluationRunCase,
  EvaluationRunStatus,
} from '@/types/evaluation'
import {
  evaluationRunKindLabel,
  fullRunsFirst,
  latestCompletedFullEvaluationRun,
  preferredEvaluationRun,
} from '@/utils/evaluation-runs'

const route = useRoute()
const router = useRouter()
const queryClient = useQueryClient()
const selectedKnowledgeBaseId = ref(String(route.query.knowledgeBaseId ?? ''))
const selectedSuiteId = ref('')
const selectedRunId = ref('')
const baselineRunId = ref('')
const detailDrawerVisible = ref(false)
const importDialogVisible = ref(false)
const importDataset = ref<Record<string, unknown> | null>(null)
const importFileName = ref('')
const candidateDrawerVisible = ref(false)
const generationDialogVisible = ref(false)
const candidateEditDialogVisible = ref(false)
const publishDialogVisible = ref(false)
const selectedGenerationDocumentIds = ref<string[]>([])
const questionsPerDocument = ref(5)
const includeBoundaryCases = ref(true)
const candidateStatusFilter = ref<'ALL' | EvaluationCandidateStatus>('ALL')
const selectedCandidateIds = ref<string[]>([])
const editingCandidate = ref<EvaluationCandidate | null>(null)
const editAnswerPoints = ref('')
const editCriticalEntities = ref('')
const publishName = ref('')
const publishDescription = ref('')
const publishBaseSuiteId = ref('')
const runAfterPublish = ref(true)
const caseStatusFilter = ref<'ALL' | EvaluationRunCase['status']>('ALL')

const knowledgeBasesQuery = useQuery({
  queryKey: ['knowledge-bases', 'evaluation-options'],
  queryFn: () => knowledgeBaseApi.listKnowledgeBases(1, 100),
})
const knowledgeBases = computed(() => knowledgeBasesQuery.data.value?.items ?? [])

const candidateDocumentsQuery = useQuery({
  queryKey: computed(() => ['evaluation-candidate-documents', selectedKnowledgeBaseId.value]),
  queryFn: () => documentApi.listDocuments(selectedKnowledgeBaseId.value, 1, 100),
  enabled: computed(() => Boolean(selectedKnowledgeBaseId.value)),
})
const candidateDocuments = computed(() =>
  (candidateDocumentsQuery.data.value?.items ?? []).filter(
    (item) =>
      item.status === 'READY' &&
      item.embeddingStatus === 'READY' &&
      item.lifecycleStatus === 'PUBLISHED',
  ),
)

const candidateGenerationsQuery = useQuery({
  queryKey: computed(() => ['evaluation-candidate-generations', selectedKnowledgeBaseId.value]),
  queryFn: () =>
    evaluationApi.listEvaluationCandidateGenerations(selectedKnowledgeBaseId.value, 1, 20),
  enabled: computed(() =>
    Boolean(
      selectedKnowledgeBaseId.value &&
      (candidateDrawerVisible.value || generationDialogVisible.value),
    ),
  ),
  refetchInterval: 5000,
})
const latestCandidateGeneration = computed(() => candidateGenerationsQuery.data.value?.items[0])

const candidatesQuery = useQuery({
  queryKey: computed(() => [
    'evaluation-candidates',
    selectedKnowledgeBaseId.value,
    candidateStatusFilter.value,
  ]),
  queryFn: () =>
    evaluationApi.listEvaluationCandidates(
      selectedKnowledgeBaseId.value,
      candidateStatusFilter.value === 'ALL' ? undefined : candidateStatusFilter.value,
      1,
      100,
    ),
  enabled: computed(() => Boolean(selectedKnowledgeBaseId.value && candidateDrawerVisible.value)),
})
const evaluationCandidates = computed(() => candidatesQuery.data.value?.items ?? [])
const publishableCandidates = computed(() =>
  evaluationCandidates.value.filter(
    (item) =>
      selectedCandidateIds.value.includes(item.id) && item.status === 'APPROVED' && !item.stale,
  ),
)

const suitesQuery = useQuery({
  queryKey: computed(() => ['evaluation-suites', selectedKnowledgeBaseId.value]),
  queryFn: () => evaluationApi.listEvaluationSuites(selectedKnowledgeBaseId.value, 1, 50),
  enabled: computed(() => Boolean(selectedKnowledgeBaseId.value)),
})
const suites = computed(() => suitesQuery.data.value?.items ?? [])
const selectedSuite = computed(() => suites.value.find((item) => item.id === selectedSuiteId.value))
const publishBaseSuite = computed(() =>
  suites.value.find((item) => item.id === publishBaseSuiteId.value),
)
const mergedPublishCaseCount = computed(
  () => (publishBaseSuite.value?.caseCount ?? 0) + publishableCandidates.value.length,
)

const runsQuery = useQuery({
  queryKey: computed(() => [
    'evaluation-runs',
    selectedKnowledgeBaseId.value,
    selectedSuiteId.value,
  ]),
  queryFn: () =>
    evaluationApi.listEvaluationRuns(selectedKnowledgeBaseId.value, selectedSuiteId.value, 1, 50),
  enabled: computed(() => Boolean(selectedKnowledgeBaseId.value && selectedSuiteId.value)),
  refetchInterval: 8000,
})
const runs = computed(() => runsQuery.data.value?.items ?? [])
const selectedRun = computed(
  () =>
    runs.value.find((item) => item.id === selectedRunId.value) ??
    preferredEvaluationRun(runs.value),
)
const finishedRuns = computed(() =>
  runs.value.filter((item) => ['COMPLETED', 'FAILED', 'CANCELLED'].includes(item.status)),
)
const baselineOptions = computed(() =>
  fullRunsFirst(finishedRuns.value.filter((item) => item.id !== selectedRun.value?.id)),
)

const runDetailQuery = useQuery({
  queryKey: computed(() => [
    'evaluation-run-detail',
    selectedKnowledgeBaseId.value,
    selectedSuiteId.value,
    selectedRunId.value,
  ]),
  queryFn: () =>
    evaluationApi.getEvaluationRun(
      selectedKnowledgeBaseId.value,
      selectedSuiteId.value,
      selectedRunId.value,
    ),
  enabled: computed(() => Boolean(selectedRunId.value && detailDrawerVisible.value)),
  refetchInterval: 5000,
})
const runDetail = computed(() => runDetailQuery.data.value ?? selectedRun.value)
const filteredCases = computed(() => {
  const cases = runDetail.value?.cases ?? []
  return caseStatusFilter.value === 'ALL'
    ? cases
    : cases.filter((item) => item.status === caseStatusFilter.value)
})

const comparisonQuery = useQuery({
  queryKey: computed(() => [
    'evaluation-comparison',
    selectedKnowledgeBaseId.value,
    selectedSuiteId.value,
    selectedRun.value?.id,
    baselineRunId.value,
  ]),
  queryFn: () =>
    evaluationApi.compareEvaluationRuns(
      selectedKnowledgeBaseId.value,
      selectedSuiteId.value,
      selectedRun.value!.id,
      baselineRunId.value,
    ),
  enabled: computed(() => Boolean(selectedRun.value?.id && baselineRunId.value)),
})
const comparison = computed(() => comparisonQuery.data.value)

const startMutation = useMutation({
  mutationFn: () =>
    evaluationApi.startEvaluationRun(selectedKnowledgeBaseId.value, selectedSuiteId.value),
})
const cancelMutation = useMutation({
  mutationFn: (runId: string) =>
    evaluationApi.cancelEvaluationRun(selectedKnowledgeBaseId.value, selectedSuiteId.value, runId),
})
const retryMutation = useMutation({
  mutationFn: (runId: string) =>
    evaluationApi.retryEvaluationRun(selectedKnowledgeBaseId.value, selectedSuiteId.value, runId),
})
const validateImportMutation = useMutation({
  mutationFn: (dataset: Record<string, unknown>) =>
    evaluationApi.validateEvaluationImport(selectedKnowledgeBaseId.value, dataset),
})
const importMutation = useMutation({
  mutationFn: (dataset: Record<string, unknown>) =>
    evaluationApi.importEvaluationSuite(selectedKnowledgeBaseId.value, dataset),
})
const createCandidateGenerationMutation = useMutation({
  mutationFn: () =>
    evaluationApi.createEvaluationCandidateGeneration(selectedKnowledgeBaseId.value, {
      documentIds: selectedGenerationDocumentIds.value,
      questionsPerDocument: questionsPerDocument.value,
      includeBoundaryCases: includeBoundaryCases.value,
    }),
})
const updateCandidateMutation = useMutation({
  mutationFn: ({
    candidate,
    status,
  }: {
    candidate: EvaluationCandidate
    status: EvaluationCandidateStatus
  }) =>
    evaluationApi.updateEvaluationCandidate(selectedKnowledgeBaseId.value, candidate.id, {
      revision: candidate.revision,
      status,
    }),
})
const saveCandidateMutation = useMutation({
  mutationFn: (candidate: EvaluationCandidate) =>
    evaluationApi.updateEvaluationCandidate(selectedKnowledgeBaseId.value, candidate.id, {
      revision: candidate.revision,
      question: candidate.question,
      scenario: candidate.scenario,
      expectedOutcome: candidate.expectedOutcome,
      expectedAnswerPoints: lines(editAnswerPoints.value),
      expectedDocumentIds:
        candidate.expectedOutcome === 'ANSWER'
          ? candidate.expectedDocumentIds.length
            ? candidate.expectedDocumentIds
            : candidate.sourceDocuments.map((item) => item.id)
          : [],
      criticalEntities: lines(editCriticalEntities.value),
      severity: candidate.severity,
      reviewNote: candidate.reviewNote ?? undefined,
    }),
})
const publishCandidatesMutation = useMutation({
  mutationFn: () =>
    evaluationApi.publishEvaluationCandidates(selectedKnowledgeBaseId.value, {
      candidateIds: publishableCandidates.value.map((item) => item.id),
      ...(publishBaseSuiteId.value ? { baseSuiteId: publishBaseSuiteId.value } : {}),
      name: publishName.value.trim(),
      ...(publishDescription.value.trim() ? { description: publishDescription.value.trim() } : {}),
      minimumOverallScore: publishBaseSuite.value?.minimumOverallScore,
      minimumCitationAccuracyScore: publishBaseSuite.value?.minimumCitationAccuracyScore,
      minimumFaithfulnessScore: publishBaseSuite.value?.minimumFaithfulnessScore,
      minimumRefusalAccuracy: publishBaseSuite.value?.minimumRefusalAccuracy,
    }),
})
const startPublishedSuiteMutation = useMutation({
  mutationFn: (suiteId: string) =>
    evaluationApi.startEvaluationRun(selectedKnowledgeBaseId.value, suiteId),
})

const latestCompletedFullRun = computed(() => latestCompletedFullEvaluationRun(runs.value))
const metricCards = computed(() => {
  const run = latestCompletedFullRun.value
  return [
    {
      label: '综合得分',
      key: 'averageOverallScore',
      threshold: selectedSuite.value?.minimumOverallScore,
    },
    { label: '正确性', key: 'averageCorrectnessScore' },
    { label: '完整性', key: 'averageCompletenessScore' },
    {
      label: '证据忠实度',
      key: 'averageFaithfulnessScore',
      threshold: selectedSuite.value?.minimumFaithfulnessScore,
    },
    {
      label: '引用准确率',
      key: 'averageCitationAccuracyScore',
      threshold: selectedSuite.value?.minimumCitationAccuracyScore,
    },
    {
      label: '拒答准确率',
      key: 'refusalAccuracy',
      threshold: selectedSuite.value?.minimumRefusalAccuracy,
    },
  ].map((item) => ({ ...item, value: metricNumber(run, item.key) }))
})

watch(
  knowledgeBases,
  (items) => {
    if (!selectedKnowledgeBaseId.value && items[0]) selectedKnowledgeBaseId.value = items[0].id
  },
  { immediate: true },
)
watch(selectedKnowledgeBaseId, (value) => {
  selectedSuiteId.value = ''
  selectedRunId.value = ''
  baselineRunId.value = ''
  selectedCandidateIds.value = []
  const query = { ...route.query }
  if (value) query.knowledgeBaseId = value
  else delete query.knowledgeBaseId
  void router.replace({ query })
})
watch(latestCandidateGeneration, async (current, previous) => {
  if (
    current?.status === 'COMPLETED' &&
    previous?.status !== 'COMPLETED' &&
    candidateDrawerVisible.value
  ) {
    ElMessage.success(`已生成 ${current.generatedCaseCount} 道候选题，请逐题审核`)
    await candidatesQuery.refetch()
  }
})
watch(
  [candidateDocuments, () => route.query.candidateDocumentId],
  async ([documents, requestedDocumentId]) => {
    if (typeof requestedDocumentId !== 'string' || !candidateDocumentsQuery.isSuccess.value) return
    const query = { ...route.query }
    delete query.candidateDocumentId
    await router.replace({ query })
    const document = documents.find((item) => item.id === requestedDocumentId)
    if (!document) {
      ElMessage.warning('该文档尚未发布或处理未完成，暂时不能生成候选评测题')
      return
    }
    selectedGenerationDocumentIds.value = [document.id]
    generationDialogVisible.value = true
  },
  { immediate: true },
)
watch(
  suites,
  (items) => {
    if (!items.some((item) => item.id === selectedSuiteId.value))
      selectedSuiteId.value = items[0]?.id ?? ''
  },
  { immediate: true },
)
watch(selectedSuiteId, () => {
  selectedRunId.value = ''
  baselineRunId.value = ''
})
watch(
  runs,
  (items) => {
    if (!items.some((item) => item.id === selectedRunId.value))
      selectedRunId.value = preferredEvaluationRun(items)?.id ?? ''
    if (!baselineOptions.value.some((item) => item.id === baselineRunId.value)) {
      baselineRunId.value = baselineOptions.value[0]?.id ?? ''
    }
  },
  { immediate: true },
)

async function refreshData(): Promise<void> {
  await Promise.all([suitesQuery.refetch(), runsQuery.refetch()])
}

async function startRun(): Promise<void> {
  if (!selectedSuiteId.value) return
  try {
    await ElMessageBox.confirm(
      `将使用正式问答链路执行 ${selectedSuite.value?.caseCount ?? 0} 个用例，可能产生模型调用费用。`,
      '确认启动评测',
      { confirmButtonText: '确认启动', cancelButtonText: '取消', type: 'warning' },
    )
    const run = await startMutation.mutateAsync()
    selectedRunId.value = run.id
    ElMessage.success('评测运行已创建')
    await queryClient.invalidateQueries({ queryKey: ['evaluation-runs'] })
  } catch (error) {
    if (error === 'cancel' || error === 'close') return
    ElMessage.error(getErrorMessage(error))
  }
}

async function cancelRun(run: EvaluationRun): Promise<void> {
  try {
    await cancelMutation.mutateAsync(run.id)
    ElMessage.success('评测取消请求已提交')
    await runsQuery.refetch()
  } catch (error) {
    ElMessage.error(getErrorMessage(error))
  }
}

async function retryRun(run: EvaluationRun): Promise<void> {
  try {
    const retry = await retryMutation.mutateAsync(run.id)
    selectedRunId.value = retry.id
    ElMessage.success('失败用例重试运行已创建')
    await runsQuery.refetch()
  } catch (error) {
    ElMessage.error(getErrorMessage(error))
  }
}

function openRun(run: EvaluationRun): void {
  selectedRunId.value = run.id
  caseStatusFilter.value = 'ALL'
  detailDrawerVisible.value = true
}

async function handleImportFile(file: UploadFile): Promise<void> {
  const raw = file.raw
  if (!raw) return
  try {
    const parsed: unknown = JSON.parse(await raw.text())
    if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') throw new Error('invalid')
    importDataset.value = parsed as Record<string, unknown>
    importFileName.value = raw.name
    validateImportMutation.reset()
  } catch {
    importDataset.value = null
    importFileName.value = ''
    ElMessage.error('请选择有效的 JSON 评测集文件')
  }
}

async function validateDataset(): Promise<void> {
  if (!importDataset.value) return
  try {
    const result = await validateImportMutation.mutateAsync(importDataset.value)
    ElMessage[result.valid ? 'success' : 'warning'](
      result.valid ? '评测集校验通过' : `评测集存在 ${result.issues.length} 个问题`,
    )
  } catch (error) {
    ElMessage.error(getErrorMessage(error))
  }
}

async function importDatasetNow(): Promise<void> {
  if (!importDataset.value || !validateImportMutation.data.value?.valid) return
  try {
    const suite = await importMutation.mutateAsync(importDataset.value)
    importDialogVisible.value = false
    selectedSuiteId.value = suite.id
    ElMessage.success('评测集已导入')
    await suitesQuery.refetch()
  } catch (error) {
    ElMessage.error(getErrorMessage(error))
  }
}

function openGenerationDialog(): void {
  selectedGenerationDocumentIds.value = candidateDocuments.value.slice(0, 10).map((item) => item.id)
  generationDialogVisible.value = true
}

async function createCandidateGeneration(): Promise<void> {
  if (!selectedGenerationDocumentIds.value.length) return
  try {
    await createCandidateGenerationMutation.mutateAsync()
    generationDialogVisible.value = false
    candidateDrawerVisible.value = true
    ElMessage.success('候选题生成任务已提交')
    await candidateGenerationsQuery.refetch()
  } catch (error) {
    ElMessage.error(getErrorMessage(error))
  }
}

async function reviewCandidate(
  candidate: EvaluationCandidate,
  status: 'APPROVED' | 'REJECTED',
): Promise<void> {
  try {
    await updateCandidateMutation.mutateAsync({ candidate, status })
    ElMessage.success(status === 'APPROVED' ? '候选题已通过' : '候选题已退回')
    await candidatesQuery.refetch()
  } catch (error) {
    ElMessage.error(getErrorMessage(error))
  }
}

function openCandidateEditor(candidate: EvaluationCandidate): void {
  editingCandidate.value = { ...candidate }
  editAnswerPoints.value = candidate.expectedAnswerPoints.join('\n')
  editCriticalEntities.value = candidate.criticalEntities.join('\n')
  candidateEditDialogVisible.value = true
}

async function saveCandidate(): Promise<void> {
  if (!editingCandidate.value) return
  try {
    await saveCandidateMutation.mutateAsync(editingCandidate.value)
    candidateEditDialogVisible.value = false
    ElMessage.success('候选题已保存')
    await candidatesQuery.refetch()
  } catch (error) {
    ElMessage.error(getErrorMessage(error))
  }
}

function openPublishDialog(): void {
  if (!publishableCandidates.value.length) return
  publishName.value = `知识库评测基线 ${new Intl.DateTimeFormat('zh-CN').format(new Date())}`
  publishDescription.value = '由知识文档自动生成、人工审核后发布的测试评测基线。'
  publishBaseSuiteId.value = selectedSuiteId.value
  runAfterPublish.value = true
  publishDialogVisible.value = true
}

async function publishCandidates(): Promise<void> {
  if (!publishName.value.trim() || !publishableCandidates.value.length) return
  try {
    const suite = await publishCandidatesMutation.mutateAsync()
    publishDialogVisible.value = false
    selectedCandidateIds.value = []
    selectedSuiteId.value = suite.id
    await Promise.all([suitesQuery.refetch(), candidatesQuery.refetch()])
    if (!runAfterPublish.value) {
      ElMessage.success(`已冻结完整评测套件，共 ${suite.caseCount} 道题`)
      return
    }
    try {
      const run = await startPublishedSuiteMutation.mutateAsync(suite.id)
      selectedRunId.value = run.id
      detailDrawerVisible.value = true
      await queryClient.invalidateQueries({ queryKey: ['evaluation-runs'] })
      ElMessage.success(`已冻结 ${suite.caseCount} 道题并启动完整评测`)
    } catch (error) {
      ElMessage.warning(`套件已成功冻结，但自动评测未启动：${getErrorMessage(error)}`)
    }
  } catch (error) {
    ElMessage.error(getErrorMessage(error))
  }
}

function lines(value: string): string[] {
  return value
    .split(/\r?\n/u)
    .map((item) => item.trim())
    .filter(Boolean)
}

function metricNumber(run: EvaluationRun | undefined, key: string): number | null {
  const value = run?.metrics?.[key]
  return typeof value === 'number' ? value : null
}

function score(value: number | null | undefined): string {
  return value === null || value === undefined ? '—' : `${(value * 100).toFixed(1)}%`
}

function statusLabel(value: EvaluationRunStatus | EvaluationRunCase['status']): string {
  return (
    {
      PENDING: '等待中',
      RUNNING: '运行中',
      COMPLETED: '已完成',
      FAILED: '失败',
      CANCELLED: '已取消',
      PASSED: '通过',
      ERROR: '错误',
    }[value] ?? value
  )
}

function statusType(
  value: EvaluationRunStatus | EvaluationRunCase['status'],
): 'success' | 'warning' | 'danger' | 'info' | 'primary' {
  if (value === 'COMPLETED' || value === 'PASSED') return 'success'
  if (value === 'RUNNING') return 'primary'
  if (value === 'PENDING') return 'warning'
  if (value === 'FAILED' || value === 'ERROR') return 'danger'
  return 'info'
}

function severityLabel(value: EvaluationCaseSeverity): string {
  return { NORMAL: '普通', HIGH: '高风险', CRITICAL: '关键' }[value]
}

function candidateStatusLabel(value: EvaluationCandidateStatus): string {
  return { DRAFT: '待审核', APPROVED: '已通过', REJECTED: '已退回', PUBLISHED: '已发布' }[value]
}

function candidateStatusType(
  value: EvaluationCandidateStatus,
): 'success' | 'warning' | 'danger' | 'info' {
  if (value === 'APPROVED' || value === 'PUBLISHED') return 'success'
  if (value === 'REJECTED') return 'danger'
  return 'warning'
}

function formatDate(value: string | null): string {
  if (!value) return '—'
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}

function comparisonMetricLabel(key: string): string {
  return (
    {
      averageOverallScore: '综合得分',
      averageCorrectnessScore: '正确性',
      averageCompletenessScore: '完整性',
      averageFaithfulnessScore: '忠实度',
      averageCitationAccuracyScore: '引用准确率',
      refusalAccuracy: '拒答准确率',
      averageDurationMs: '平均耗时',
      totalDurationMs: '总耗时',
      averageTotalTokens: '平均 Token',
      totalInputTokens: '输入 Token',
      totalOutputTokens: '输出 Token',
      totalTokens: '总 Token',
    }[key] ?? key
  )
}

function operationalMetricValue(key: string, value: number | null): string {
  if (value === null) return '—'
  if (key.toLowerCase().includes('duration')) return `${Math.round(value)} ms`
  return value.toLocaleString('zh-CN')
}

function comparisonMetricValue(key: string, value: number | null): string {
  return key.includes('Duration') || key.includes('Tokens')
    ? operationalMetricValue(key, value)
    : score(value)
}

function comparisonMetricDelta(key: string, value: number | null): string {
  if (value === null) return '—'
  const prefix = value >= 0 ? '+' : ''
  return key.includes('Duration') || key.includes('Tokens')
    ? `${prefix}${Math.round(value).toLocaleString('zh-CN')}`
    : `${prefix}${(value * 100).toFixed(1)}%`
}

function comparisonDeltaIsPositive(key: string, value: number | null): boolean {
  if (value === null) return false
  return key.includes('Duration') || key.includes('Tokens') ? value < 0 : value > 0
}

function comparisonDeltaIsNegative(key: string, value: number | null): boolean {
  if (value === null) return false
  return key.includes('Duration') || key.includes('Tokens') ? value > 0 : value < 0
}

function metricDeltaEntries(value?: EvaluationComparison) {
  return Object.entries(value?.metricDeltas ?? {})
}
</script>

<template>
  <div class="evaluations-page">
    <section class="evaluations-hero">
      <div>
        <span class="eyebrow">EVALUATION CENTER</span>
        <h2>评测中心</h2>
        <p>
          使用固定评测集回归真实问答链路，跟踪正确性、完整性、证据忠实度、引用准确率和安全拒答表现。
        </p>
      </div>
      <div class="evaluations-context">
        <div>
          <span>知识库</span
          ><el-select v-model="selectedKnowledgeBaseId" filterable
            ><el-option
              v-for="item in knowledgeBases"
              :key="item.id"
              :label="item.name"
              :value="item.id"
          /></el-select>
        </div>
        <el-button
          :icon="MagicStick"
          :disabled="!selectedKnowledgeBaseId"
          @click="openGenerationDialog"
          >从文档生成候选题</el-button
        >
        <el-button
          :icon="EditPen"
          :disabled="!selectedKnowledgeBaseId"
          @click="candidateDrawerVisible = true"
          >审核候选题</el-button
        >
        <el-button :icon="UploadFilled" @click="importDialogVisible = true">导入评测集</el-button>
        <el-button
          type="primary"
          :icon="VideoPlay"
          :disabled="!selectedSuiteId"
          :loading="startMutation.isPending.value"
          @click="startRun"
          >启动评测</el-button
        >
      </div>
    </section>

    <section class="evaluation-suite-bar">
      <div>
        <span>评测套件</span
        ><el-select
          v-model="selectedSuiteId"
          filterable
          :loading="suitesQuery.isLoading.value"
          placeholder="请选择评测套件"
          ><el-option
            v-for="suite in suites"
            :key="suite.id"
            :label="`${suite.name} · v${suite.externalDatasetVersion ?? suite.version}`"
            :value="suite.id"
        /></el-select>
      </div>
      <div v-if="selectedSuite" class="suite-summary">
        <span>{{ selectedSuite.caseCount }} 个用例</span
        ><span>{{ selectedSuite.sourceSnapshot.length }} 份语料快照</span
        ><span>门槛 {{ score(selectedSuite.minimumOverallScore) }}</span>
      </div>
      <el-button
        :icon="Refresh"
        circle
        aria-label="刷新评测数据"
        :loading="runsQuery.isFetching.value"
        @click="refreshData"
      />
    </section>

    <el-alert
      v-if="suitesQuery.isError.value || runsQuery.isError.value"
      title="评测数据加载失败"
      :description="getErrorMessage(suitesQuery.error.value || runsQuery.error.value)"
      type="error"
      show-icon
      :closable="false"
    />

    <section class="evaluation-metrics">
      <article v-for="metric in metricCards" :key="metric.key">
        <span>{{ metric.label }}</span
        ><strong>{{ score(metric.value) }}</strong>
        <small v-if="metric.threshold !== undefined">门槛 {{ score(metric.threshold) }}</small
        ><small v-else>最近一次完整运行</small>
        <i
          v-if="metric.value !== null"
          :class="{ passed: metric.threshold === undefined || metric.value >= metric.threshold }"
        ></i>
      </article>
    </section>

    <section class="evaluation-main-grid">
      <article class="evaluation-panel runs-panel">
        <div class="evaluation-panel-head">
          <div>
            <h3>历史运行</h3>
            <span>{{ runs.length }} 次运行记录</span>
          </div>
          <el-tag
            v-if="latestCompletedFullRun"
            :type="latestCompletedFullRun.gatePassed ? 'success' : 'danger'"
            effect="light"
            >最近完整门禁{{ latestCompletedFullRun.gatePassed ? '通过' : '未通过' }}</el-tag
          >
        </div>
        <el-empty v-if="!runs.length && !runsQuery.isLoading.value" description="还没有评测运行"
          ><el-button type="primary" :icon="VideoPlay" @click="startRun"
            >启动第一次评测</el-button
          ></el-empty
        >
        <div v-else class="evaluation-run-list">
          <div
            v-for="run in runs"
            :key="run.id"
            :class="['evaluation-run-row', { active: selectedRun?.id === run.id }]"
            @click="selectedRunId = run.id"
          >
            <span class="run-status-icon"
              ><el-icon
                ><component
                  :is="
                    run.gatePassed === true
                      ? CircleCheck
                      : run.gatePassed === false
                        ? CircleClose
                        : DataAnalysis
                  " /></el-icon
            ></span>
            <div class="run-copy">
              <strong>{{ formatDate(run.createdAt) }} {{ evaluationRunKindLabel(run) }}</strong
              ><span
                >{{ run.completedCases }}/{{ run.totalCases }} 用例 · {{ run.failedCases }} 失败 ·
                {{ run.errorCases }} 错误</span
              >
            </div>
            <div class="run-progress">
              <el-progress
                :percentage="run.progress"
                :show-text="false"
                :status="
                  run.status === 'FAILED'
                    ? 'exception'
                    : run.status === 'COMPLETED'
                      ? 'success'
                      : undefined
                "
              /><span>{{ run.progress }}%</span>
            </div>
            <el-tag size="small" :type="statusType(run.status)" effect="plain">{{
              statusLabel(run.status)
            }}</el-tag>
            <div class="run-actions" @click.stop>
              <el-button link @click="openRun(run)">详情</el-button
              ><el-button
                v-if="['PENDING', 'RUNNING'].includes(run.status)"
                link
                type="danger"
                @click="cancelRun(run)"
                >取消</el-button
              ><el-button
                v-else-if="run.failedCases + run.errorCases > 0"
                link
                type="warning"
                @click="retryRun(run)"
                >重试失败项</el-button
              >
            </div>
          </div>
        </div>
      </article>

      <article class="evaluation-panel comparison-panel">
        <div class="evaluation-panel-head">
          <div>
            <h3>基线对比</h3>
            <span>候选运行与历史基线逐指标比较</span>
          </div>
          <el-icon><TrendCharts /></el-icon>
        </div>
        <div v-if="selectedRun" class="comparison-selector">
          <span
            >候选：{{ formatDate(selectedRun.createdAt) }} ·
            {{ evaluationRunKindLabel(selectedRun) }}</span
          ><el-select v-model="baselineRunId" placeholder="选择基线运行"
            ><el-option
              v-for="run in baselineOptions"
              :key="run.id"
              :label="`${formatDate(run.createdAt)} · ${evaluationRunKindLabel(run)} · ${statusLabel(run.status)}`"
              :value="run.id"
          /></el-select>
        </div>
        <el-empty v-if="!baselineRunId" description="至少需要两次已结束运行才能对比" />
        <div
          v-else-if="comparisonQuery.isLoading.value"
          v-loading="true"
          class="comparison-loading"
        ></div>
        <div v-else-if="comparison" class="comparison-content">
          <div class="comparison-counts">
            <span class="improved"
              >提升 <b>{{ comparison.improvedCases }}</b></span
            ><span class="regressed"
              >回退 <b>{{ comparison.regressedCases }}</b></span
            ><span
              >不变 <b>{{ comparison.unchangedCases }}</b></span
            >
          </div>
          <div class="metric-delta-list">
            <div v-for="[key, item] in metricDeltaEntries(comparison)" :key="key">
              <span>{{ comparisonMetricLabel(key) }}</span
              ><strong>{{ comparisonMetricValue(key, item.candidate) }}</strong
              ><b
                :class="{
                  positive: comparisonDeltaIsPositive(key, item.delta),
                  negative: comparisonDeltaIsNegative(key, item.delta),
                }"
                >{{ comparisonMetricDelta(key, item.delta) }}</b
              >
            </div>
          </div>
          <p v-if="comparison.changedConfigKeys.length">
            配置变化：{{ comparison.changedConfigKeys.join('、') }}
          </p>
          <p v-else>两次运行配置一致，适合直接比较。</p>
        </div>
      </article>
    </section>

    <el-drawer v-model="detailDrawerVisible" class="evaluation-run-drawer" size="min(920px, 94vw)">
      <template #header>
        <div class="run-detail-drawer-head">
          <span class="run-detail-drawer-icon">
            <el-icon><DataAnalysis /></el-icon>
          </span>
          <div class="run-detail-drawer-copy">
            <span>RUN INSPECTION</span>
            <strong>评测运行详情</strong>
            <small v-if="runDetail">
              {{ evaluationRunKindLabel(runDetail) }} · {{ formatDate(runDetail.createdAt) }} ·
              {{ runDetail.totalCases }} 个用例
            </small>
          </div>
          <el-tag v-if="runDetail" size="small" :type="statusType(runDetail.status)" effect="light">
            {{ statusLabel(runDetail.status) }}
          </el-tag>
        </div>
      </template>
      <div v-if="runDetail" class="run-detail">
        <div class="run-detail-summary">
          <div>
            <span>状态</span><strong>{{ statusLabel(runDetail.status) }}</strong>
          </div>
          <div>
            <span>门禁</span
            ><strong>{{
              runDetail.gatePassed === null ? '待判断' : runDetail.gatePassed ? '通过' : '未通过'
            }}</strong>
          </div>
          <div>
            <span>通过</span><strong>{{ runDetail.passedCases }}</strong>
          </div>
          <div>
            <span>失败/错误</span
            ><strong>{{ runDetail.failedCases + runDetail.errorCases }}</strong>
          </div>
        </div>
        <section class="run-config-snapshot">
          <div class="run-config-snapshot-head">
            <h4>运行配置快照</h4>
            <span>本次评测启动时固定的知识库有效配置</span>
          </div>
          <div class="run-config-grid">
            <div>
              <span>模型</span
              ><strong>{{
                runDetail.configSnapshot.aiModel ?? runDetail.configSnapshot.aiDefaultModelId ?? '—'
              }}</strong>
            </div>
            <div>
              <span>Provider</span><strong>{{ runDetail.configSnapshot.aiProvider ?? '—' }}</strong>
            </div>
            <div>
              <span>Prompt</span
              ><strong>{{
                runDetail.configSnapshot.promptVersion ??
                runDetail.configSnapshot.ragPromptVersion ??
                '—'
              }}</strong>
            </div>
            <div>
              <span>知识库类型</span
              ><strong>{{
                runDetail.configSnapshot.knowledgeBaseProfileType ??
                runDetail.configSnapshot.profileType ??
                '—'
              }}</strong>
            </div>
            <div>
              <span>配置 revision</span
              ><strong>{{ runDetail.configSnapshot.revision ?? '—' }}</strong>
            </div>
            <div>
              <span>知识库 profile revision</span
              ><strong>{{ runDetail.configSnapshot.knowledgeBaseProfileRevision ?? '—' }}</strong>
            </div>
            <div>
              <span>最大输出 Token</span
              ><strong>{{ runDetail.configSnapshot.aiMaxOutputTokens ?? '—' }}</strong>
            </div>
            <div>
              <span>上下文消息数</span
              ><strong>{{ runDetail.configSnapshot.aiContextMessageLimit ?? '—' }}</strong>
            </div>
            <div>
              <span>向量最低相似度</span
              ><strong>{{ runDetail.configSnapshot.retrievalMinimumSimilarity ?? '—' }}</strong>
            </div>
            <div>
              <span>关键词最低召回分</span
              ><strong>{{ runDetail.configSnapshot.retrievalKeywordMinimumScore ?? '—' }}</strong>
            </div>
            <div>
              <span>最低/强证据分</span
              ><strong
                >{{ runDetail.configSnapshot.rerankMinimumEvidenceScore ?? '—' }} /
                {{ runDetail.configSnapshot.rerankStrongEvidenceScore ?? '—' }}</strong
              >
            </div>
            <div>
              <span>数据集版本</span
              ><strong>{{ runDetail.configSnapshot.externalDatasetVersion ?? '—' }}</strong>
            </div>
            <div>
              <span>文档快照数</span
              ><strong>{{ runDetail.configSnapshot.sourceSnapshotCount ?? '—' }}</strong>
            </div>
          </div>
        </section>
        <div class="case-filter">
          <span>单题结果</span
          ><el-select v-model="caseStatusFilter"
            ><el-option label="全部状态" value="ALL" /><el-option
              label="通过"
              value="PASSED" /><el-option label="失败" value="FAILED" /><el-option
              label="错误"
              value="ERROR" /><el-option label="已取消" value="CANCELLED"
          /></el-select>
        </div>
        <div class="evaluation-case-list">
          <div v-for="item in filteredCases" :key="item.id">
            <div>
              <strong>{{ item.externalId }}</strong
              ><span
                >{{ item.expectedScenario }} ·
                {{ item.expectedOutcome === 'ANSWER' ? '应回答' : '应拒答' }}</span
              >
            </div>
            <el-tag
              size="small"
              :type="
                item.severity === 'CRITICAL'
                  ? 'danger'
                  : item.severity === 'HIGH'
                    ? 'warning'
                    : 'info'
              "
              >{{ severityLabel(item.severity) }}</el-tag
            ><span>{{ score(item.overallScore) }}</span
            ><span>{{ item.durationMs === null ? '—' : `${item.durationMs} ms` }}</span
            ><span class="case-token-usage"
              >Token
              {{
                item.totalTokens === null
                  ? '—'
                  : `${item.totalTokens.toLocaleString('zh-CN')}（入 ${item.inputTokens ?? '—'} / 出 ${item.outputTokens ?? '—'}）`
              }}</span
            ><el-tag size="small" :type="statusType(item.status)" effect="plain">{{
              statusLabel(item.status)
            }}</el-tag>
          </div>
        </div>
      </div>
    </el-drawer>

    <el-drawer
      v-model="candidateDrawerVisible"
      class="evaluation-candidate-drawer"
      size="min(980px, 96vw)"
      title="候选题审核"
    >
      <div class="candidate-toolbar">
        <div>
          <strong>先审核，再冻结为测试评测套件</strong>
          <span>知识内容不会直接成为正式基线；来源变化后，旧候选题会自动失效。</span>
        </div>
        <el-select v-model="candidateStatusFilter" aria-label="候选题状态">
          <el-option label="全部状态" value="ALL" />
          <el-option label="待审核" value="DRAFT" />
          <el-option label="已通过" value="APPROVED" />
          <el-option label="已退回" value="REJECTED" />
          <el-option label="已发布" value="PUBLISHED" />
        </el-select>
        <el-button
          :icon="Refresh"
          :loading="candidatesQuery.isFetching.value"
          @click="candidatesQuery.refetch()"
          >刷新</el-button
        >
        <el-button
          type="primary"
          :disabled="!publishableCandidates.length"
          @click="openPublishDialog"
          >发布所选（{{ publishableCandidates.length }}）</el-button
        >
      </div>

      <el-alert
        v-if="
          latestCandidateGeneration &&
          ['PENDING', 'RUNNING'].includes(latestCandidateGeneration.status)
        "
        title="正在从文档生成候选题"
        :description="`${latestCandidateGeneration.documentCount} 份文档，每份最多 ${latestCandidateGeneration.questionsPerDocument} 题。完成后会自动刷新。`"
        type="info"
        show-icon
        :closable="false"
      />
      <el-alert
        v-else-if="latestCandidateGeneration?.status === 'FAILED'"
        title="最近一次候选题生成失败"
        :description="
          getErrorCodeMessage(
            latestCandidateGeneration.failureCode,
            '候选题生成失败，请检查文档状态和模型配置后重新发起',
          )
        "
        type="error"
        show-icon
        :closable="false"
      />

      <el-empty
        v-if="!evaluationCandidates.length && !candidatesQuery.isLoading.value"
        description="还没有候选题"
      >
        <el-button type="primary" :icon="MagicStick" @click="openGenerationDialog"
          >从知识文档生成</el-button
        >
      </el-empty>
      <el-checkbox-group
        v-else
        v-model="selectedCandidateIds"
        v-loading="candidatesQuery.isLoading.value"
        class="candidate-list"
      >
        <article
          v-for="candidate in evaluationCandidates"
          :key="candidate.id"
          class="candidate-card"
        >
          <el-checkbox
            :value="candidate.id"
            :disabled="candidate.status !== 'APPROVED' || candidate.stale"
            aria-label="选择候选题发布"
          />
          <div class="candidate-card-main">
            <div class="candidate-card-meta">
              <el-tag size="small" :type="candidateStatusType(candidate.status)" effect="plain">
                {{ candidateStatusLabel(candidate.status) }}
              </el-tag>
              <el-tag size="small" effect="plain">
                {{ candidate.expectedOutcome === 'ANSWER' ? '应回答' : '应拒答' }}
              </el-tag>
              <span>{{ candidate.scenario }} · {{ severityLabel(candidate.severity) }}</span>
            </div>
            <strong>{{ candidate.question }}</strong>
            <p v-if="candidate.expectedAnswerPoints.length">
              答案要点：{{ candidate.expectedAnswerPoints.join('；') }}
            </p>
            <small>
              来源：{{
                candidate.sourceDocuments
                  .map((item) => `${item.originalName} v${item.version}`)
                  .join('、')
              }}
            </small>
            <el-alert
              v-if="candidate.stale"
              title="来源内容已经变化，不能通过或发布"
              :description="candidate.staleReasons.join('；')"
              type="warning"
              :closable="false"
              show-icon
            />
          </div>
          <div class="candidate-card-actions">
            <el-button
              link
              :icon="EditPen"
              :disabled="candidate.status === 'PUBLISHED'"
              @click="openCandidateEditor(candidate)"
              >编辑</el-button
            >
            <el-button
              link
              type="success"
              :disabled="candidate.stale || candidate.status === 'PUBLISHED'"
              @click="reviewCandidate(candidate, 'APPROVED')"
              >通过</el-button
            >
            <el-button
              link
              type="danger"
              :disabled="candidate.status === 'PUBLISHED'"
              @click="reviewCandidate(candidate, 'REJECTED')"
              >退回</el-button
            >
          </div>
        </article>
      </el-checkbox-group>
    </el-drawer>

    <el-dialog
      v-model="generationDialogVisible"
      title="从知识文档生成候选题"
      width="min(720px, 94vw)"
    >
      <el-alert
        title="生成结果只进入待审核区，不会自动成为正式内容"
        description="系统会固定文档版本和内容摘要；文档更新后，未发布候选题会标记为失效。"
        type="info"
        show-icon
        :closable="false"
      />
      <el-form label-position="top" class="candidate-generation-form">
        <el-form-item label="选择已发布且处理完成的文档（最多 10 份）">
          <el-checkbox-group
            v-model="selectedGenerationDocumentIds"
            class="candidate-document-options"
          >
            <el-checkbox
              v-for="document in candidateDocuments"
              :key="document.id"
              :value="document.id"
              :disabled="
                !selectedGenerationDocumentIds.includes(document.id) &&
                selectedGenerationDocumentIds.length >= 10
              "
            >
              {{ document.originalName }} · v{{ document.version }}
            </el-checkbox>
          </el-checkbox-group>
          <el-empty v-if="!candidateDocuments.length" description="暂无可用于生成的已发布文档" />
        </el-form-item>
        <div class="candidate-generation-options">
          <el-form-item label="每份文档最多生成">
            <el-input-number v-model="questionsPerDocument" :min="1" :max="8" />
          </el-form-item>
          <el-form-item label="同时提取明确的拒答边界">
            <el-switch v-model="includeBoundaryCases" />
          </el-form-item>
        </div>
      </el-form>
      <template #footer>
        <el-button @click="generationDialogVisible = false">取消</el-button>
        <el-button
          type="primary"
          :icon="MagicStick"
          :disabled="!selectedGenerationDocumentIds.length"
          :loading="createCandidateGenerationMutation.isPending.value"
          @click="createCandidateGeneration"
          >开始生成</el-button
        >
      </template>
    </el-dialog>

    <el-dialog v-model="candidateEditDialogVisible" title="编辑候选题" width="min(720px, 94vw)">
      <el-form v-if="editingCandidate" label-position="top">
        <el-form-item label="问题">
          <el-input
            v-model="editingCandidate.question"
            type="textarea"
            :rows="3"
            maxlength="2000"
            show-word-limit
          />
        </el-form-item>
        <div class="candidate-edit-grid">
          <el-form-item label="业务场景">
            <el-select v-model="editingCandidate.scenario">
              <el-option label="产品文档" value="product_documentation" />
              <el-option label="操作手册" value="operation_manual" />
              <el-option label="内部政策" value="internal_policy" />
              <el-option label="客服辅助" value="customer_service_assist" />
            </el-select>
          </el-form-item>
          <el-form-item label="预期行为">
            <el-select v-model="editingCandidate.expectedOutcome">
              <el-option label="应回答" value="ANSWER" />
              <el-option label="应拒答" value="NO_ANSWER" />
            </el-select>
          </el-form-item>
          <el-form-item label="风险等级">
            <el-select v-model="editingCandidate.severity">
              <el-option label="普通" value="NORMAL" />
              <el-option label="高风险" value="HIGH" />
              <el-option label="关键" value="CRITICAL" />
            </el-select>
          </el-form-item>
        </div>
        <el-form-item
          v-if="editingCandidate.expectedOutcome === 'ANSWER'"
          label="答案要点（每行一条）"
        >
          <el-input v-model="editAnswerPoints" type="textarea" :rows="5" />
        </el-form-item>
        <el-form-item label="关键实体（每行一条）">
          <el-input v-model="editCriticalEntities" type="textarea" :rows="3" />
        </el-form-item>
        <el-form-item label="审核备注">
          <el-input v-model="editingCandidate.reviewNote" maxlength="500" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="candidateEditDialogVisible = false">取消</el-button>
        <el-button
          type="primary"
          :loading="saveCandidateMutation.isPending.value"
          @click="saveCandidate"
          >保存草稿</el-button
        >
      </template>
    </el-dialog>

    <el-dialog v-model="publishDialogVisible" title="发布为冻结评测套件" width="min(620px, 94vw)">
      <el-alert
        :title="`将冻结 ${mergedPublishCaseCount} 道题（新增 ${publishableCandidates.length} 道）`"
        description="选择上一版套件后会保留其全部题目并追加本次候选题；新套件和文档快照发布后不可修改。"
        type="warning"
        show-icon
        :closable="false"
      />
      <el-form label-position="top" class="candidate-publish-form">
        <el-form-item label="继承上一版测试套件">
          <el-select
            v-model="publishBaseSuiteId"
            clearable
            filterable
            placeholder="不选择则只发布本次候选题"
          >
            <el-option
              v-for="suite in suites"
              :key="suite.id"
              :label="`${suite.name} · ${suite.caseCount} 题`"
              :value="suite.id"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="套件名称">
          <el-input v-model="publishName" maxlength="150" />
        </el-form-item>
        <el-form-item label="说明">
          <el-input v-model="publishDescription" type="textarea" :rows="3" maxlength="500" />
        </el-form-item>
        <el-form-item label="发布后立即运行完整评测">
          <el-switch v-model="runAfterPublish" />
          <span class="candidate-publish-hint"
            >会调用当前模型并产生 Token；关闭后可稍后手动启动。</span
          >
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="publishDialogVisible = false">取消</el-button>
        <el-button
          type="primary"
          :disabled="!publishName.trim() || !publishableCandidates.length"
          :loading="
            publishCandidatesMutation.isPending.value || startPublishedSuiteMutation.isPending.value
          "
          @click="publishCandidates"
          >确认冻结并发布</el-button
        >
      </template>
    </el-dialog>

    <el-dialog v-model="importDialogVisible" title="导入版本化评测集" width="min(680px, 94vw)">
      <el-upload
        drag
        accept="application/json,.json"
        :auto-upload="false"
        :limit="1"
        @change="handleImportFile"
        ><el-icon class="el-icon--upload"><DocumentAdd /></el-icon>
        <div class="el-upload__text">拖放 JSON 评测集，或<em>选择文件</em></div>
        <template #tip
          ><span>导入前会校验数据格式、文档名称和内容哈希映射。</span></template
        ></el-upload
      >
      <div v-if="importFileName" class="import-validation">
        <div>
          <el-icon><Files /></el-icon><span>{{ importFileName }}</span>
        </div>
        <el-button :loading="validateImportMutation.isPending.value" @click="validateDataset"
          >校验评测集</el-button
        >
      </div>
      <el-alert
        v-if="validateImportMutation.data.value"
        :title="validateImportMutation.data.value.valid ? '校验通过，可以导入' : '校验未通过'"
        :description="`${validateImportMutation.data.value.caseCount} 个用例，映射 ${validateImportMutation.data.value.mappedDocumentCount} 份文档，${validateImportMutation.data.value.issues.length} 个问题`"
        :type="validateImportMutation.data.value.valid ? 'success' : 'warning'"
        show-icon
        :closable="false"
      />
      <div v-if="validateImportMutation.data.value?.issues.length" class="import-issues">
        <div
          v-for="issue in validateImportMutation.data.value.issues.slice(0, 10)"
          :key="`${issue.code}-${issue.path}`"
        >
          <code>{{ issue.path }}</code
          ><span>{{ issue.message }}</span>
        </div>
      </div>
      <template #footer
        ><el-button @click="importDialogVisible = false">取消</el-button
        ><el-button
          type="primary"
          :icon="UploadFilled"
          :disabled="!validateImportMutation.data.value?.valid"
          :loading="importMutation.isPending.value"
          @click="importDatasetNow"
          >确认导入</el-button
        ></template
      >
    </el-dialog>
  </div>
</template>
