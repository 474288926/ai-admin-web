<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query'
import {
  CircleCheck,
  Clock,
  Close,
  Document as DocumentIcon,
  FolderOpened,
  Refresh,
  RefreshRight,
  Tickets,
  UploadFilled,
  Warning,
} from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useRoute, useRouter } from 'vue-router'

import * as documentsApi from '@/services/api/documents'
import * as knowledgeBaseApi from '@/services/api/knowledge-bases'
import { getErrorMessage } from '@/services/error-feedback'
import type { DocumentBatch, KnowledgeDocument } from '@/types/document'

const PAGE_SIZE = 20
const route = useRoute()
const router = useRouter()
const queryClient = useQueryClient()
const selectedKnowledgeBaseId = ref('')
const activeTab = ref<'documents' | 'batches'>('documents')
const documentPage = ref(1)
const batchPage = ref(1)
let pollTimer: ReturnType<typeof setInterval> | null = null

const knowledgeBasesQuery = useQuery({
  queryKey: ['knowledge-bases', 'ingestion-selector'],
  queryFn: () => knowledgeBaseApi.listKnowledgeBases(1, 100),
})

watch(
  () => knowledgeBasesQuery.data.value?.items,
  (items) => {
    if (!items?.length || selectedKnowledgeBaseId.value) return
    const queryId =
      typeof route.query.knowledgeBaseId === 'string' ? route.query.knowledgeBaseId : ''
    selectedKnowledgeBaseId.value = items.some((item) => item.id === queryId)
      ? queryId
      : (items[0]?.id ?? '')
  },
  { immediate: true },
)

watch(selectedKnowledgeBaseId, async (id) => {
  documentPage.value = 1
  batchPage.value = 1
  if (id && route.query.knowledgeBaseId !== id) {
    await router.replace({ query: { ...route.query, knowledgeBaseId: id } })
  }
})

const documentsQuery = useQuery({
  queryKey: computed(() => [
    'ingestion-documents',
    selectedKnowledgeBaseId.value,
    documentPage.value,
  ]),
  queryFn: () =>
    documentsApi.listDocuments(selectedKnowledgeBaseId.value, documentPage.value, PAGE_SIZE),
  enabled: computed(() => Boolean(selectedKnowledgeBaseId.value)),
})

const batchesQuery = useQuery({
  queryKey: computed(() => ['ingestion-batches', selectedKnowledgeBaseId.value, batchPage.value]),
  queryFn: () =>
    documentsApi.listDocumentBatches(selectedKnowledgeBaseId.value, batchPage.value, PAGE_SIZE),
  enabled: computed(() => Boolean(selectedKnowledgeBaseId.value)),
})

const jobMutation = useMutation({
  mutationFn: ({
    action,
    documentId,
  }: {
    action: 'retry' | 'cancel' | 'reindex'
    documentId: string
  }) => {
    const id = selectedKnowledgeBaseId.value
    if (action === 'retry') return documentsApi.retryDocumentJob(id, documentId)
    if (action === 'cancel') return documentsApi.cancelDocumentJob(id, documentId)
    return documentsApi.reindexDocument(id, documentId)
  },
})

type BatchActionResult = DocumentBatch | { retriedFiles: number; batch: DocumentBatch }

const batchMutation = useMutation<
  BatchActionResult,
  Error,
  { action: 'retry' | 'cancel'; batchId: string }
>({
  mutationFn: async ({ action, batchId }) => {
    if (action === 'retry') {
      return documentsApi.retryDocumentBatch(selectedKnowledgeBaseId.value, batchId)
    }
    return documentsApi.cancelDocumentBatch(selectedKnowledgeBaseId.value, batchId)
  },
})

const knowledgeBases = computed(() => knowledgeBasesQuery.data.value?.items ?? [])
const currentKnowledgeBase = computed(() =>
  knowledgeBases.value.find((item) => item.id === selectedKnowledgeBaseId.value),
)
const documents = computed(() => documentsQuery.data.value?.items ?? [])
const batches = computed(() => batchesQuery.data.value?.items ?? [])
const activeDocuments = computed(() =>
  documents.value.filter((item) =>
    ['PENDING', 'RUNNING'].includes(item.ingestionJob?.status ?? ''),
  ),
)
const failedDocuments = computed(() =>
  documents.value.filter((item) =>
    ['FAILED', 'CANCELLED'].includes(item.ingestionJob?.status ?? ''),
  ),
)
const completedDocuments = computed(() =>
  documents.value.filter((item) => item.ingestionJob?.status === 'SUCCEEDED'),
)
const hasActiveTasks = computed(
  () =>
    activeDocuments.value.length > 0 ||
    batches.value.some((batch) => batch.status === 'PROCESSING'),
)

watch(
  hasActiveTasks,
  (active) => {
    if (active && !pollTimer) {
      pollTimer = setInterval(() => {
        documentsQuery.refetch()
        batchesQuery.refetch()
      }, 5000)
    }
    if (!active && pollTimer) {
      clearInterval(pollTimer)
      pollTimer = null
    }
  },
  { immediate: true },
)

onBeforeUnmount(() => {
  if (pollTimer) clearInterval(pollTimer)
})

async function refreshAll(): Promise<void> {
  await Promise.all([documentsQuery.refetch(), batchesQuery.refetch()])
}

async function runDocumentAction(
  action: 'retry' | 'cancel' | 'reindex',
  item: KnowledgeDocument,
): Promise<void> {
  try {
    if (action === 'cancel') {
      await ElMessageBox.confirm(`确认取消“${item.originalName}”当前的处理任务？`, '取消任务', {
        confirmButtonText: '确认取消',
        cancelButtonText: '返回',
        type: 'warning',
      })
    }
    await jobMutation.mutateAsync({ action, documentId: item.id })
    ElMessage.success(
      { retry: '任务已重新进入队列', cancel: '已提交取消请求', reindex: '已开始重新索引' }[action],
    )
    await invalidateTasks()
  } catch (error) {
    if (error === 'cancel' || error === 'close') return
    ElMessage.error(getErrorMessage(error))
  }
}

async function runBatchAction(action: 'retry' | 'cancel', batch: DocumentBatch): Promise<void> {
  try {
    if (action === 'cancel') {
      await ElMessageBox.confirm('确认取消该批次中等待或运行中的任务？', '取消批次', {
        confirmButtonText: '确认取消',
        cancelButtonText: '返回',
        type: 'warning',
      })
    }
    const result = await batchMutation.mutateAsync({ action, batchId: batch.id })
    if (action === 'retry' && 'retriedFiles' in result) {
      ElMessage.success(`已重新提交 ${result.retriedFiles} 个任务`)
    } else {
      ElMessage.success('批次取消请求已提交')
    }
    await invalidateTasks()
  } catch (error) {
    if (error === 'cancel' || error === 'close') return
    ElMessage.error(getErrorMessage(error))
  }
}

async function invalidateTasks(): Promise<void> {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: ['ingestion-documents'] }),
    queryClient.invalidateQueries({ queryKey: ['ingestion-batches'] }),
    queryClient.invalidateQueries({ queryKey: ['documents'] }),
  ])
}

function jobLabel(item: KnowledgeDocument): string {
  const job = item.ingestionJob
  if (!job) return '无任务'
  if (job.status === 'FAILED') return '处理失败'
  if (job.status === 'CANCELLED') return '已取消'
  if (job.status === 'SUCCEEDED') return '已完成'
  return { QUEUED: '等待处理', PARSING: '解析文档', EMBEDDING: '生成向量', COMPLETED: '完成收尾' }[
    job.stage
  ]
}

function jobType(item: KnowledgeDocument): 'info' | 'primary' | 'success' | 'danger' | 'warning' {
  const status = item.ingestionJob?.status
  if (status === 'SUCCEEDED') return 'success'
  if (status === 'FAILED') return 'danger'
  if (status === 'CANCELLED') return 'warning'
  if (status === 'RUNNING' || status === 'PENDING') return 'primary'
  return 'info'
}

function batchLabel(status: DocumentBatch['status']): string {
  return {
    PROCESSING: '处理中',
    SUCCEEDED: '全部成功',
    PARTIALLY_SUCCEEDED: '部分成功',
    FAILED: '失败',
    CANCELLED: '已取消',
  }[status]
}

function batchType(status: DocumentBatch['status']): 'primary' | 'success' | 'warning' | 'danger' {
  return {
    PROCESSING: 'primary',
    SUCCEEDED: 'success',
    PARTIALLY_SUCCEEDED: 'warning',
    FAILED: 'danger',
    CANCELLED: 'warning',
  }[status] as 'primary' | 'success' | 'warning' | 'danger'
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}
</script>

<template>
  <div class="ingestion-page">
    <section class="ingestion-hero">
      <div>
        <span class="eyebrow">INGESTION OPERATIONS</span>
        <h2>处理任务</h2>
        <p>监控文档从上传、解析、切片到向量化的完整入库过程。</p>
      </div>
      <div class="ingestion-actions">
        <el-select v-model="selectedKnowledgeBaseId" filterable aria-label="选择知识库"
          ><el-option
            v-for="item in knowledgeBases"
            :key="item.id"
            :label="item.name"
            :value="item.id" /></el-select
        ><el-button
          :icon="Refresh"
          :loading="documentsQuery.isFetching.value || batchesQuery.isFetching.value"
          @click="refreshAll"
          >刷新</el-button
        >
      </div>
    </section>

    <section v-if="selectedKnowledgeBaseId" class="task-context">
      <el-icon><FolderOpened /></el-icon>
      <div>
        <span>当前监控</span><strong>{{ currentKnowledgeBase?.name }}</strong>
      </div>
      <span v-if="hasActiveTasks" class="live-indicator"><i></i>每 5 秒自动刷新</span
      ><span v-else class="live-indicator quiet"><i></i>当前任务已稳定</span>
    </section>

    <section v-if="selectedKnowledgeBaseId" class="task-metrics">
      <article>
        <div class="task-metric-icon blue">
          <el-icon><Clock /></el-icon>
        </div>
        <span>当前处理中</span><strong>{{ activeDocuments.length }}</strong
        ><small>本页文档任务</small>
      </article>
      <article>
        <div class="task-metric-icon red">
          <el-icon><Warning /></el-icon>
        </div>
        <span>失败或取消</span><strong>{{ failedDocuments.length }}</strong
        ><small>可重新提交</small>
      </article>
      <article>
        <div class="task-metric-icon green">
          <el-icon><CircleCheck /></el-icon>
        </div>
        <span>已完成</span><strong>{{ completedDocuments.length }}</strong
        ><small>本页任务</small>
      </article>
      <article>
        <div class="task-metric-icon violet">
          <el-icon><Tickets /></el-icon>
        </div>
        <span>批次记录</span><strong>{{ batchesQuery.data.value?.meta.total ?? 0 }}</strong
        ><small>当前知识库</small>
      </article>
    </section>

    <el-empty
      v-if="!knowledgeBasesQuery.isLoading.value && !knowledgeBases.length"
      description="请先创建知识库并上传文档"
      ><el-button type="primary" :icon="UploadFilled" @click="router.push({ name: 'documents' })"
        >前往文档管理</el-button
      ></el-empty
    >

    <section v-else-if="selectedKnowledgeBaseId" class="task-panel">
      <el-tabs v-model="activeTab">
        <el-tab-pane label="文档任务" name="documents">
          <el-alert
            v-if="documentsQuery.isError.value"
            title="任务加载失败"
            :description="getErrorMessage(documentsQuery.error.value)"
            type="error"
            show-icon
            :closable="false"
          />
          <el-empty
            v-else-if="!documentsQuery.isLoading.value && !documents.length"
            description="暂无文档处理任务"
          />
          <div v-else v-loading="documentsQuery.isLoading.value" class="job-list">
            <article v-for="item in documents" :key="item.id" class="job-row">
              <div class="job-file">
                <el-icon><DocumentIcon /></el-icon>
              </div>
              <div class="job-main">
                <strong>{{ item.originalName }}</strong
                ><span
                  >任务 {{ item.ingestionJob?.id?.slice(0, 8) || '—' }} · 第
                  {{ item.ingestionJob?.attempt ?? 0 }}/{{
                    item.ingestionJob?.maxAttempts ?? 0
                  }}
                  次尝试</span
                >
              </div>
              <div class="job-progress">
                <div>
                  <el-tag :type="jobType(item)" effect="light">{{ jobLabel(item) }}</el-tag
                  ><span>{{ item.ingestionJob?.progress ?? 0 }}%</span>
                </div>
                <el-progress
                  :percentage="item.ingestionJob?.progress ?? 0"
                  :show-text="false"
                  :stroke-width="5"
                  :status="
                    item.ingestionJob?.status === 'FAILED'
                      ? 'exception'
                      : item.ingestionJob?.status === 'SUCCEEDED'
                        ? 'success'
                        : undefined
                  "
                /><small v-if="item.ingestionJob?.lastErrorCode">{{
                  item.ingestionJob.lastErrorCode
                }}</small>
              </div>
              <div class="job-time">
                <span>更新时间</span
                ><strong>{{ formatDate(item.ingestionJob?.updatedAt || item.updatedAt) }}</strong>
              </div>
              <div class="job-actions">
                <el-button
                  v-if="['PENDING', 'RUNNING'].includes(item.ingestionJob?.status ?? '')"
                  link
                  type="warning"
                  :icon="Close"
                  @click="runDocumentAction('cancel', item)"
                  >取消</el-button
                ><el-button
                  v-if="['FAILED', 'CANCELLED'].includes(item.ingestionJob?.status ?? '')"
                  link
                  type="primary"
                  :icon="RefreshRight"
                  @click="runDocumentAction('retry', item)"
                  >重试</el-button
                ><el-button
                  v-if="item.ingestionJob?.status === 'SUCCEEDED'"
                  link
                  :icon="RefreshRight"
                  @click="runDocumentAction('reindex', item)"
                  >重新索引</el-button
                >
              </div>
            </article>
          </div>
          <div
            v-if="(documentsQuery.data.value?.meta.totalPages ?? 0) > 1"
            class="knowledge-pagination"
          >
            <el-pagination
              v-model:current-page="documentPage"
              background
              layout="prev, pager, next"
              :page-size="PAGE_SIZE"
              :total="documentsQuery.data.value?.meta.total ?? 0"
            />
          </div>
        </el-tab-pane>

        <el-tab-pane label="批量导入" name="batches">
          <el-alert
            v-if="batchesQuery.isError.value"
            title="批次历史加载失败"
            :description="getErrorMessage(batchesQuery.error.value)"
            type="error"
            show-icon
            :closable="false"
          />
          <el-empty
            v-else-if="!batchesQuery.isLoading.value && !batches.length"
            description="暂无批量导入记录"
          />
          <div v-else v-loading="batchesQuery.isLoading.value" class="batch-list">
            <article v-for="batch in batches" :key="batch.id" class="batch-card">
              <header>
                <div>
                  <el-icon><Tickets /></el-icon><span>批次 {{ batch.id.slice(0, 8) }}</span>
                </div>
                <el-tag :type="batchType(batch.status)" effect="light">{{
                  batchLabel(batch.status)
                }}</el-tag>
              </header>
              <div class="batch-progress">
                <div>
                  <strong>{{ batch.progress }}%</strong
                  ><span>{{ formatDate(batch.createdAt) }} 创建</span>
                </div>
                <el-progress
                  :percentage="batch.progress"
                  :show-text="false"
                  :stroke-width="7"
                  :status="
                    batch.status === 'FAILED'
                      ? 'exception'
                      : batch.status === 'SUCCEEDED'
                        ? 'success'
                        : undefined
                  "
                />
              </div>
              <div class="batch-stats">
                <span
                  >总数 <b>{{ batch.totalFiles }}</b></span
                ><span
                  >成功 <b class="success">{{ batch.succeededFiles }}</b></span
                ><span
                  >运行 <b>{{ batch.runningFiles }}</b></span
                ><span
                  >失败 <b class="danger">{{ batch.failedFiles }}</b></span
                ><span
                  >取消 <b>{{ batch.cancelledFiles }}</b></span
                >
              </div>
              <ul>
                <li v-for="item in batch.items" :key="item.id">
                  <span>{{ item.originalName }}</span
                  ><el-progress
                    :percentage="item.progress"
                    :show-text="false"
                    :stroke-width="4"
                  /><small :class="item.status.toLowerCase()"
                    >{{ item.status
                    }}<template v-if="item.errorCode"> · {{ item.errorCode }}</template></small
                  >
                </li>
              </ul>
              <footer>
                <el-button
                  v-if="batch.status === 'PROCESSING'"
                  size="small"
                  :icon="Close"
                  @click="runBatchAction('cancel', batch)"
                  >取消批次</el-button
                ><el-button
                  v-if="batch.failedFiles || batch.cancelledFiles"
                  type="primary"
                  size="small"
                  :icon="RefreshRight"
                  @click="runBatchAction('retry', batch)"
                  >重试失败项</el-button
                >
              </footer>
            </article>
          </div>
          <div
            v-if="(batchesQuery.data.value?.meta.totalPages ?? 0) > 1"
            class="knowledge-pagination"
          >
            <el-pagination
              v-model:current-page="batchPage"
              background
              layout="prev, pager, next"
              :page-size="PAGE_SIZE"
              :total="batchesQuery.data.value?.meta.total ?? 0"
            />
          </div>
        </el-tab-pane>
      </el-tabs>
    </section>
  </div>
</template>
