<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query'
import {
  ChatDotRound,
  CircleCheck,
  Collection,
  DataAnalysis,
  DocumentChecked,
  Refresh,
  Search,
  TrendCharts,
  Warning,
} from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import { useRoute, useRouter } from 'vue-router'

import { ApiError } from '@/services/api/client'
import * as knowledgeBaseApi from '@/services/api/knowledge-bases'
import {
  createKnowledgeBacklog,
  getQualitySummary,
  listKnowledgeBacklog,
  previewKnowledgeBacklog,
  updateKnowledgeBacklog,
  type KnowledgeBacklogCandidate,
  type KnowledgeBacklogItem,
} from '@/services/api/quality'
import type { FeedbackReason, QualityEventType } from '@/types/quality'

type RangeValue = '7' | '30' | '90' | 'ALL'

const route = useRoute()
const router = useRouter()
const queryClient = useQueryClient()
const selectedKnowledgeBaseId = ref(String(route.query.knowledgeBaseId ?? ''))
const rangeValue = ref<RangeValue>('30')

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
const backlogQuery = useQuery({
  queryKey: computed(() => ['knowledge-backlog', selectedKnowledgeBaseId.value]),
  queryFn: () => listKnowledgeBacklog(selectedKnowledgeBaseId.value),
  enabled: computed(() => Boolean(selectedKnowledgeBaseId.value)),
})
const backlogItems = computed(() => backlogQuery.data.value ?? [])
const previewVisible = ref(false)
const previewCandidates = ref<KnowledgeBacklogCandidate[]>([])
const selectedFingerprints = ref<string[]>([])
const previewScannedCount = ref(0)

const previewMutation = useMutation({
  mutationFn: () => previewKnowledgeBacklog(selectedKnowledgeBaseId.value, {
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
  mutationFn: () => createKnowledgeBacklog(selectedKnowledgeBaseId.value, {
    fingerprints: selectedFingerprints.value,
    ...backlogWindow.value,
    minimumNoAnswerCount: 2,
    minimumUnhelpfulCount: 2,
    limit: 50,
  }),
  onSuccess: (result) => {
    previewVisible.value = false
    void queryClient.invalidateQueries({ queryKey: ['knowledge-backlog', selectedKnowledgeBaseId.value] })
    ElMessage.success(`已纳入 ${result.createdOrUpdatedCount} 条知识补充待办`)
  },
  onError: (error) => ElMessage.error(getErrorMessage(error)),
})

const updateBacklogMutation = useMutation({
  mutationFn: ({ item, status }: { item: KnowledgeBacklogItem; status: KnowledgeBacklogItem['status'] }) =>
    updateKnowledgeBacklog(selectedKnowledgeBaseId.value, item.id, { revision: item.revision, status }),
  onSuccess: () => {
    void queryClient.invalidateQueries({ queryKey: ['knowledge-backlog', selectedKnowledgeBaseId.value] })
    ElMessage.success('待办状态已更新')
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

function reasonLabel(value: FeedbackReason): string {
  return {
    INCORRECT: '答案错误',
    INCOMPLETE: '回答不完整',
    INACCURATE_CITATION: '引用不准确',
    SHOULD_HAVE_ANSWERED: '本应回答',
    SHOULD_HAVE_REFUSED: '本应拒答',
    NOT_ACTIONABLE: '缺少可操作性',
    EXPRESSION: '表达问题',
    OTHER: '其他原因',
  }[value]
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

function updateBacklogStatus(item: KnowledgeBacklogItem, status: KnowledgeBacklogItem['status']): void {
  if (status !== item.status) updateBacklogMutation.mutate({ item, status })
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
          @click="qualityQuery.refetch()"
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
        <el-tag effect="plain" type="warning">{{ backlogItems.length }} 条待处理</el-tag>
      </div>
      <el-empty
        v-if="!backlogItems.length && !backlogQuery.isLoading.value"
        description="当前没有开放的知识补充待办"
      />
      <div v-else class="quality-issue-table">
        <div class="quality-issue-header">
          <span>问题指纹</span><span>无答案</span><span>负反馈</span><span>最近发生</span><span>状态</span>
        </div>
        <div v-for="item in backlogItems" :key="item.id" class="quality-issue-row">
          <code :title="item.questionFingerprint">{{ issueFingerprint(item.questionFingerprint) }}</code>
          <strong>{{ item.noAnswerCount }}</strong>
          <strong>{{ item.unhelpfulCount }}</strong>
          <span>{{ formatDate(item.lastObservedAt) }}</span>
          <el-select
            :model-value="item.status"
            size="small"
            :loading="updateBacklogMutation.isPending.value"
            @change="updateBacklogStatus(item, $event)"
          >
            <el-option label="待处理" value="OPEN" />
            <el-option label="已分诊" value="TRIAGED" />
            <el-option label="已解决" value="RESOLVED" />
            <el-option label="已忽略" value="DISMISSED" />
          </el-select>
        </div>
      </div>
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
          <span class="backlog-candidate-fingerprint">{{ issueFingerprint(item.fingerprint) }}</span>
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
