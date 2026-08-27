<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query'
import {
  ChatDotRound,
  CircleCheck,
  Collection,
  EditPen,
  DataAnalysis,
  DocumentChecked,
  MagicStick,
  Refresh,
  Search,
  TrendCharts,
  Warning,
} from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useRoute, useRouter } from 'vue-router'

import { ApiError } from '@/services/api/client'
import * as knowledgeBaseApi from '@/services/api/knowledge-bases'
import * as documentsApi from '@/services/api/documents'
import * as evaluationApi from '@/services/api/evaluations'
import {
  batchUpdateKnowledgeBacklogDueAt,
  createKnowledgeBacklog,
  getKnowledgeBacklogHistory,
  getKnowledgeBacklogOverview,
  getQualitySummary,
  listKnowledgeBacklog,
  previewKnowledgeBacklog,
  updateKnowledgeBacklog,
  type KnowledgeBacklogCandidate,
  type KnowledgeBacklogHistoryItem,
  type KnowledgeBacklogItem,
} from '@/services/api/quality'
import type { FeedbackReason, QualityEventType } from '@/types/quality'
import {
  knowledgeBacklogCandidateGenerationRoute,
  readKnowledgeBacklogWorkflow,
  requestedVerificationSuiteId,
} from '@/utils/knowledge-backlog-workflow'

type RangeValue = '7' | '30' | '90' | 'ALL'
type BacklogStatus = 'ALL' | 'ACTIVE' | 'OPEN' | 'TRIAGED' | 'RESOLVED' | 'DISMISSED'
type BacklogPriority = 'ALL' | KnowledgeBacklogItem['priority']
type BacklogStage = 'ALL' | 'AWAITING_DOCUMENT' | 'AWAITING_VERIFICATION' | 'READY_TO_CLOSE'
type BacklogDeadline = 'ALL' | 'OVERDUE' | 'DUE_SOON' | 'NO_DUE_DATE'
type BacklogSort = 'PRIORITY' | 'RECENT'
const backlogStatuses: BacklogStatus[] = [
  'ACTIVE',
  'ALL',
  'OPEN',
  'TRIAGED',
  'RESOLVED',
  'DISMISSED',
]
const backlogPriorities: BacklogPriority[] = ['ALL', 'CRITICAL', 'HIGH', 'MEDIUM', 'LOW']
const backlogStages: BacklogStage[] = [
  'ALL',
  'AWAITING_DOCUMENT',
  'AWAITING_VERIFICATION',
  'READY_TO_CLOSE',
]
const backlogDeadlines: BacklogDeadline[] = ['ALL', 'OVERDUE', 'DUE_SOON', 'NO_DUE_DATE']

const route = useRoute()
const router = useRouter()
const queryClient = useQueryClient()
const selectedKnowledgeBaseId = ref(String(route.query.knowledgeBaseId ?? ''))
const rangeValue = ref<RangeValue>('30')
const backlogStatus = ref<BacklogStatus>(
  typeof route.query.backlogStatus === 'string' &&
    backlogStatuses.includes(route.query.backlogStatus as BacklogStatus)
    ? (route.query.backlogStatus as BacklogStatus)
    : 'ACTIVE',
)
const backlogPriority = ref<BacklogPriority>('ALL')
const backlogStage = ref<BacklogStage>('ALL')
const backlogDeadline = ref<BacklogDeadline>('ALL')
const backlogSort = ref<BacklogSort>('PRIORITY')
const backlogSearchInput = ref('')
const backlogSearch = ref('')
const backlogPage = ref(1)
const backlogPageSize = 50

const knowledgeBasesQuery = useQuery({
  queryKey: ['knowledge-bases', 'quality-options'],
  queryFn: () => knowledgeBaseApi.listKnowledgeBases(1, 100),
})

const knowledgeBases = computed(() => knowledgeBasesQuery.data.value?.items ?? [])
const selectedKnowledgeBase = computed(() =>
  knowledgeBases.value.find((item) => item.id === selectedKnowledgeBaseId.value),
)
const dateQuery = computed(() => {
  if (rangeValue.value === 'ALL') return { topIssueLimit: 20 }
  const from = new Date()
  from.setDate(from.getDate() - Number(rangeValue.value))
  return { from: from.toISOString(), to: new Date().toISOString(), topIssueLimit: 20 }
})
const backlogWindow = computed(() => ({ from: dateQuery.value.from, to: dateQuery.value.to }))

const qualityQuery = useQuery({
  queryKey: computed(() => ['quality-summary', selectedKnowledgeBaseId.value, rangeValue.value]),
  queryFn: () => getQualitySummary(selectedKnowledgeBaseId.value, dateQuery.value),
  enabled: computed(() => Boolean(selectedKnowledgeBaseId.value)),
})

const summary = computed(() => qualityQuery.data.value)
const backlogOverviewQuery = useQuery({
  queryKey: computed(() => ['knowledge-backlog', selectedKnowledgeBaseId.value, 'overview']),
  queryFn: () => getKnowledgeBacklogOverview(selectedKnowledgeBaseId.value),
  enabled: computed(() => Boolean(selectedKnowledgeBaseId.value)),
})
const backlogOverview = computed(() => backlogOverviewQuery.data.value)
const backlogQuery = useQuery({
  queryKey: computed(() => [
    'knowledge-backlog',
    selectedKnowledgeBaseId.value,
    backlogStatus.value,
    backlogPriority.value,
    backlogStage.value,
    backlogDeadline.value,
    backlogSort.value,
    backlogSearch.value,
    backlogPage.value,
  ]),
  queryFn: () =>
    listKnowledgeBacklog(selectedKnowledgeBaseId.value, {
      ...(backlogSearch.value ? { search: backlogSearch.value } : {}),
      ...(backlogStatus.value === 'ALL' ? {} : { status: backlogStatus.value }),
      ...(backlogPriority.value === 'ALL' ? {} : { priority: backlogPriority.value }),
      ...(backlogStage.value === 'ALL' ? {} : { stage: backlogStage.value }),
      ...(backlogDeadline.value === 'ALL' ? {} : { deadline: backlogDeadline.value }),
      sort: backlogSort.value,
      page: backlogPage.value,
      pageSize: backlogPageSize,
    }),
  enabled: computed(() => Boolean(selectedKnowledgeBaseId.value)),
  refetchInterval: (query) =>
    query.state.data?.items.some((item) =>
      ['PENDING', 'RUNNING'].includes(item.verificationRun?.status ?? ''),
    )
      ? 3_000
      : false,
})
const backlogItems = computed(() => backlogQuery.data.value?.items ?? [])
const backlogMeta = computed(() => backlogQuery.data.value?.meta)
const documentsQuery = useQuery({
  queryKey: computed(() => ['documents', 'quality-link-options', selectedKnowledgeBaseId.value]),
  queryFn: () => documentsApi.listDocuments(selectedKnowledgeBaseId.value, 1, 100),
  enabled: computed(() => Boolean(selectedKnowledgeBaseId.value)),
})
const documents = computed(() => documentsQuery.data.value?.items ?? [])
const evaluationSuitesQuery = useQuery({
  queryKey: computed(() => [
    'evaluation-suites',
    'quality-verification',
    selectedKnowledgeBaseId.value,
  ]),
  queryFn: () => evaluationApi.listEvaluationSuites(selectedKnowledgeBaseId.value, 1, 50),
  enabled: computed(() => Boolean(selectedKnowledgeBaseId.value)),
})
const evaluationSuites = computed(() => evaluationSuitesQuery.data.value?.items ?? [])
const verificationSuiteByItem = ref<Record<string, string>>({})
const previewVisible = ref(false)
const previewCandidates = ref<KnowledgeBacklogCandidate[]>([])
const selectedFingerprints = ref<string[]>([])
const previewScannedCount = ref(0)
const backlogEditorVisible = ref(false)
const editingBacklogItem = ref<KnowledgeBacklogItem | null>(null)
const backlogTitleDraft = ref('')
const backlogNoteDraft = ref('')
const backlogDueAtDraft = ref<Date | null>(null)
const selectedBacklogItemIds = ref<string[]>([])
const batchDueAtVisible = ref(false)
const batchDueAtDraft = ref<Date | null>(null)
const selectableBacklogItems = computed(() =>
  backlogItems.value.filter((item) => ['OPEN', 'TRIAGED'].includes(item.status)),
)
const allVisibleBacklogSelected = computed(
  () =>
    selectableBacklogItems.value.length > 0 &&
    selectableBacklogItems.value.every((item) => selectedBacklogItemIds.value.includes(item.id)),
)
const visibleBacklogSelectionIndeterminate = computed(() => {
  const selectedCount = selectableBacklogItems.value.filter((item) =>
    selectedBacklogItemIds.value.includes(item.id),
  ).length
  return selectedCount > 0 && selectedCount < selectableBacklogItems.value.length
})
const backlogHistoryQuery = useQuery({
  queryKey: computed(() => [
    'knowledge-backlog',
    selectedKnowledgeBaseId.value,
    editingBacklogItem.value?.id ?? '',
    'history',
  ]),
  queryFn: () =>
    getKnowledgeBacklogHistory(selectedKnowledgeBaseId.value, editingBacklogItem.value?.id ?? ''),
  enabled: computed(() => Boolean(selectedKnowledgeBaseId.value && editingBacklogItem.value?.id)),
})
const backlogHistory = computed(() => backlogHistoryQuery.data.value ?? [])
const backlogEditorDirty = computed(() => {
  const item = editingBacklogItem.value
  return Boolean(
    item &&
    (backlogTitleDraft.value.trim() !== (item.title ?? '') ||
      backlogNoteDraft.value.trim() !== (item.note ?? '') ||
      (backlogDueAtDraft.value?.getTime() ?? null) !==
        (item.dueAt === null ? null : new Date(item.dueAt).getTime())),
  )
})

const previewMutation = useMutation({
  mutationFn: () =>
    previewKnowledgeBacklog(selectedKnowledgeBaseId.value, {
      ...backlogWindow.value,
      minimumNoAnswerCount: 2,
      minimumUnhelpfulCount: 2,
      limit: 50,
    }),
  onSuccess: (result) => {
    previewCandidates.value = result.candidates
    selectedFingerprints.value = result.candidates.map((item) => item.fingerprint)
    previewScannedCount.value = result.scannedFingerprintCount
    previewVisible.value = true
  },
  onError: (error) => ElMessage.error(getErrorMessage(error)),
})

const createBacklogMutation = useMutation({
  mutationFn: () =>
    createKnowledgeBacklog(selectedKnowledgeBaseId.value, {
      fingerprints: selectedFingerprints.value,
      ...backlogWindow.value,
      minimumNoAnswerCount: 2,
      minimumUnhelpfulCount: 2,
      limit: 50,
    }),
  onSuccess: (result) => {
    previewVisible.value = false
    void queryClient.invalidateQueries({
      queryKey: ['knowledge-backlog', selectedKnowledgeBaseId.value],
    })
    const reopened = result.reopenedCount ? `，其中 ${result.reopenedCount} 条复发待办已重开` : ''
    ElMessage.success(`已纳入 ${result.createdOrUpdatedCount} 条知识补充待办${reopened}`)
  },
  onError: (error) => ElMessage.error(getErrorMessage(error)),
})

const updateBacklogMutation = useMutation({
  mutationFn: ({
    item,
    status,
    linkedDocumentId,
    title,
    note,
    dueAt,
  }: {
    item: KnowledgeBacklogItem
    status?: KnowledgeBacklogItem['status']
    linkedDocumentId?: string | null
    title?: string
    note?: string
    dueAt?: string | null
  }) =>
    updateKnowledgeBacklog(selectedKnowledgeBaseId.value, item.id, {
      revision: item.revision,
      ...(status === undefined ? {} : { status }),
      ...(linkedDocumentId === undefined ? {} : { linkedDocumentId }),
      ...(title === undefined ? {} : { title }),
      ...(note === undefined ? {} : { note }),
      ...(dueAt === undefined ? {} : { dueAt }),
    }),
  onSuccess: (updated) => {
    if (editingBacklogItem.value?.id === updated.id) editingBacklogItem.value = updated
    void queryClient.invalidateQueries({
      queryKey: ['knowledge-backlog', selectedKnowledgeBaseId.value],
    })
    ElMessage.success('知识补充待办已更新')
  },
  onError: async (error) => {
    ElMessage.error(getErrorMessage(error))
    const refreshed = await backlogQuery.refetch()
    const itemId = editingBacklogItem.value?.id
    const current = itemId ? refreshed.data?.items.find((item) => item.id === itemId) : undefined
    if (current) editingBacklogItem.value = current
  },
})
const batchUpdateBacklogDueAtMutation = useMutation({
  mutationFn: (dueAt: string | null) => {
    const selected = backlogItems.value.filter((item) =>
      selectedBacklogItemIds.value.includes(item.id),
    )
    return batchUpdateKnowledgeBacklogDueAt(selectedKnowledgeBaseId.value, {
      items: selected.map((item) => ({ id: item.id, revision: item.revision })),
      dueAt,
    })
  },
  onSuccess: (result) => {
    batchDueAtVisible.value = false
    selectedBacklogItemIds.value = []
    void queryClient.invalidateQueries({
      queryKey: ['knowledge-backlog', selectedKnowledgeBaseId.value],
    })
    ElMessage.success(
      result.updatedCount > 0
        ? `已更新 ${result.updatedCount} 条待办的处理期限`
        : '所选待办的处理期限无需变更',
    )
  },
  onError: (error) => {
    ElMessage.error(getErrorMessage(error))
    void backlogQuery.refetch()
  },
})
const startVerificationMutation = useMutation({
  mutationFn: ({ item, suiteId }: { item: KnowledgeBacklogItem; suiteId: string }) =>
    evaluationApi.startKnowledgeBacklogVerificationRun(
      selectedKnowledgeBaseId.value,
      suiteId,
      item.id,
      item.revision,
    ),
  onSuccess: (run) => {
    void queryClient.invalidateQueries({
      queryKey: ['knowledge-backlog', selectedKnowledgeBaseId.value],
    })
    void queryClient.invalidateQueries({ queryKey: ['evaluation-runs'] })
    ElMessage.success(`验证运行已启动，共 ${run.totalCases} 个用例`)
  },
  onError: (error) => {
    ElMessage.error(getErrorMessage(error))
    void backlogQuery.refetch()
  },
})
const totalQualityEvents = computed(() =>
  (summary.value?.qualityEventCounts ?? []).reduce((total, item) => total + item.count, 0),
)
const noAnswerCount = computed(() => eventCount('NO_ANSWER'))
const citationComplaintCount = computed(() => reasonCount('INACCURATE_CITATION'))
const citationComplaintRate = computed(() => {
  const total = summary.value?.feedbackTotal ?? 0
  return total ? citationComplaintCount.value / total : null
})
const maxReasonCount = computed(() =>
  Math.max(1, ...(summary.value?.reasonCounts ?? []).map((item) => item.count)),
)
const maxEventCount = computed(() =>
  Math.max(1, ...(summary.value?.qualityEventCounts ?? []).map((item) => item.count)),
)
const reasonRows = computed(() =>
  [...(summary.value?.reasonCounts ?? [])].sort((left, right) => right.count - left.count),
)
const eventRows = computed(() =>
  [...(summary.value?.qualityEventCounts ?? [])].sort((left, right) => right.count - left.count),
)

watch(
  knowledgeBases,
  (items) => {
    if (!selectedKnowledgeBaseId.value && items[0]) selectedKnowledgeBaseId.value = items[0].id
  },
  { immediate: true },
)

watch(selectedKnowledgeBaseId, (value) => {
  const query = { ...route.query }
  if (value) query.knowledgeBaseId = value
  else delete query.knowledgeBaseId
  void router.replace({ query })
})

watch(
  [
    selectedKnowledgeBaseId,
    backlogStatus,
    backlogPriority,
    backlogStage,
    backlogDeadline,
    backlogSort,
    backlogSearch,
  ],
  () => {
    backlogPage.value = 1
  },
)

watch(
  backlogItems,
  (items) => {
    const visibleIds = new Set(items.map((item) => item.id))
    selectedBacklogItemIds.value = selectedBacklogItemIds.value.filter((id) => visibleIds.has(id))
  },
  { immediate: true },
)

watch(backlogMeta, (meta) => {
  if (!meta) return
  const lastPage = Math.max(1, meta.totalPages)
  if (backlogPage.value > lastPage) backlogPage.value = lastPage
})

watch(
  () => route.query,
  (query) => {
    const context = readKnowledgeBacklogWorkflow(query)
    const suiteId = requestedVerificationSuiteId(query)
    if (context && suiteId && context.knowledgeBaseId === selectedKnowledgeBaseId.value) {
      verificationSuiteByItem.value[context.backlogItemId] = suiteId
    }
  },
  { immediate: true },
)

function getErrorMessage(error: unknown): string {
  return error instanceof ApiError ? error.message : '质量数据加载失败，请稍后重试'
}

function reasonCount(reason: FeedbackReason): number {
  return summary.value?.reasonCounts.find((item) => item.reason === reason)?.count ?? 0
}

function eventCount(type: QualityEventType): number {
  return summary.value?.qualityEventCounts.find((item) => item.type === type)?.count ?? 0
}

function percent(value: number | null | undefined): string {
  return value === null || value === undefined ? '—' : `${(value * 100).toFixed(1)}%`
}

const feedbackReasonLabels: Record<FeedbackReason, string> = {
  INCORRECT: '答案错误',
  INCOMPLETE: '回答不完整',
  INACCURATE_CITATION: '引用不准确',
  SHOULD_HAVE_ANSWERED: '本应回答',
  SHOULD_HAVE_REFUSED: '本应拒答',
  NOT_ACTIONABLE: '缺少可操作性',
  EXPRESSION: '表达问题',
  OTHER: '其他原因',
}

function reasonLabel(value: FeedbackReason): string {
  return feedbackReasonLabels[value]
}

function backlogReasonLabel(value: string): string {
  return feedbackReasonLabels[value as FeedbackReason] ?? value
}

function reasonDescription(value: FeedbackReason): string {
  return {
    INCORRECT: '结论或关键事实有误',
    INCOMPLETE: '遗漏了必要步骤或条件',
    INACCURATE_CITATION: '引用来源不支持回答',
    SHOULD_HAVE_ANSWERED: '存在知识但系统拒绝回答',
    SHOULD_HAVE_REFUSED: '证据不足时仍然作答',
    NOT_ACTIONABLE: '没有给出可执行步骤',
    EXPRESSION: '语言、结构或可读性不佳',
    OTHER: '用户选择的其他质量问题',
  }[value]
}

function eventLabel(value: QualityEventType): string {
  return { NO_ANSWER: '无答案拒答', CONFLICT_REFUSAL: '冲突拒答', GENERATION_FAILURE: '生成失败' }[
    value
  ]
}

function eventDescription(value: QualityEventType): string {
  return {
    NO_ANSWER: '有效知识不足，系统按安全边界拒答',
    CONFLICT_REFUSAL: '来源内容存在冲突或无法判定',
    GENERATION_FAILURE: '模型或生成链路未能完成回答',
  }[value]
}

function issueFingerprint(value: string): string {
  return `${value.slice(0, 12)}…${value.slice(-8)}`
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}

function openBacklogPreview(): void {
  if (!selectedKnowledgeBaseId.value) {
    ElMessage.warning('请先选择知识库')
    return
  }
  previewMutation.mutate()
}

function updateBacklogStatus(
  item: KnowledgeBacklogItem,
  status: KnowledgeBacklogItem['status'],
): void {
  if (status !== item.status) updateBacklogMutation.mutate({ item, status })
}

function updateBacklogDocument(item: KnowledgeBacklogItem, documentId: string | null): void {
  if (documentId !== item.linkedDocumentId)
    updateBacklogMutation.mutate({ item, linkedDocumentId: documentId })
}

function openBacklogEditor(item: KnowledgeBacklogItem): void {
  editingBacklogItem.value = item
  backlogTitleDraft.value = item.title ?? ''
  backlogNoteDraft.value = item.note ?? ''
  backlogDueAtDraft.value = item.dueAt === null ? null : new Date(item.dueAt)
  backlogEditorVisible.value = true
}

async function saveBacklogDetails(): Promise<void> {
  const item = editingBacklogItem.value
  if (!item || !backlogEditorDirty.value) return
  try {
    await updateBacklogMutation.mutateAsync({
      item,
      title: backlogTitleDraft.value,
      note: backlogNoteDraft.value,
      dueAt: backlogDueAtDraft.value?.toISOString() ?? null,
    })
    backlogEditorVisible.value = false
  } catch {
    // Mutation 已展示错误并刷新 revision，保留编辑内容供管理员核对。
  }
}

function backlogReasonRows(item: KnowledgeBacklogItem): Array<{ reason: string; count: number }> {
  return Object.entries(item.feedbackReasonCounts)
    .map(([reason, count]) => ({ reason, count }))
    .sort((left, right) => right.count - left.count || left.reason.localeCompare(right.reason))
}

function fullDate(value: string): string {
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}

function resolutionReasonLabel(
  reason: KnowledgeBacklogItem['resolutionBlockedReasons'][number],
): string {
  return {
    DOCUMENT_NOT_LINKED: '未关联文档',
    DOCUMENT_DELETED: '文档已删除',
    DOCUMENT_NOT_READY: '文档未处理完成',
    EMBEDDING_NOT_READY: '向量尚未就绪',
    DOCUMENT_NOT_PUBLISHED: '文档未发布',
    DOCUMENT_NOT_EFFECTIVE: '文档尚未生效',
    DOCUMENT_EXPIRED: '文档已过期',
    DOCUMENT_HAS_NO_CHUNKS: '文档没有有效切片',
    VERIFICATION_RUN_NOT_LINKED: '尚未启动验证',
    VERIFICATION_RUN_NOT_FULL: '不是完整评测运行',
    VERIFICATION_RUN_DOES_NOT_COVER_DOCUMENT: '评测未覆盖关联文档',
    VERIFICATION_RUN_TOO_OLD: '评测早于最近问题',
    VERIFICATION_RUN_NOT_COMPLETED: '验证运行尚未完成',
    VERIFICATION_GATE_NOT_PASSED: '验证门禁未通过',
  }[reason]
}

function documentReadinessLabel(item: KnowledgeBacklogItem): string {
  if (item.documentReady) return '文档就绪'
  const firstReason = item.documentBlockedReasons[0]
  return firstReason ? resolutionReasonLabel(firstReason) : '文档未就绪'
}

function documentReadinessDetails(item: KnowledgeBacklogItem): string {
  return item.documentBlockedReasons.map(resolutionReasonLabel).join('、')
}

function verificationReadinessDetails(item: KnowledgeBacklogItem): string {
  return item.verificationBlockedReasons.map(resolutionReasonLabel).join('、')
}

function eligibleVerificationSuites(item: KnowledgeBacklogItem) {
  if (!item.linkedDocumentId) return []
  return evaluationSuites.value.filter((suite) =>
    suite.sourceSnapshot.some((source) => source.documentId === item.linkedDocumentId),
  )
}

function selectedVerificationSuiteId(item: KnowledgeBacklogItem): string {
  return verificationSuiteByItem.value[item.id] ?? eligibleVerificationSuites(item)[0]?.id ?? ''
}

function verificationStatusLabel(item: KnowledgeBacklogItem): string {
  const run = item.verificationRun
  if (!run) return '尚未验证'
  if (run.status === 'PENDING') return '等待验证'
  if (run.status === 'RUNNING') return '验证中'
  if (run.status === 'FAILED') return '验证失败'
  if (run.status === 'CANCELLED') return '验证已取消'
  return run.gatePassed ? '门禁通过' : '门禁未通过'
}

async function startBacklogVerification(item: KnowledgeBacklogItem): Promise<void> {
  const suiteId = selectedVerificationSuiteId(item)
  const suite = evaluationSuites.value.find((candidate) => candidate.id === suiteId)
  if (!suite) {
    ElMessage.warning('没有覆盖关联文档的评测套件，请先在评测中心补充用例')
    return
  }
  try {
    await ElMessageBox.confirm(
      `将使用正式问答链路执行“${suite.name}”的 ${suite.caseCount} 个用例，可能产生模型调用费用。`,
      '确认启动缺口验证',
      { type: 'warning', confirmButtonText: '启动验证', cancelButtonText: '取消' },
    )
    startVerificationMutation.mutate({ item, suiteId })
  } catch {
    // 用户取消时保持待办不变。
  }
}

function openBacklogCandidateGeneration(item: KnowledgeBacklogItem): void {
  if (!item.linkedDocumentId || !item.documentReady) {
    ElMessage.warning('请先关联一份已发布且检索就绪的文档')
    return
  }
  void router.push(
    knowledgeBacklogCandidateGenerationRoute({
      knowledgeBaseId: selectedKnowledgeBaseId.value,
      backlogItemId: item.id,
      documentId: item.linkedDocumentId,
    }),
  )
}

function refreshQualityData(): void {
  void qualityQuery.refetch()
  void backlogOverviewQuery.refetch()
  void backlogQuery.refetch()
  void evaluationSuitesQuery.refetch()
}

function applyBacklogSearch(): void {
  backlogSearch.value = backlogSearchInput.value.trim()
}

function toggleVisibleBacklogSelection(selected: unknown): void {
  const visibleIds = selectableBacklogItems.value.map((item) => item.id)
  if (selected) {
    selectedBacklogItemIds.value = Array.from(
      new Set([...selectedBacklogItemIds.value, ...visibleIds]),
    )
    return
  }
  const visibleIdSet = new Set(visibleIds)
  selectedBacklogItemIds.value = selectedBacklogItemIds.value.filter((id) => !visibleIdSet.has(id))
}

function toggleBacklogItemSelection(itemId: string, selected: unknown): void {
  if (selected) {
    selectedBacklogItemIds.value = Array.from(new Set([...selectedBacklogItemIds.value, itemId]))
    return
  }
  selectedBacklogItemIds.value = selectedBacklogItemIds.value.filter((id) => id !== itemId)
}

function openBatchDueAt(): void {
  if (selectedBacklogItemIds.value.length === 0) return
  batchDueAtDraft.value = null
  batchDueAtVisible.value = true
}

function submitBatchDueAt(clear = false): void {
  if (selectedBacklogItemIds.value.length === 0) return
  const dueAt = clear ? null : batchDueAtDraft.value?.toISOString()
  if (!clear && dueAt === undefined) {
    ElMessage.warning('请先选择处理期限')
    return
  }
  batchUpdateBacklogDueAtMutation.mutate(dueAt ?? null)
}

function backlogStatusLabel(value: BacklogStatus): string {
  return {
    ALL: '全部状态',
    ACTIVE: '全部活跃',
    OPEN: '待处理',
    TRIAGED: '已分诊',
    RESOLVED: '已解决',
    DISMISSED: '已忽略',
  }[value]
}

function backlogStageLabel(value: BacklogStage): string {
  return {
    ALL: '全部阶段',
    AWAITING_DOCUMENT: '待补文档',
    AWAITING_VERIFICATION: '待验证',
    READY_TO_CLOSE: '可关闭',
  }[value]
}

function backlogDeadlineLabel(value: BacklogDeadline): string {
  return {
    ALL: '全部期限',
    OVERDUE: '已逾期',
    DUE_SOON: '72小时内到期',
    NO_DUE_DATE: '未设置期限',
  }[value]
}

function focusBacklog(
  stage: BacklogStage = 'ALL',
  priority: BacklogPriority = 'ALL',
  deadline: BacklogDeadline = 'ALL',
): void {
  backlogStatus.value = 'ACTIVE'
  backlogStage.value = stage
  backlogPriority.value = priority
  backlogDeadline.value = deadline
  backlogSort.value = 'PRIORITY'
}

function backlogPriorityLabel(value: BacklogPriority): string {
  return {
    ALL: '全部优先级',
    CRITICAL: '紧急',
    HIGH: '高',
    MEDIUM: '中',
    LOW: '低',
  }[value]
}

function backlogPriorityTagType(
  value: KnowledgeBacklogItem['priority'],
): 'danger' | 'warning' | 'primary' | 'info' {
  const tagTypes = {
    CRITICAL: 'danger',
    HIGH: 'warning',
    MEDIUM: 'primary',
    LOW: 'info',
  } as const
  return tagTypes[value]
}

function backlogActionLabel(value: KnowledgeBacklogItem['recommendedAction']): string {
  return {
    ADD_KNOWLEDGE: '补充知识文档',
    CORRECT_KNOWLEDGE: '核对并修正文档',
    RUN_VERIFICATION: '启动完整验证',
    FIX_AND_REVERIFY: '修复后重新验证',
    CLOSE_BACKLOG: '确认并关闭待办',
    MONITOR: '持续观察复发',
  }[value]
}

function backlogDeadlineTagType(item: KnowledgeBacklogItem): 'danger' | 'warning' | 'info' {
  if (item.overdue) return 'danger'
  if (item.dueSoon) return 'warning'
  return 'info'
}

function backlogItemDeadlineLabel(item: KnowledgeBacklogItem): string {
  if (item.dueAt === null) return '未设置'
  if (item.overdue) return '已逾期'
  if (item.dueSoon) return '即将到期'
  return '计划中'
}

function backlogHistoryActionLabel(value: KnowledgeBacklogHistoryItem['action']): string {
  return {
    'knowledge_backlog.created': '创建待办',
    'knowledge_backlog.refreshed': '刷新证据',
    'knowledge_backlog.reopened': '问题复发并重开',
    'knowledge_backlog.updated': '更新待办',
    'knowledge_backlog.verification_started': '启动完整验证',
  }[value]
}

function backlogHistorySummary(item: KnowledgeBacklogHistoryItem): string {
  const changes = item.changes
  if (item.action === 'knowledge_backlog.created') {
    return `初始聚合：无答案 ${changes.noAnswerCount ?? 0} 次，负反馈 ${changes.unhelpfulCount ?? 0} 次`
  }
  if (item.action === 'knowledge_backlog.refreshed') {
    return `证据已刷新：无答案 ${changes.noAnswerCount ?? 0} 次，负反馈 ${changes.unhelpfulCount ?? 0} 次`
  }
  if (item.action === 'knowledge_backlog.reopened') {
    return '已解决待办出现更新的质量事件，自动恢复为待处理'
  }
  if (item.action === 'knowledge_backlog.verification_started') {
    return `已关联验证运行 ${shortAuditId(changes.verificationRunIdTo)}，待运行完成后检查门禁`
  }
  const updates: string[] = []
  if (typeof changes.statusTo === 'string') {
    updates.push(`状态改为${backlogStatusLabel(changes.statusTo as BacklogStatus)}`)
  }
  if ('linkedDocumentIdTo' in changes) {
    updates.push(changes.linkedDocumentIdTo ? '变更关联文档' : '解除关联文档')
  }
  if ('verificationRunIdTo' in changes) {
    updates.push(changes.verificationRunIdTo ? '变更验证运行' : '清除验证运行')
  }
  if (changes.titleChanged === true) updates.push('修改标题')
  if (changes.noteChanged === true) updates.push('修改处置备注')
  if ('dueAtTo' in changes) updates.push(changes.dueAtTo ? '设置处理期限' : '清除处理期限')
  return updates.join('、') || '待办版本已更新'
}

function shortAuditId(value: string | number | boolean | null | undefined): string {
  return typeof value === 'string' ? `${value.slice(0, 8)}…` : '—'
}
</script>

<template>
  <div class="quality-page">
    <section class="quality-hero">
      <div>
        <span class="eyebrow">QUALITY INSIGHTS</span>
        <h2>质量分析</h2>
        <p>
          汇总真实用户反馈和系统质量事件，定位知识缺口、拒答问题与引用投诉，持续改进客服知识效果。
        </p>
      </div>
      <div class="quality-filters">
        <div>
          <span>知识库</span>
          <el-select
            v-model="selectedKnowledgeBaseId"
            filterable
            :loading="knowledgeBasesQuery.isLoading.value"
            placeholder="请选择知识库"
          >
            <el-option
              v-for="item in knowledgeBases"
              :key="item.id"
              :label="item.name"
              :value="item.id"
            />
          </el-select>
        </div>
        <div>
          <span>统计周期</span>
          <el-select v-model="rangeValue">
            <el-option label="最近 7 天" value="7" />
            <el-option label="最近 30 天" value="30" />
            <el-option label="最近 90 天" value="90" />
            <el-option label="全部时间" value="ALL" />
          </el-select>
        </div>
        <el-button
          :icon="Search"
          :loading="previewMutation.isPending.value"
          :disabled="!selectedKnowledgeBaseId"
          @click="openBacklogPreview"
        >
          扫描知识缺口
        </el-button>
        <el-button
          :icon="Refresh"
          circle
          aria-label="刷新质量数据"
          :loading="qualityQuery.isFetching.value"
          @click="refreshQualityData"
        />
      </div>
    </section>

    <el-alert
      v-if="qualityQuery.isError.value"
      title="质量数据加载失败"
      :description="getErrorMessage(qualityQuery.error.value)"
      type="error"
      show-icon
      :closable="false"
    >
      <template #default
        ><el-button size="small" @click="qualityQuery.refetch()">重新加载</el-button></template
      >
    </el-alert>

    <section v-loading="qualityQuery.isLoading.value" class="quality-metrics">
      <article class="quality-metric-card quality-metric-primary">
        <span class="quality-metric-icon"
          ><el-icon><CircleCheck /></el-icon
        ></span>
        <div>
          <span>用户满意率</span><strong>{{ percent(summary?.helpfulRate) }}</strong
          ><small
            >{{ summary?.helpfulCount ?? 0 }} 次点赞 /
            {{ summary?.feedbackTotal ?? 0 }} 条反馈</small
          >
        </div>
      </article>
      <article>
        <span class="quality-metric-icon"
          ><el-icon><ChatDotRound /></el-icon
        ></span>
        <div>
          <span>负反馈</span><strong>{{ summary?.unhelpfulCount ?? 0 }}</strong
          ><small>需要进入质量改进队列</small>
        </div>
      </article>
      <article>
        <span class="quality-metric-icon"
          ><el-icon><Warning /></el-icon
        ></span>
        <div>
          <span>无答案事件</span><strong>{{ noAnswerCount }}</strong
          ><small>优先识别知识覆盖缺口</small>
        </div>
      </article>
      <article>
        <span class="quality-metric-icon"
          ><el-icon><DocumentChecked /></el-icon
        ></span>
        <div>
          <span>引用不准确投诉</span><strong>{{ citationComplaintCount }}</strong
          ><small>占全部反馈 {{ percent(citationComplaintRate) }}</small>
        </div>
      </article>
    </section>

    <section class="quality-grid">
      <article class="quality-panel feedback-panel" v-loading="qualityQuery.isLoading.value">
        <div class="quality-panel-head">
          <div>
            <h3>负反馈原因</h3>
            <span>根据用户点踩时选择的标准原因统计</span>
          </div>
          <el-tag effect="plain" type="danger">{{ summary?.unhelpfulCount ?? 0 }} 条点踩</el-tag>
        </div>
        <el-empty
          v-if="!reasonRows.length && !qualityQuery.isLoading.value"
          description="当前周期暂无负反馈原因"
        />
        <div v-else class="quality-bar-list">
          <div v-for="item in reasonRows" :key="item.reason" class="quality-bar-row">
            <div>
              <strong>{{ reasonLabel(item.reason) }}</strong
              ><span>{{ reasonDescription(item.reason) }}</span>
            </div>
            <div class="quality-bar-track">
              <span :style="{ width: `${(item.count / maxReasonCount) * 100}%` }"></span>
            </div>
            <b>{{ item.count }}</b>
          </div>
        </div>
      </article>

      <article class="quality-panel event-panel" v-loading="qualityQuery.isLoading.value">
        <div class="quality-panel-head">
          <div>
            <h3>系统质量事件</h3>
            <span>问答链路自动采集的拒答与失败事件</span>
          </div>
          <el-tag effect="plain" type="warning">{{ totalQualityEvents }} 次事件</el-tag>
        </div>
        <el-empty
          v-if="!eventRows.length && !qualityQuery.isLoading.value"
          description="当前周期暂无系统质量事件"
        />
        <div v-else class="quality-event-list">
          <div v-for="item in eventRows" :key="item.type">
            <span class="event-indicator" :class="`event-${item.type.toLowerCase()}`"></span>
            <div>
              <strong>{{ eventLabel(item.type) }}</strong
              ><span>{{ eventDescription(item.type) }}</span>
            </div>
            <b>{{ item.count }}</b>
            <small>{{ ((item.count / maxEventCount) * 100).toFixed(0) }}%</small>
          </div>
        </div>
      </article>
    </section>

    <section class="quality-panel issues-panel" v-loading="qualityQuery.isLoading.value">
      <div class="quality-panel-head">
        <div>
          <h3>高频质量问题</h3>
          <span>按规范化问题指纹聚合，同一问题的不同大小写与空格会合并</span>
        </div>
        <div class="privacy-badge">
          <el-icon><Collection /></el-icon><span>隐私保护：仅展示不可逆指纹</span>
        </div>
      </div>
      <el-empty
        v-if="!summary?.frequentIssues.length && !qualityQuery.isLoading.value"
        description="当前周期暂无高频质量问题"
      />
      <div v-else class="quality-issue-table">
        <div class="quality-issue-header">
          <span>问题指纹</span><span>事件类型</span><span>出现次数</span><span>最近发生</span
          ><span>建议方向</span>
        </div>
        <div
          v-for="(item, index) in summary?.frequentIssues ?? []"
          :key="`${item.fingerprint}-${item.type}`"
          class="quality-issue-row"
        >
          <div>
            <span class="issue-rank">{{ index + 1 }}</span
            ><code :title="item.fingerprint">{{ issueFingerprint(item.fingerprint) }}</code>
          </div>
          <el-tag
            size="small"
            :type="item.type === 'GENERATION_FAILURE' ? 'danger' : 'warning'"
            effect="plain"
            >{{ eventLabel(item.type) }}</el-tag
          >
          <strong>{{ item.count }}</strong>
          <span>{{ formatDate(item.lastOccurredAt) }}</span>
          <span>{{
            item.type === 'NO_ANSWER'
              ? '补充相关知识文档'
              : item.type === 'CONFLICT_REFUSAL'
                ? '核对冲突版本与有效期'
                : '排查模型与生成链路'
          }}</span>
        </div>
      </div>
    </section>

    <section class="quality-panel issues-panel" v-loading="backlogQuery.isLoading.value">
      <div class="quality-panel-head">
        <div>
          <h3>知识补充待办</h3>
          <span>由重复无答案事件和负反馈汇总，管理员处理后再补充正式文档</span>
        </div>
        <div class="backlog-toolbar">
          <el-select v-model="backlogStatus" size="small" aria-label="待办状态筛选">
            <el-option
              v-for="status in backlogStatuses"
              :key="status"
              :label="backlogStatusLabel(status)"
              :value="status"
            />
          </el-select>
          <el-select v-model="backlogPriority" size="small" aria-label="待办优先级筛选">
            <el-option
              v-for="priority in backlogPriorities"
              :key="priority"
              :label="backlogPriorityLabel(priority)"
              :value="priority"
            />
          </el-select>
          <el-select v-model="backlogStage" size="small" aria-label="待办处置阶段筛选">
            <el-option
              v-for="stage in backlogStages"
              :key="stage"
              :label="backlogStageLabel(stage)"
              :value="stage"
            />
          </el-select>
          <el-select v-model="backlogDeadline" size="small" aria-label="待办期限筛选">
            <el-option
              v-for="deadline in backlogDeadlines"
              :key="deadline"
              :label="backlogDeadlineLabel(deadline)"
              :value="deadline"
            />
          </el-select>
          <el-select v-model="backlogSort" size="small" aria-label="待办排序方式">
            <el-option label="优先级排序" value="PRIORITY" />
            <el-option label="最近发生" value="RECENT" />
          </el-select>
          <el-tag effect="plain" type="warning">
            本页 {{ backlogItems.length }} / 匹配 {{ backlogMeta?.total ?? 0 }} 条
          </el-tag>
        </div>
      </div>
      <div v-if="backlogOverview" class="backlog-overview-grid">
        <button type="button" @click="focusBacklog()">
          <span>活跃待办</span><strong>{{ backlogOverview?.activeCount ?? 0 }}</strong>
          <small>未排期 {{ backlogOverview?.unplannedCount ?? 0 }} 条</small>
        </button>
        <button type="button" class="is-critical" @click="focusBacklog('ALL', 'CRITICAL')">
          <span>紧急待办</span><strong>{{ backlogOverview?.criticalCount ?? 0 }}</strong>
          <small>高及以上共 {{ backlogOverview?.highPriorityCount ?? 0 }} 条</small>
        </button>
        <button type="button" @click="focusBacklog('AWAITING_DOCUMENT')">
          <span>待补文档</span><strong>{{ backlogOverview?.awaitingDocumentCount ?? 0 }}</strong>
          <small>尚未满足检索条件</small>
        </button>
        <button type="button" @click="focusBacklog('AWAITING_VERIFICATION')">
          <span>待验证</span><strong>{{ backlogOverview?.awaitingVerificationCount ?? 0 }}</strong>
          <small>文档已就绪</small>
        </button>
        <button type="button" class="is-ready" @click="focusBacklog('READY_TO_CLOSE')">
          <span>可关闭</span><strong>{{ backlogOverview?.readyToCloseCount ?? 0 }}</strong>
          <small>文档与门禁均通过</small>
        </button>
        <button type="button" class="is-overdue" @click="focusBacklog('ALL', 'ALL', 'OVERDUE')">
          <span>已逾期</span><strong>{{ backlogOverview?.overdueCount ?? 0 }}</strong>
          <small>72小时内到期 {{ backlogOverview?.dueSoonCount ?? 0 }} 条</small>
        </button>
      </div>
      <el-alert
        v-else-if="backlogOverviewQuery.isError.value"
        class="backlog-overview-alert"
        type="error"
        :closable="false"
        show-icon
        title="待办运营概览加载失败，可刷新后重试；下方待办列表仍可独立使用。"
      />
      <el-alert
        v-if="backlogOverview?.truncated"
        class="backlog-overview-alert"
        type="warning"
        :closable="false"
        show-icon
        :title="`活跃待办超过 ${backlogOverview.scanLimit} 条，阶段和优先级概览基于前 ${backlogOverview.scannedActiveCount} 条高频待办。`"
      />
      <el-alert
        v-if="backlogMeta?.truncated"
        class="backlog-overview-alert"
        type="warning"
        :closable="false"
        show-icon
        :title="`列表候选超过 ${backlogMeta.scanLimit} 条，当前匹配数量和分页基于已扫描的 ${backlogMeta.scannedCount} 条；请缩小搜索或筛选范围。`"
      />
      <div class="backlog-list-actions">
        <el-input
          v-model="backlogSearchInput"
          clearable
          placeholder="搜索待办标题或问题指纹"
          aria-label="搜索待办标题或问题指纹"
          @keyup.enter="applyBacklogSearch"
          @clear="applyBacklogSearch"
        >
          <template #append>
            <el-button :icon="Search" aria-label="执行待办搜索" @click="applyBacklogSearch" />
          </template>
        </el-input>
        <el-button
          type="primary"
          plain
          :disabled="selectedBacklogItemIds.length === 0"
          @click="openBatchDueAt"
        >
          批量排期（{{ selectedBacklogItemIds.length }}）
        </el-button>
      </div>
      <el-empty
        v-if="!backlogItems.length && !backlogQuery.isLoading.value"
        :description="`当前没有${backlogStatusLabel(backlogStatus)}的知识补充待办`"
      />
      <div v-else class="quality-issue-table backlog-issue-table">
        <div class="quality-issue-header">
          <el-checkbox
            :model-value="allVisibleBacklogSelected"
            :indeterminate="visibleBacklogSelectionIndeterminate"
            aria-label="选择当前页全部活跃待办"
            @change="toggleVisibleBacklogSelection"
          />
          <span>待办标识</span><span>优先级 / 建议</span><span>处理期限</span><span>无答案</span
          ><span>负反馈</span><span>最近发生</span><span>关联文档</span><span>验证运行</span
          ><span>状态</span>
        </div>
        <div
          v-for="item in backlogItems"
          :key="item.id"
          class="quality-issue-row"
          :class="{ 'is-workflow-target': route.query.backlogItemId === item.id }"
        >
          <el-checkbox
            :model-value="selectedBacklogItemIds.includes(item.id)"
            :disabled="!['OPEN', 'TRIAGED'].includes(item.status)"
            :aria-label="`选择待办 ${item.title || issueFingerprint(item.questionFingerprint)}`"
            @change="toggleBacklogItemSelection(item.id, $event)"
          />
          <div class="backlog-identity-cell">
            <strong v-if="item.title">{{ item.title }}</strong>
            <code :title="item.questionFingerprint">{{
              issueFingerprint(item.questionFingerprint)
            }}</code>
            <el-button link type="primary" :icon="EditPen" @click="openBacklogEditor(item)">
              {{ item.title || item.note ? '查看详情' : '命名待办' }}
            </el-button>
          </div>
          <div class="backlog-priority-cell">
            <el-tag size="small" effect="plain" :type="backlogPriorityTagType(item.priority)">
              {{ backlogPriorityLabel(item.priority) }} · {{ item.priorityScore }}
            </el-tag>
            <small>{{ backlogActionLabel(item.recommendedAction) }}</small>
          </div>
          <div class="backlog-deadline-cell">
            <el-tag size="small" effect="plain" :type="backlogDeadlineTagType(item)">
              {{ backlogItemDeadlineLabel(item) }}
            </el-tag>
            <small>{{ item.dueAt ? fullDate(item.dueAt) : '尚未排期' }}</small>
          </div>
          <strong>{{ item.noAnswerCount }}</strong>
          <strong>{{ item.unhelpfulCount }}</strong>
          <span>{{ formatDate(item.lastObservedAt) }}</span>
          <div class="backlog-document-cell">
            <el-select
              :model-value="item.linkedDocumentId"
              size="small"
              clearable
              filterable
              :loading="documentsQuery.isLoading.value"
              placeholder="选择文档"
              @change="updateBacklogDocument(item, $event)"
            >
              <el-option
                v-if="
                  item.linkedDocument &&
                  !documents.some((document) => document.id === item.linkedDocumentId)
                "
                :key="item.linkedDocument.id"
                :label="`${item.linkedDocument.originalName} · V${item.linkedDocument.version}`"
                :value="item.linkedDocument.id"
              />
              <el-option
                v-for="document in documents"
                :key="document.id"
                :label="`${document.originalName} · V${document.version}`"
                :value="document.id"
              />
            </el-select>
            <el-tag
              size="small"
              effect="plain"
              :type="item.documentReady ? 'success' : 'warning'"
              :title="documentReadinessDetails(item)"
            >
              {{ documentReadinessLabel(item) }}
            </el-tag>
          </div>
          <div class="backlog-verification-cell">
            <el-tag
              size="small"
              effect="plain"
              :type="
                item.verificationReady
                  ? 'success'
                  : item.verificationRun?.status === 'COMPLETED'
                    ? 'danger'
                    : 'warning'
              "
              :title="verificationReadinessDetails(item)"
            >
              {{ verificationStatusLabel(item) }}
            </el-tag>
            <small v-if="item.verificationRun">
              {{ item.verificationRun.suiteName }} · {{ item.verificationRun.passedCases }}/{{
                item.verificationRun.totalCases
              }}
              通过
            </small>
            <template v-else>
              <el-select
                :model-value="selectedVerificationSuiteId(item)"
                size="small"
                :loading="evaluationSuitesQuery.isLoading.value"
                placeholder="选择评测套件"
                @change="verificationSuiteByItem[item.id] = $event"
              >
                <el-option
                  v-for="suite in eligibleVerificationSuites(item)"
                  :key="suite.id"
                  :label="`${suite.name} · ${suite.caseCount} 题`"
                  :value="suite.id"
                />
              </el-select>
            </template>
            <el-button
              v-if="
                item.documentReady &&
                !evaluationSuitesQuery.isLoading.value &&
                !eligibleVerificationSuites(item).length
              "
              size="small"
              link
              type="primary"
              :icon="MagicStick"
              @click="openBacklogCandidateGeneration(item)"
            >
              生成评测题
            </el-button>
            <el-button
              v-else
              size="small"
              link
              type="primary"
              :loading="startVerificationMutation.isPending.value"
              :disabled="
                !item.documentReady ||
                !eligibleVerificationSuites(item).length ||
                ['PENDING', 'RUNNING'].includes(item.verificationRun?.status ?? '')
              "
              @click="startBacklogVerification(item)"
            >
              {{ item.verificationRun ? '重新验证' : '启动验证' }}
            </el-button>
          </div>
          <el-select
            :model-value="item.status"
            size="small"
            :loading="updateBacklogMutation.isPending.value"
            @change="updateBacklogStatus(item, $event)"
          >
            <el-option label="待处理" value="OPEN" />
            <el-option label="已分诊" value="TRIAGED" />
            <el-option label="已解决" value="RESOLVED" :disabled="!item.resolutionReady" />
            <el-option label="已忽略" value="DISMISSED" />
          </el-select>
        </div>
      </div>
      <el-pagination
        v-if="backlogMeta && (backlogMeta.total > backlogPageSize || backlogPage > 1)"
        v-model:current-page="backlogPage"
        class="backlog-pagination"
        background
        layout="prev, pager, next"
        :page-size="backlogPageSize"
        :total="backlogMeta.total"
        :hide-on-single-page="true"
      />
    </section>

    <el-dialog v-model="previewVisible" title="扫描知识缺口" width="min(760px, 94vw)">
      <div class="backlog-preview-meta">
        <span>扫描到 {{ previewScannedCount }} 个问题指纹</span>
        <span>已选择 {{ selectedFingerprints.length }} 个</span>
      </div>
      <el-empty v-if="!previewCandidates.length" description="当前周期没有达到阈值的知识缺口" />
      <el-checkbox-group v-else v-model="selectedFingerprints" class="backlog-candidate-list">
        <el-checkbox
          v-for="item in previewCandidates"
          :key="item.fingerprint"
          :value="item.fingerprint"
          class="backlog-candidate"
        >
          <span class="backlog-candidate-fingerprint">{{
            issueFingerprint(item.fingerprint)
          }}</span>
          <span>无答案 {{ item.noAnswerCount }} 次，负反馈 {{ item.unhelpfulCount }} 次</span>
          <el-tag v-if="item.alreadyTracked" size="small" effect="plain">已在待办</el-tag>
        </el-checkbox>
      </el-checkbox-group>
      <template #footer>
        <el-button @click="previewVisible = false">取消</el-button>
        <el-button
          type="primary"
          :loading="createBacklogMutation.isPending.value"
          :disabled="!selectedFingerprints.length"
          @click="createBacklogMutation.mutate()"
        >
          纳入待办
        </el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="batchDueAtVisible" title="批量设置处理期限" width="min(480px, 94vw)">
      <p class="backlog-batch-description">
        已选择
        {{ selectedBacklogItemIds.length }}
        条活跃待办。操作会原子校验全部版本，存在冲突时不会部分更新。
      </p>
      <el-date-picker
        v-model="batchDueAtDraft"
        type="datetime"
        clearable
        placeholder="选择统一处理期限"
        style="width: 100%"
      />
      <template #footer>
        <el-button
          :loading="batchUpdateBacklogDueAtMutation.isPending.value"
          @click="submitBatchDueAt(true)"
        >
          清除期限
        </el-button>
        <el-button @click="batchDueAtVisible = false">取消</el-button>
        <el-button
          type="primary"
          :loading="batchUpdateBacklogDueAtMutation.isPending.value"
          @click="submitBatchDueAt()"
        >
          统一设置
        </el-button>
      </template>
    </el-dialog>

    <el-drawer
      v-model="backlogEditorVisible"
      class="backlog-editor-drawer"
      title="知识缺口详情"
      direction="rtl"
      size="min(560px, 96vw)"
    >
      <template v-if="editingBacklogItem">
        <div class="backlog-editor-summary">
          <div>
            <el-tag effect="plain">{{ backlogStatusLabel(editingBacklogItem.status) }}</el-tag>
            <el-tag effect="plain" :type="backlogPriorityTagType(editingBacklogItem.priority)">
              {{ backlogPriorityLabel(editingBacklogItem.priority) }}优先级 ·
              {{ editingBacklogItem.priorityScore }} 分
            </el-tag>
            <el-tag effect="plain" type="warning">
              {{ editingBacklogItem.noAnswerCount }} 次无答案
            </el-tag>
            <el-tag effect="plain" type="danger">
              {{ editingBacklogItem.unhelpfulCount }} 次负反馈
            </el-tag>
            <el-tag
              v-if="editingBacklogItem.dueAt"
              effect="plain"
              :type="backlogDeadlineTagType(editingBacklogItem)"
            >
              {{ backlogItemDeadlineLabel(editingBacklogItem) }} ·
              {{ fullDate(editingBacklogItem.dueAt) }}
            </el-tag>
          </div>
          <code :title="editingBacklogItem.questionFingerprint">
            {{ editingBacklogItem.questionFingerprint }}
          </code>
          <small>问题正文不会保存在质量待办中；指纹仅用于合并相同问题。</small>
        </div>

        <section class="backlog-editor-section backlog-editor-recommendation">
          <header><strong>推荐下一步</strong><span>根据当前证据和就绪状态生成</span></header>
          <p>{{ backlogActionLabel(editingBacklogItem.recommendedAction) }}</p>
        </section>

        <el-form label-position="top" class="backlog-editor-form">
          <el-form-item label="待办标题">
            <el-input
              v-model="backlogTitleDraft"
              maxlength="200"
              show-word-limit
              placeholder="例如：补充设备首次登录与密码重置说明"
            />
          </el-form-item>
          <el-form-item label="处置备注">
            <el-input
              v-model="backlogNoteDraft"
              type="textarea"
              :rows="5"
              maxlength="1000"
              show-word-limit
              placeholder="记录缺失知识范围、核对人员、文档要求或暂缓原因"
            />
          </el-form-item>
          <el-form-item label="处理期限">
            <el-date-picker
              v-model="backlogDueAtDraft"
              type="datetime"
              clearable
              placeholder="选择处理期限，可留空"
              style="width: 100%"
            />
            <small class="backlog-form-help">到期后仅提醒和排序，不会自动关闭或忽略待办。</small>
          </el-form-item>
        </el-form>

        <section class="backlog-editor-section">
          <header><strong>反馈原因</strong><span>只展示聚合计数</span></header>
          <div v-if="backlogReasonRows(editingBacklogItem).length" class="backlog-reason-tags">
            <el-tag
              v-for="item in backlogReasonRows(editingBacklogItem)"
              :key="item.reason"
              effect="plain"
              type="danger"
            >
              {{ backlogReasonLabel(item.reason) }} · {{ item.count }}
            </el-tag>
          </div>
          <el-empty v-else description="暂无标准化负反馈原因" :image-size="48" />
        </section>

        <section class="backlog-editor-section backlog-editor-timeline">
          <header><strong>观察时间</strong><span>用于判断验证是否足够新</span></header>
          <div>
            <span>首次出现</span><strong>{{ fullDate(editingBacklogItem.firstObservedAt) }}</strong>
          </div>
          <div>
            <span>最近出现</span><strong>{{ fullDate(editingBacklogItem.lastObservedAt) }}</strong>
          </div>
        </section>

        <section class="backlog-editor-section backlog-editor-history">
          <header><strong>处置历史</strong><span>最近 50 条脱敏审计记录</span></header>
          <el-skeleton v-if="backlogHistoryQuery.isLoading.value" :rows="3" animated />
          <el-timeline v-else-if="backlogHistory.length">
            <el-timeline-item
              v-for="history in backlogHistory"
              :key="history.id"
              :timestamp="fullDate(history.createdAt)"
              placement="top"
            >
              <strong>{{ backlogHistoryActionLabel(history.action) }}</strong>
              <p>{{ backlogHistorySummary(history) }}</p>
              <small>
                操作人：{{ history.actor?.name || history.actor?.email || '已删除或系统账号' }}
              </small>
            </el-timeline-item>
          </el-timeline>
          <el-alert
            v-else-if="backlogHistoryQuery.isError.value"
            type="error"
            :closable="false"
            title="处置历史加载失败，待办详情仍可继续查看和编辑。"
          />
          <el-empty v-else description="暂无处置历史" :image-size="48" />
        </section>

        <section class="backlog-editor-section backlog-editor-readiness">
          <header><strong>关闭条件</strong><span>文档和验证必须同时就绪</span></header>
          <div>
            <el-tag :type="editingBacklogItem.documentReady ? 'success' : 'warning'" effect="plain">
              {{ documentReadinessLabel(editingBacklogItem) }}
            </el-tag>
            <span>{{
              documentReadinessDetails(editingBacklogItem) || '关联文档满足检索条件'
            }}</span>
          </div>
          <div>
            <el-tag
              :type="editingBacklogItem.verificationReady ? 'success' : 'warning'"
              effect="plain"
            >
              {{ verificationStatusLabel(editingBacklogItem) }}
            </el-tag>
            <span>{{
              verificationReadinessDetails(editingBacklogItem) || '完整验证门禁已通过'
            }}</span>
          </div>
        </section>
      </template>

      <template #footer>
        <el-button @click="backlogEditorVisible = false">取消</el-button>
        <el-button
          type="primary"
          :disabled="!backlogEditorDirty"
          :loading="updateBacklogMutation.isPending.value"
          @click="saveBacklogDetails"
        >
          保存详情
        </el-button>
      </template>
    </el-drawer>

    <section class="quality-guidance">
      <span
        ><el-icon><TrendCharts /></el-icon
      ></span>
      <div>
        <h3>指标使用说明</h3>
        <p>
          引用不准确数据来自用户投诉，不等同于自动引用准确率；高频问题只提供不可逆指纹，管理员不能从页面还原用户原始提问。更严格的引用准确率和召回指标将在评测中心通过固定评测集计算。
        </p>
      </div>
      <span class="quality-current-context"
        ><el-icon><DataAnalysis /></el-icon
        >{{ selectedKnowledgeBase?.name || '未选择知识库' }}</span
      >
    </section>
  </div>
</template>
