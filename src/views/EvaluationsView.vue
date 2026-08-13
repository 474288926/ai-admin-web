<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query'
import {
  CircleCheck,
  CircleClose,
  DataAnalysis,
  DocumentAdd,
  Files,
  Refresh,
  TrendCharts,
  UploadFilled,
  VideoPlay,
} from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox, type UploadFile } from 'element-plus'
import { useRoute, useRouter } from 'vue-router'

import { ApiError } from '@/services/api/client'
import * as evaluationApi from '@/services/api/evaluations'
import * as knowledgeBaseApi from '@/services/api/knowledge-bases'
import type {
  EvaluationCaseSeverity,
  EvaluationComparison,
  EvaluationRun,
  EvaluationRunCase,
  EvaluationRunStatus,
} from '@/types/evaluation'

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
const caseStatusFilter = ref<'ALL' | EvaluationRunCase['status']>('ALL')

const knowledgeBasesQuery = useQuery({
  queryKey: ['knowledge-bases', 'evaluation-options'],
  queryFn: () => knowledgeBaseApi.listKnowledgeBases(1, 100),
})
const knowledgeBases = computed(() => knowledgeBasesQuery.data.value?.items ?? [])

const suitesQuery = useQuery({
  queryKey: computed(() => ['evaluation-suites', selectedKnowledgeBaseId.value]),
  queryFn: () => evaluationApi.listEvaluationSuites(selectedKnowledgeBaseId.value, 1, 50),
  enabled: computed(() => Boolean(selectedKnowledgeBaseId.value)),
})
const suites = computed(() => suitesQuery.data.value?.items ?? [])
const selectedSuite = computed(() => suites.value.find((item) => item.id === selectedSuiteId.value))

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
  () => runs.value.find((item) => item.id === selectedRunId.value) ?? runs.value[0],
)
const finishedRuns = computed(() =>
  runs.value.filter((item) => ['COMPLETED', 'FAILED', 'CANCELLED'].includes(item.status)),
)
const baselineOptions = computed(() =>
  finishedRuns.value.filter((item) => item.id !== selectedRun.value?.id),
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

const latestCompletedRun = computed(() => runs.value.find((item) => item.status === 'COMPLETED'))
const metricCards = computed(() => {
  const run = latestCompletedRun.value
  return [
    {
      label: '综合得分',
      key: 'averageOverallScore',
      threshold: selectedSuite.value?.minimumOverallScore,
    },
    { label: '正确性', key: 'averageCorrectnessScore' },
    { label: '完整性', key: 'averageCompletenessScore' },
    { label: '证据忠实度', key: 'averageFaithfulnessScore' },
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
  const query = { ...route.query }
  if (value) query.knowledgeBaseId = value
  else delete query.knowledgeBaseId
  void router.replace({ query })
})
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
      selectedRunId.value = items[0]?.id ?? ''
    if (!baselineOptions.value.some((item) => item.id === baselineRunId.value)) {
      baselineRunId.value = baselineOptions.value[0]?.id ?? ''
    }
  },
  { immediate: true },
)

function getErrorMessage(error: unknown): string {
  return error instanceof ApiError ? error.message : '操作失败，请稍后重试'
}

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
    }[key] ?? key
  )
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
        ><small v-else>最近一次完成运行</small>
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
            v-if="latestCompletedRun"
            :type="latestCompletedRun.gatePassed ? 'success' : 'danger'"
            effect="light"
            >最近门禁{{ latestCompletedRun.gatePassed ? '通过' : '未通过' }}</el-tag
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
              <strong>{{ formatDate(run.createdAt) }} 运行</strong
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
          <span>候选：{{ formatDate(selectedRun.createdAt) }}</span
          ><el-select v-model="baselineRunId" placeholder="选择基线运行"
            ><el-option
              v-for="run in baselineOptions"
              :key="run.id"
              :label="`${formatDate(run.createdAt)} · ${statusLabel(run.status)}`"
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
              ><strong>{{ score(item.candidate) }}</strong
              ><b :class="{ positive: (item.delta ?? 0) > 0, negative: (item.delta ?? 0) < 0 }">{{
                item.delta === null
                  ? '—'
                  : `${item.delta >= 0 ? '+' : ''}${(item.delta * 100).toFixed(1)}%`
              }}</b>
            </div>
          </div>
          <p v-if="comparison.changedConfigKeys.length">
            配置变化：{{ comparison.changedConfigKeys.join('、') }}
          </p>
          <p v-else>两次运行配置一致，适合直接比较。</p>
        </div>
      </article>
    </section>

    <el-drawer v-model="detailDrawerVisible" title="评测运行详情" size="min(920px, 94vw)">
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
            ><el-tag size="small" :type="statusType(item.status)" effect="plain">{{
              statusLabel(item.status)
            }}</el-tag>
          </div>
        </div>
      </div>
    </el-drawer>

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
