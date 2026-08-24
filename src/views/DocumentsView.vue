<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query'
import {
  CircleCheck,
  CloseBold,
  Delete,
  Document as DocumentIcon,
  FolderOpened,
  MagicStick,
  EditPen,
  Files,
  Plus,
  Refresh,
  Search,
  UploadFilled,
  Warning,
} from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useRoute, useRouter } from 'vue-router'

import * as documentsApi from '@/services/api/documents'
import * as knowledgeBaseApi from '@/services/api/knowledge-bases'
import { getErrorCodeMessage, getErrorMessage } from '@/services/error-feedback'
import type { KnowledgeDocument } from '@/types/document'
import type { UpdateDocumentMetadataInput } from '@/types/document'

const PAGE_SIZE = 20
const MAX_FILES = 20
const MAX_FILE_SIZE = 20 * 1024 * 1024
const MAX_TOTAL_SIZE = 100 * 1024 * 1024
const ACCEPTED_EXTENSIONS = ['.txt', '.md', '.pdf', '.docx', '.xlsx']

const route = useRoute()
const router = useRouter()
const queryClient = useQueryClient()
const page = ref(1)
const selectedKnowledgeBaseId = ref('')
const search = ref('')
const statusFilter = ref<'ALL' | 'PROCESSING' | 'READY' | 'FAILED'>('ALL')
const uploadDialogVisible = ref(false)
const selectedFiles = ref<File[]>([])
const dragActive = ref(false)
const fileInput = ref<HTMLInputElement>()
const metadataDialogVisible = ref(false)
const versionsDrawerVisible = ref(false)
const versionUploadVisible = ref(false)
const activeDocument = ref<KnowledgeDocument | null>(null)
const versionFile = ref<File | null>(null)
const versionFileInput = ref<HTMLInputElement>()
const versionLabel = ref('')
const metadataForm = ref({
  category: '',
  businessDomain: '',
  tags: [] as string[],
  sensitivityLevel: 'INTERNAL' as KnowledgeDocument['sensitivityLevel'],
  accessMode: 'INHERIT' as KnowledgeDocument['accessMode'],
  versionLabel: '',
  effectiveAt: '',
  expiresAt: '',
})
let pollTimer: ReturnType<typeof setInterval> | null = null

const knowledgeBasesQuery = useQuery({
  queryKey: ['knowledge-bases', 'document-selector'],
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
  page.value = 1
  if (id && route.query.knowledgeBaseId !== id) {
    await router.replace({ query: { ...route.query, knowledgeBaseId: id } })
  }
})

const documentsQuery = useQuery({
  queryKey: computed(() => ['documents', selectedKnowledgeBaseId.value, page.value, PAGE_SIZE]),
  queryFn: () => documentsApi.listDocuments(selectedKnowledgeBaseId.value, page.value, PAGE_SIZE),
  enabled: computed(() => Boolean(selectedKnowledgeBaseId.value)),
})

const uploadMutation = useMutation({
  mutationFn: ({ knowledgeBaseId, files }: { knowledgeBaseId: string; files: File[] }) =>
    documentsApi.uploadDocuments(knowledgeBaseId, files),
})

const deleteMutation = useMutation({
  mutationFn: ({ knowledgeBaseId, documentId }: { knowledgeBaseId: string; documentId: string }) =>
    documentsApi.deleteDocument(knowledgeBaseId, documentId),
})

const metadataMutation = useMutation({
  mutationFn: ({ documentId, input }: { documentId: string; input: UpdateDocumentMetadataInput }) =>
    documentsApi.updateDocumentMetadata(selectedKnowledgeBaseId.value, documentId, input),
})

const versionsQuery = useQuery({
  queryKey: computed(() => [
    'document-versions',
    selectedKnowledgeBaseId.value,
    activeDocument.value?.id,
  ]),
  queryFn: () =>
    documentsApi.listDocumentVersions(
      selectedKnowledgeBaseId.value,
      activeDocument.value?.id ?? '',
    ),
  enabled: computed(() => versionsDrawerVisible.value && Boolean(activeDocument.value?.id)),
})

const versionUploadMutation = useMutation({
  mutationFn: ({ documentId, file, label }: { documentId: string; file: File; label: string }) =>
    documentsApi.uploadDocumentVersion(selectedKnowledgeBaseId.value, documentId, file, label),
})

const activateVersionMutation = useMutation({
  mutationFn: ({ documentId, versionId }: { documentId: string; versionId: string }) =>
    documentsApi.activateDocumentVersion(selectedKnowledgeBaseId.value, documentId, versionId),
})

const knowledgeBases = computed(() => knowledgeBasesQuery.data.value?.items ?? [])
const currentKnowledgeBase = computed(() =>
  knowledgeBases.value.find((item) => item.id === selectedKnowledgeBaseId.value),
)
const documents = computed(() => documentsQuery.data.value?.items ?? [])
const meta = computed(() => documentsQuery.data.value?.meta)
const selectedTotalSize = computed(() =>
  selectedFiles.value.reduce((sum, file) => sum + file.size, 0),
)
const filteredDocuments = computed(() => {
  const keyword = search.value.trim().toLocaleLowerCase()
  return documents.value.filter((item) => {
    const state = displayState(item).key
    return (
      (statusFilter.value === 'ALL' || state === statusFilter.value) &&
      (!keyword || item.originalName.toLocaleLowerCase().includes(keyword))
    )
  })
})

watch(
  () =>
    documents.value.some((item) =>
      ['PENDING', 'RUNNING'].includes(item.ingestionJob?.status ?? ''),
    ),
  (needsPolling) => {
    if (needsPolling && !pollTimer) pollTimer = setInterval(() => documentsQuery.refetch(), 5000)
    if (!needsPolling && pollTimer) {
      clearInterval(pollTimer)
      pollTimer = null
    }
  },
  { immediate: true },
)

onBeforeUnmount(() => {
  if (pollTimer) clearInterval(pollTimer)
})

function openUpload(): void {
  selectedFiles.value = []
  uploadDialogVisible.value = true
}

function addFiles(files: File[]): void {
  const next = [...selectedFiles.value]
  for (const file of files) {
    const extension = file.name.includes('.') ? `.${file.name.split('.').pop()?.toLowerCase()}` : ''
    if (!ACCEPTED_EXTENSIONS.includes(extension)) {
      ElMessage.warning(`${file.name} 的文件类型不受支持`)
      continue
    }
    if (file.size > MAX_FILE_SIZE) {
      ElMessage.warning(`${file.name} 超过单文件 20 MB 限制`)
      continue
    }
    if (!next.some((item) => item.name === file.name && item.size === file.size)) next.push(file)
  }
  if (next.length > MAX_FILES) {
    ElMessage.warning(`单次最多选择 ${MAX_FILES} 个文件`)
    next.splice(MAX_FILES)
  }
  if (next.reduce((sum, file) => sum + file.size, 0) > MAX_TOTAL_SIZE) {
    ElMessage.warning('单次上传总大小不能超过 100 MB')
    return
  }
  selectedFiles.value = next
}

function handleFileInput(event: Event): void {
  const input = event.target as HTMLInputElement
  addFiles(Array.from(input.files ?? []))
  input.value = ''
}

function handleDrop(event: DragEvent): void {
  dragActive.value = false
  addFiles(Array.from(event.dataTransfer?.files ?? []))
}

async function upload(): Promise<void> {
  if (!selectedKnowledgeBaseId.value || !selectedFiles.value.length) return
  try {
    const batch = await uploadMutation.mutateAsync({
      knowledgeBaseId: selectedKnowledgeBaseId.value,
      files: selectedFiles.value,
    })
    uploadDialogVisible.value = false
    const rejected = batch.rejectedFiles
    ElMessage({
      type: rejected ? 'warning' : 'success',
      message: rejected
        ? `已接收 ${batch.acceptedFiles} 个文件，${rejected} 个文件未通过校验`
        : `已接收 ${batch.acceptedFiles} 个文件并开始自动入库`,
    })
    await queryClient.invalidateQueries({ queryKey: ['documents', selectedKnowledgeBaseId.value] })
  } catch (error) {
    ElMessage.error(getErrorMessage(error))
  }
}

async function removeDocument(item: KnowledgeDocument): Promise<void> {
  try {
    await ElMessageBox.confirm(
      `删除后“${item.originalName}”将退出知识检索，并清理对应存储文件。`,
      '确认删除文档',
      { confirmButtonText: '确认删除', cancelButtonText: '取消', type: 'warning' },
    )
    await deleteMutation.mutateAsync({
      knowledgeBaseId: selectedKnowledgeBaseId.value,
      documentId: item.id,
    })
    ElMessage.success('文档已删除')
    if (documents.value.length === 1 && page.value > 1) page.value -= 1
    await queryClient.invalidateQueries({ queryKey: ['documents', selectedKnowledgeBaseId.value] })
  } catch (error) {
    if (error === 'cancel' || error === 'close') return
    ElMessage.error(getErrorMessage(error))
  }
}

function openMetadata(item: KnowledgeDocument): void {
  activeDocument.value = item
  metadataForm.value = {
    category: item.category ?? '',
    businessDomain: item.businessDomain ?? '',
    tags: [...item.tags],
    sensitivityLevel: item.sensitivityLevel,
    accessMode: item.accessMode,
    versionLabel: item.versionLabel ?? '',
    effectiveAt: toLocalDateTime(item.effectiveAt),
    expiresAt: toLocalDateTime(item.expiresAt),
  }
  metadataDialogVisible.value = true
}

function openCandidateGeneration(item: KnowledgeDocument): void {
  void router.push({
    name: 'evaluations',
    query: {
      knowledgeBaseId: selectedKnowledgeBaseId.value,
      candidateDocumentId: item.id,
    },
  })
}

async function saveMetadata(): Promise<void> {
  const item = activeDocument.value
  if (!item) return
  const effectiveAt = toIsoDateTime(metadataForm.value.effectiveAt)
  const expiresAt = toIsoDateTime(metadataForm.value.expiresAt)
  if (effectiveAt && expiresAt && new Date(expiresAt) <= new Date(effectiveAt)) {
    ElMessage.warning('失效时间必须晚于生效时间')
    return
  }
  try {
    await metadataMutation.mutateAsync({
      documentId: item.id,
      input: {
        category: metadataForm.value.category.trim() || null,
        businessDomain: metadataForm.value.businessDomain.trim() || null,
        tags: metadataForm.value.tags
          .map((tag) => tag.trim())
          .filter(Boolean)
          .slice(0, 20),
        sensitivityLevel: metadataForm.value.sensitivityLevel,
        accessMode: metadataForm.value.accessMode,
        versionLabel: metadataForm.value.versionLabel.trim() || null,
        effectiveAt,
        expiresAt,
      },
    })
    metadataDialogVisible.value = false
    ElMessage.success('文档元数据已更新')
    await queryClient.invalidateQueries({ queryKey: ['documents', selectedKnowledgeBaseId.value] })
  } catch (error) {
    ElMessage.error(getErrorMessage(error))
  }
}

function openVersions(item: KnowledgeDocument): void {
  activeDocument.value = item
  versionsDrawerVisible.value = true
}

function openVersionUpload(): void {
  versionFile.value = null
  versionLabel.value = ''
  versionUploadVisible.value = true
}

function handleVersionFile(event: Event): void {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  const extension = file.name.includes('.') ? `.${file.name.split('.').pop()?.toLowerCase()}` : ''
  if (!ACCEPTED_EXTENSIONS.includes(extension) || file.size > MAX_FILE_SIZE) {
    ElMessage.warning('请选择受支持且不超过 20 MB 的文件')
    input.value = ''
    return
  }
  versionFile.value = file
  input.value = ''
}

async function uploadVersion(): Promise<void> {
  if (!activeDocument.value || !versionFile.value) return
  try {
    await versionUploadMutation.mutateAsync({
      documentId: activeDocument.value.id,
      file: versionFile.value,
      label: versionLabel.value,
    })
    versionUploadVisible.value = false
    ElMessage.success('新版本已上传，处理完成后将自动生效')
    await queryClient.invalidateQueries({ queryKey: ['document-versions'] })
    await queryClient.invalidateQueries({ queryKey: ['documents'] })
  } catch (error) {
    ElMessage.error(getErrorMessage(error))
  }
}

async function activateVersion(version: KnowledgeDocument): Promise<void> {
  if (!activeDocument.value) return
  try {
    await ElMessageBox.confirm(
      `确认切换到 ${version.versionLabel || `V${version.version}`}？当前版本将自动归档。`,
      '切换文档版本',
      { confirmButtonText: '确认切换', cancelButtonText: '取消', type: 'warning' },
    )
    await activateVersionMutation.mutateAsync({
      documentId: activeDocument.value.id,
      versionId: version.id,
    })
    ElMessage.success('文档版本已切换')
    await queryClient.invalidateQueries({ queryKey: ['document-versions'] })
    await queryClient.invalidateQueries({ queryKey: ['documents'] })
  } catch (error) {
    if (error === 'cancel' || error === 'close') return
    ElMessage.error(getErrorMessage(error))
  }
}

function canActivateVersion(version: KnowledgeDocument): boolean {
  return (
    version.lifecycleStatus !== 'PUBLISHED' &&
    version.status === 'READY' &&
    version.embeddingStatus === 'READY'
  )
}

function lifecycleLabel(value: KnowledgeDocument['lifecycleStatus']): string {
  return { DRAFT: '草稿处理中', PUBLISHED: '当前生效', ARCHIVED: '历史归档' }[value]
}

function sensitivityLabel(value: KnowledgeDocument['sensitivityLevel']): string {
  return { INTERNAL: '内部', CONFIDENTIAL: '机密', RESTRICTED: '严格受限' }[value]
}

function toLocalDateTime(value: string | null): string {
  if (!value) return ''
  const date = new Date(value)
  const offset = date.getTimezoneOffset() * 60_000
  return new Date(date.getTime() - offset).toISOString().slice(0, 16)
}

function toIsoDateTime(value: string): string | null {
  return value ? new Date(value).toISOString() : null
}

function displayState(item: KnowledgeDocument): {
  key: 'PROCESSING' | 'READY' | 'FAILED'
  label: string
  type: 'primary' | 'success' | 'danger'
  progress: number
} {
  const job = item.ingestionJob
  if (job?.status === 'FAILED' || job?.status === 'CANCELLED' || item.status === 'FAILED') {
    return {
      key: 'FAILED',
      label: job?.status === 'CANCELLED' ? '已取消' : '处理失败',
      type: 'danger',
      progress: job?.progress ?? 0,
    }
  }
  if (
    job?.status === 'SUCCEEDED' ||
    (item.status === 'READY' && item.embeddingStatus === 'READY')
  ) {
    return { key: 'READY', label: '已就绪', type: 'success', progress: 100 }
  }
  const stage = {
    QUEUED: '等待处理',
    PARSING: '正在解析',
    EMBEDDING: '正在向量化',
    COMPLETED: '处理完成',
  }[job?.stage ?? 'QUEUED']
  return { key: 'PROCESSING', label: stage, type: 'primary', progress: job?.progress ?? 0 }
}

function fileKind(item: KnowledgeDocument): string {
  return item.originalName.split('.').pop()?.toUpperCase() || 'FILE'
}

function formatBytes(size: number): string {
  if (size < 1024) return `${size} B`
  if (size < 1024 ** 2) return `${(size / 1024).toFixed(1)} KB`
  return `${(size / 1024 ** 2).toFixed(1)} MB`
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}
</script>

<template>
  <div class="documents-page">
    <section class="documents-hero">
      <div>
        <span class="eyebrow">DOCUMENT PIPELINE</span>
        <h2>文档管理</h2>
        <p>上传后自动完成解析、切片与向量化。支持 TXT、Markdown、PDF、Word 和 Excel。</p>
      </div>
      <el-button
        type="primary"
        :icon="UploadFilled"
        size="large"
        :disabled="!selectedKnowledgeBaseId"
        @click="openUpload"
        >上传文档</el-button
      >
    </section>

    <section v-if="knowledgeBases.length" class="documents-context">
      <div class="context-selector">
        <span>当前知识库</span>
        <el-select v-model="selectedKnowledgeBaseId" filterable aria-label="选择知识库">
          <el-option
            v-for="item in knowledgeBases"
            :key="item.id"
            :label="item.name"
            :value="item.id"
          />
        </el-select>
      </div>
      <div class="context-summary">
        <el-icon><FolderOpened /></el-icon>
        <div>
          <strong>{{ currentKnowledgeBase?.name }}</strong
          ><span>{{ currentKnowledgeBase?.description || '暂无知识库描述' }}</span>
        </div>
      </div>
    </section>

    <el-empty
      v-else-if="!knowledgeBasesQuery.isLoading.value"
      description="请先创建知识库，再上传知识文档"
    >
      <el-button type="primary" :icon="Plus" @click="router.push({ name: 'knowledge-bases' })"
        >创建知识库</el-button
      >
    </el-empty>

    <template v-if="selectedKnowledgeBaseId">
      <section class="documents-toolbar">
        <div class="documents-search">
          <el-input
            v-model="search"
            :prefix-icon="Search"
            clearable
            placeholder="搜索当前页文件名"
          />
          <el-select
            v-model="statusFilter"
            class="document-status-filter"
            aria-label="处理状态筛选"
          >
            <el-option label="全部状态" value="ALL" /><el-option
              label="处理中"
              value="PROCESSING"
            /><el-option label="已就绪" value="READY" /><el-option label="失败" value="FAILED" />
          </el-select>
        </div>
        <div class="toolbar-meta">
          <span>共 {{ meta?.total ?? 0 }} 份文档</span
          ><el-button
            :icon="Refresh"
            circle
            aria-label="刷新"
            :loading="documentsQuery.isFetching.value"
            @click="documentsQuery.refetch()"
          />
        </div>
      </section>

      <section v-loading="documentsQuery.isLoading.value" class="documents-panel">
        <el-alert
          v-if="documentsQuery.isError.value"
          title="文档加载失败"
          :description="getErrorMessage(documentsQuery.error.value)"
          type="error"
          show-icon
          :closable="false"
          ><template #default
            ><el-button size="small" @click="documentsQuery.refetch()"
              >重新加载</el-button
            ></template
          ></el-alert
        >
        <el-empty
          v-else-if="!documentsQuery.isLoading.value && filteredDocuments.length === 0"
          :description="documents.length ? '当前筛选条件下没有文档' : '这个知识库还没有文档'"
        >
          <el-button
            v-if="!documents.length"
            type="primary"
            :icon="UploadFilled"
            @click="openUpload"
            >上传第一份文档</el-button
          >
        </el-empty>
        <div v-else class="document-list">
          <article v-for="item in filteredDocuments" :key="item.id" class="document-row">
            <div class="document-type">
              <el-icon><DocumentIcon /></el-icon><span>{{ fileKind(item) }}</span>
            </div>
            <div class="document-primary">
              <strong>{{ item.originalName }}</strong
              ><span
                >{{ formatBytes(item.sizeBytes) }} · 版本
                {{ item.versionLabel || `V${item.version}` }} ·
                {{ formatDate(item.createdAt) }}</span
              >
            </div>
            <div class="document-metadata">
              <span>{{ item.category || '未分类' }}</span
              ><span v-if="item.chunkCount">{{ item.chunkCount }} 个切片</span
              ><span v-if="item.pageCount">{{ item.pageCount }} 页</span>
            </div>
            <div class="document-state">
              <el-tag :type="displayState(item).type" effect="light"
                ><el-icon
                  ><component
                    :is="
                      displayState(item).key === 'READY'
                        ? CircleCheck
                        : displayState(item).key === 'FAILED'
                          ? Warning
                          : Refresh
                    " /></el-icon
                >{{ displayState(item).label }}</el-tag
              >
              <el-progress
                v-if="displayState(item).key === 'PROCESSING'"
                :percentage="displayState(item).progress"
                :show-text="false"
                :stroke-width="4"
              />
              <small v-if="displayState(item).key === 'FAILED'">{{
                getErrorCodeMessage(
                  item.ingestionJob?.lastErrorCode || item.errorCode || item.embeddingErrorCode,
                  '文档处理失败，请在处理任务中重试',
                )
              }}</small>
            </div>
            <div class="document-row-actions">
              <el-button
                v-if="
                  item.status === 'READY' &&
                  item.embeddingStatus === 'READY' &&
                  item.lifecycleStatus === 'PUBLISHED'
                "
                link
                :icon="MagicStick"
                @click="openCandidateGeneration(item)"
                >生成评测题</el-button
              >
              <el-button link :icon="EditPen" @click="openMetadata(item)">元数据</el-button>
              <el-button link :icon="Files" @click="openVersions(item)">版本</el-button>
              <el-dropdown trigger="click"
                ><el-button link>更多</el-button
                ><template #dropdown
                  ><el-dropdown-menu
                    ><el-dropdown-item
                      :icon="Delete"
                      class="danger-item"
                      @click="removeDocument(item)"
                      >删除</el-dropdown-item
                    ></el-dropdown-menu
                  ></template
                ></el-dropdown
              >
            </div>
          </article>
        </div>
        <div v-if="(meta?.totalPages ?? 0) > 1" class="knowledge-pagination">
          <el-pagination
            v-model:current-page="page"
            background
            layout="prev, pager, next"
            :page-size="PAGE_SIZE"
            :total="meta?.total ?? 0"
          />
        </div>
      </section>
    </template>

    <el-dialog
      v-model="uploadDialogVisible"
      title="上传知识文档"
      width="min(650px, 92vw)"
      destroy-on-close
    >
      <div class="upload-context">
        <span>上传至</span><strong>{{ currentKnowledgeBase?.name }}</strong>
      </div>
      <input
        ref="fileInput"
        class="visually-hidden"
        type="file"
        multiple
        accept=".txt,.md,.pdf,.docx,.xlsx"
        @change="handleFileInput"
      />
      <button
        class="upload-dropzone"
        :class="{ active: dragActive }"
        type="button"
        @click="fileInput?.click()"
        @dragover.prevent="dragActive = true"
        @dragleave.prevent="dragActive = false"
        @drop.prevent="handleDrop"
      >
        <el-icon><UploadFilled /></el-icon><strong>拖放文件到这里，或点击选择文件</strong
        ><span>支持 TXT、MD、PDF、DOCX、XLSX；单文件不超过 20 MB</span>
      </button>
      <div v-if="selectedFiles.length" class="selected-files">
        <div class="selected-files-title">
          <strong>已选择 {{ selectedFiles.length }} 个文件</strong
          ><span>共 {{ formatBytes(selectedTotalSize) }}</span>
        </div>
        <ul>
          <li v-for="(file, index) in selectedFiles" :key="`${file.name}-${file.size}`">
            <span
              ><el-icon><DocumentIcon /></el-icon>{{ file.name }}</span
            ><small>{{ formatBytes(file.size) }}</small
            ><button type="button" aria-label="移除文件" @click="selectedFiles.splice(index, 1)">
              <el-icon><CloseBold /></el-icon>
            </button>
          </li>
        </ul>
      </div>
      <template #footer
        ><el-button @click="uploadDialogVisible = false">取消</el-button
        ><el-button
          type="primary"
          :disabled="!selectedFiles.length"
          :loading="uploadMutation.isPending.value"
          @click="upload"
          >上传并自动入库</el-button
        ></template
      >
    </el-dialog>

    <el-dialog v-model="metadataDialogVisible" title="编辑文档元数据" width="min(650px, 92vw)">
      <div v-if="activeDocument" class="metadata-document-head">
        <el-icon><DocumentIcon /></el-icon>
        <div>
          <strong>{{ activeDocument.originalName }}</strong
          ><span
            >{{ lifecycleLabel(activeDocument.lifecycleStatus) }} · V{{
              activeDocument.version
            }}</span
          >
        </div>
      </div>
      <el-form :model="metadataForm" label-position="top">
        <div class="metadata-form-grid">
          <el-form-item label="分类"
            ><el-input v-model="metadataForm.category" maxlength="100" placeholder="例如：内部制度"
          /></el-form-item>
          <el-form-item label="业务领域"
            ><el-input
              v-model="metadataForm.businessDomain"
              maxlength="100"
              placeholder="例如：人力资源"
          /></el-form-item>
          <el-form-item label="敏感等级"
            ><el-select v-model="metadataForm.sensitivityLevel" class="form-full-width"
              ><el-option label="内部" value="INTERNAL" /><el-option
                label="机密"
                value="CONFIDENTIAL" /><el-option label="严格受限" value="RESTRICTED" /></el-select
          ></el-form-item>
          <el-form-item label="访问模式"
            ><el-select v-model="metadataForm.accessMode" class="form-full-width"
              ><el-option label="继承知识库权限" value="INHERIT" /><el-option
                label="单独配置权限"
                value="RESTRICTED" /></el-select
          ></el-form-item>
          <el-form-item label="版本标签"
            ><el-input
              v-model="metadataForm.versionLabel"
              maxlength="50"
              placeholder="例如：2026 年正式版"
          /></el-form-item>
          <el-form-item label="标签"
            ><el-select
              v-model="metadataForm.tags"
              multiple
              filterable
              allow-create
              default-first-option
              class="form-full-width"
              :multiple-limit="20"
              placeholder="输入后按回车添加，最多 20 个"
          /></el-form-item>
          <el-form-item label="生效时间"
            ><el-date-picker
              v-model="metadataForm.effectiveAt"
              type="datetime"
              value-format="YYYY-MM-DDTHH:mm"
              class="form-full-width"
              clearable
          /></el-form-item>
          <el-form-item label="失效时间"
            ><el-date-picker
              v-model="metadataForm.expiresAt"
              type="datetime"
              value-format="YYYY-MM-DDTHH:mm"
              class="form-full-width"
              clearable
          /></el-form-item>
        </div>
      </el-form>
      <template #footer
        ><el-button @click="metadataDialogVisible = false">取消</el-button
        ><el-button type="primary" :loading="metadataMutation.isPending.value" @click="saveMetadata"
          >保存元数据</el-button
        ></template
      >
    </el-dialog>

    <el-drawer v-model="versionsDrawerVisible" title="文档版本" size="min(720px, 96vw)">
      <div class="version-drawer-head">
        <div>
          <strong>{{ activeDocument?.originalName }}</strong
          ><span>版本系列 {{ versionsQuery.data.value?.versionSeriesId.slice(0, 8) || '—' }}</span>
        </div>
        <el-button
          type="primary"
          :icon="UploadFilled"
          :disabled="activeDocument?.lifecycleStatus !== 'PUBLISHED'"
          @click="openVersionUpload"
          >上传替换版本</el-button
        >
      </div>
      <el-alert
        title="新版本完成解析和向量化后会自动生效；切换历史版本时，当前生效版本自动归档。"
        type="info"
        show-icon
        :closable="false"
      />
      <div v-loading="versionsQuery.isLoading.value" class="version-timeline">
        <el-empty
          v-if="!versionsQuery.isLoading.value && !versionsQuery.data.value?.items.length"
          description="暂无版本记录"
        />
        <article
          v-for="version in versionsQuery.data.value?.items ?? []"
          :key="version.id"
          :class="{ current: version.id === versionsQuery.data.value?.currentDocumentId }"
        >
          <div class="version-rail"><span></span></div>
          <div class="version-content">
            <header>
              <div>
                <strong>{{ version.versionLabel || `V${version.version}` }}</strong
                ><el-tag
                  :type="
                    version.lifecycleStatus === 'PUBLISHED'
                      ? 'success'
                      : version.lifecycleStatus === 'DRAFT'
                        ? 'primary'
                        : 'info'
                  "
                  effect="light"
                  >{{ lifecycleLabel(version.lifecycleStatus) }}</el-tag
                >
              </div>
              <span>{{ formatDate(version.createdAt) }}</span>
            </header>
            <p>{{ version.originalName }} · {{ formatBytes(version.sizeBytes) }}</p>
            <div class="version-facts">
              <span>{{ sensitivityLabel(version.sensitivityLevel) }}</span
              ><span>{{ version.chunkCount }} 个切片</span
              ><span>{{ displayState(version).label }}</span>
            </div>
            <footer>
              <el-button
                v-if="canActivateVersion(version)"
                type="primary"
                link
                :loading="activateVersionMutation.isPending.value"
                @click="activateVersion(version)"
                >切换为当前版本</el-button
              ><span
                v-else-if="
                  version.lifecycleStatus !== 'PUBLISHED' &&
                  (version.status !== 'READY' || version.embeddingStatus !== 'READY')
                "
                >处理完成后才可切换</span
              >
            </footer>
          </div>
        </article>
      </div>
    </el-drawer>

    <el-dialog v-model="versionUploadVisible" title="上传替换版本" width="min(540px, 92vw)">
      <el-form label-position="top"
        ><el-form-item label="版本标签"
          ><el-input
            v-model="versionLabel"
            maxlength="50"
            placeholder="可选，例如：2026.2" /></el-form-item
        ><el-form-item label="版本文件"
          ><input
            ref="versionFileInput"
            class="visually-hidden"
            type="file"
            accept=".txt,.md,.pdf,.docx,.xlsx"
            @change="handleVersionFile"
          /><button type="button" class="version-file-picker" @click="versionFileInput?.click()">
            <el-icon><UploadFilled /></el-icon><span>{{ versionFile?.name || '选择替换文件' }}</span
            ><small>{{
              versionFile ? formatBytes(versionFile.size) : '支持 TXT、MD、PDF、DOCX、XLSX'
            }}</small>
          </button></el-form-item
        ></el-form
      >
      <template #footer
        ><el-button @click="versionUploadVisible = false">取消</el-button
        ><el-button
          type="primary"
          :disabled="!versionFile"
          :loading="versionUploadMutation.isPending.value"
          @click="uploadVersion"
          >上传并处理</el-button
        ></template
      >
    </el-dialog>
  </div>
</template>
