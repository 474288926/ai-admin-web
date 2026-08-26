<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query'
import {
  Connection,
  Delete,
  FolderOpened,
  Plus,
  QuestionFilled,
  Refresh,
  SetUp,
} from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox } from 'element-plus'

import { ApiError } from '@/services/api/client'
import * as sourcesApi from '@/services/api/document-sources'
import * as knowledgeBaseApi from '@/services/api/knowledge-bases'
import type { DocumentSource, DocumentSyncRunStatus } from '@/types/document-source'

const queryClient = useQueryClient()
const selectedKnowledgeBaseId = ref('')
const dialogVisible = ref(false)
const runsDrawerVisible = ref(false)
const activeSource = ref<DocumentSource | null>(null)
const form = ref({ name: '', rootPath: '', recursive: true })

const knowledgeBasesQuery = useQuery({
  queryKey: ['knowledge-bases', 'document-source-selector'],
  queryFn: () => knowledgeBaseApi.listKnowledgeBases(1, 100),
})
const knowledgeBases = computed(() => knowledgeBasesQuery.data.value?.items ?? [])

watch(
  knowledgeBases,
  (items) => {
    if (!selectedKnowledgeBaseId.value && items[0]) selectedKnowledgeBaseId.value = items[0].id
  },
  { immediate: true },
)

const sourcesQuery = useQuery({
  queryKey: computed(() => ['document-sources', selectedKnowledgeBaseId.value]),
  queryFn: () => sourcesApi.listDocumentSources(selectedKnowledgeBaseId.value),
  enabled: computed(() => Boolean(selectedKnowledgeBaseId.value)),
})
const sources = computed(() => sourcesQuery.data.value ?? [])

const createMutation = useMutation({
  mutationFn: () =>
    sourcesApi.createDocumentSource(selectedKnowledgeBaseId.value, {
      name: form.value.name.trim(),
      rootPath: form.value.rootPath.trim(),
      recursive: form.value.recursive,
    }),
})
const syncMutation = useMutation({
  mutationFn: (sourceId: string) =>
    sourcesApi.synchronizeDocumentSource(selectedKnowledgeBaseId.value, sourceId),
})
const toggleMutation = useMutation({
  mutationFn: ({ sourceId, enabled }: { sourceId: string; enabled: boolean }) =>
    sourcesApi.updateDocumentSource(selectedKnowledgeBaseId.value, sourceId, { enabled }),
})
const deleteMutation = useMutation({
  mutationFn: (sourceId: string) =>
    sourcesApi.deleteDocumentSource(selectedKnowledgeBaseId.value, sourceId),
})
const runsQuery = useQuery({
  queryKey: computed(() => [
    'document-source-runs',
    selectedKnowledgeBaseId.value,
    activeSource.value?.id,
  ]),
  queryFn: () =>
    sourcesApi.listDocumentSyncRuns(selectedKnowledgeBaseId.value, activeSource.value?.id ?? ''),
  enabled: computed(() => runsDrawerVisible.value && Boolean(activeSource.value)),
})

function errorMessage(error: unknown): string {
  return error instanceof ApiError ? error.message : '操作失败，请稍后重试'
}

function openCreate(): void {
  form.value = { name: '', rootPath: '', recursive: true }
  dialogVisible.value = true
}

async function createSource(): Promise<void> {
  if (!form.value.name.trim() || !form.value.rootPath.trim()) return
  try {
    await createMutation.mutateAsync()
    dialogVisible.value = false
    ElMessage.success('文档源已创建，可手动运行首次同步')
    await queryClient.invalidateQueries({ queryKey: ['document-sources'] })
  } catch (error) {
    ElMessage.error(errorMessage(error))
  }
}

async function synchronize(source: DocumentSource): Promise<void> {
  try {
    const run = await syncMutation.mutateAsync(source.id)
    const summary = run.summary
    ElMessage({
      type: run.status === 'SUCCEEDED' ? 'success' : 'warning',
      message: `同步完成：新增 ${summary.created}、更新 ${summary.updated}、未变化 ${summary.unchanged}、失败 ${summary.failed}`,
    })
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['document-sources'] }),
      queryClient.invalidateQueries({ queryKey: ['documents'] }),
      queryClient.invalidateQueries({ queryKey: ['ingestion'] }),
    ])
  } catch (error) {
    ElMessage.error(errorMessage(error))
  }
}

async function toggleSource(source: DocumentSource): Promise<void> {
  try {
    await toggleMutation.mutateAsync({ sourceId: source.id, enabled: !source.enabled })
    ElMessage.success(source.enabled ? '文档源已停用' : '文档源已启用')
    await queryClient.invalidateQueries({ queryKey: ['document-sources'] })
  } catch (error) {
    ElMessage.error(errorMessage(error))
  }
}

async function removeSource(source: DocumentSource): Promise<void> {
  try {
    await ElMessageBox.confirm(
      '移除后停止继续同步，但不会删除已经入库的文档。',
      `移除“${source.name}”`,
      { type: 'warning', confirmButtonText: '确认移除', cancelButtonText: '取消' },
    )
    await deleteMutation.mutateAsync(source.id)
    ElMessage.success('文档源已移除，现有文档保持不变')
    await queryClient.invalidateQueries({ queryKey: ['document-sources'] })
  } catch (error) {
    if (error === 'cancel' || error === 'close') return
    ElMessage.error(errorMessage(error))
  }
}

function openRuns(source: DocumentSource): void {
  activeSource.value = source
  runsDrawerVisible.value = true
}

function statusLabel(status: DocumentSyncRunStatus | null): string {
  if (!status) return '尚未同步'
  return {
    RUNNING: '同步中',
    SUCCEEDED: '成功',
    PARTIALLY_SUCCEEDED: '部分成功',
    FAILED: '失败',
  }[status]
}

function statusType(
  status: DocumentSyncRunStatus | null,
): 'info' | 'primary' | 'success' | 'warning' | 'danger' {
  return status === 'SUCCEEDED'
    ? 'success'
    : status === 'PARTIALLY_SUCCEEDED'
      ? 'warning'
      : status === 'FAILED'
        ? 'danger'
        : status === 'RUNNING'
          ? 'primary'
          : 'info'
}

function formatDate(value: string | null): string {
  return value
    ? new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium', timeStyle: 'short' }).format(
        new Date(value),
      )
    : '—'
}
</script>

<template>
  <div class="document-sources-page">
    <section class="document-sources-hero">
      <div>
        <span class="eyebrow">ENTERPRISE CONTENT</span>
        <h2>企业文档同步</h2>
        <p>将服务端本地或已挂载目录增量同步到现有知识库，自动复用解析、向量化和版本切换链路。</p>
      </div>
      <el-button
        type="primary"
        :icon="Plus"
        :disabled="!selectedKnowledgeBaseId"
        @click="openCreate"
        >添加文档源</el-button
      >
    </section>

    <section class="document-sources-context">
      <div>
        <span>目标知识库</span
        ><el-select v-model="selectedKnowledgeBaseId" filterable
          ><el-option
            v-for="item in knowledgeBases"
            :key="item.id"
            :label="item.name"
            :value="item.id"
        /></el-select>
      </div>
      <el-alert
        title="源端文件缺失只会标记并报告，不会自动删除或下架已发布知识。"
        type="warning"
        show-icon
        :closable="false"
      />
    </section>

    <section v-loading="sourcesQuery.isLoading.value" class="document-sources-panel">
      <el-alert
        v-if="sourcesQuery.isError.value"
        title="文档源加载失败"
        :description="errorMessage(sourcesQuery.error.value)"
        type="error"
        :closable="false"
        show-icon
      />
      <el-empty v-else-if="!sources.length" description="当前知识库还没有企业文档源"
        ><el-button type="primary" @click="openCreate">添加第一个文档源</el-button></el-empty
      >
      <div v-else class="document-source-list">
        <article v-for="source in sources" :key="source.id">
          <div class="document-source-icon">
            <el-icon><FolderOpened /></el-icon>
          </div>
          <div class="document-source-main">
            <div>
              <strong>{{ source.name }}</strong
              ><el-tag :type="source.enabled ? 'success' : 'info'" effect="plain">{{
                source.enabled ? '已启用' : '已停用'
              }}</el-tag>
            </div>
            <code>{{ source.rootPath }}</code
            ><small
              >{{ source.recursive ? '包含子目录' : '仅当前目录' }} · 已跟踪
              {{ source._count?.items ?? 0 }} 份文件</small
            >
          </div>
          <div class="document-source-state">
            <el-tag :type="statusType(source.lastRunStatus)">{{
              statusLabel(source.lastRunStatus)
            }}</el-tag
            ><span>{{ formatDate(source.lastSyncedAt) }}</span>
          </div>
          <div class="document-source-actions">
            <el-button
              type="primary"
              :icon="Refresh"
              :disabled="!source.enabled"
              :loading="syncMutation.isPending.value"
              @click="synchronize(source)"
              >立即同步</el-button
            ><el-dropdown
              ><el-button :icon="SetUp">管理</el-button
              ><template #dropdown
                ><el-dropdown-menu
                  ><el-dropdown-item @click="openRuns(source)">同步记录</el-dropdown-item
                  ><el-dropdown-item @click="toggleSource(source)">{{
                    source.enabled ? '停用' : '启用'
                  }}</el-dropdown-item
                  ><el-dropdown-item divided :icon="Delete" @click="removeSource(source)"
                    >移除配置</el-dropdown-item
                  ></el-dropdown-menu
                ></template
              ></el-dropdown
            >
          </div>
        </article>
      </div>
    </section>

      <el-alert
        title="安全边界"
        description="只读取服务端允许根目录内的 TXT、Markdown、PDF、Word 和 Excel；忽略符号链接，不保存连接器密钥，不接受浏览器任意路径。目录同步使用后端配置的允许根目录，不是你当前 Mac 浏览器的任意文件夹。"
      type="info"
      :closable="false"
      show-icon
    />

    <el-dialog v-model="dialogVisible" title="添加目录文档源" width="min(560px, 94vw)">
      <el-form label-position="top"
        ><el-form-item
          ><template #label>文档源名称 <el-tooltip content="给这组同步配置起一个容易识别的名称，例如公司制度共享盘；不会改变文件内容。"><el-icon><QuestionFilled /></el-icon></el-tooltip></template
          ><el-input
            v-model="form.name"
            maxlength="100"
            placeholder="例如：公司制度共享盘" /></el-form-item
        ><el-form-item
          ><template #label>服务端目录路径 <el-tooltip content="填写后端服务器或 Docker 挂载环境中的目录，不是浏览器所在电脑的路径；目录必须位于后端允许根目录内。"><el-icon><QuestionFilled /></el-icon></el-tooltip></template
          ><el-input
            v-model="form.rootPath"
            maxlength="500"
            placeholder="例如：D:\enterprise-docs\policies"
          /><small class="document-source-hint"
            >该路径必须位于后端已配置的允许根目录中。</small
          ></el-form-item
        ><el-form-item
          ><el-checkbox v-model="form.recursive">同步所有子目录</el-checkbox><small class="document-source-hint">开启后会递归读取目录下的子文件夹；文件数量较多时首次同步会更久。</small></el-form-item
        ></el-form
      >
      <template #footer
        ><el-button @click="dialogVisible = false">取消</el-button
        ><el-button
          type="primary"
          :icon="Connection"
          :disabled="!form.name.trim() || !form.rootPath.trim()"
          :loading="createMutation.isPending.value"
          @click="createSource"
          >创建文档源</el-button
        ></template
      >
    </el-dialog>

    <el-drawer
      v-model="runsDrawerVisible"
      :title="`${activeSource?.name ?? ''} · 同步记录`"
      size="min(720px, 96vw)"
    >
      <div v-loading="runsQuery.isLoading.value" class="document-sync-runs">
        <el-empty v-if="!runsQuery.data.value?.length" description="暂无同步记录" />
        <article v-for="run in runsQuery.data.value ?? []" :key="run.id">
          <header>
            <el-tag :type="statusType(run.status)">{{ statusLabel(run.status) }}</el-tag
            ><span>{{ formatDate(run.startedAt) }}</span>
          </header>
          <div>
            <span
              >发现 <b>{{ run.summary.discovered }}</b></span
            ><span
              >新增 <b>{{ run.summary.created }}</b></span
            ><span
              >更新 <b>{{ run.summary.updated }}</b></span
            ><span
              >未变化 <b>{{ run.summary.unchanged }}</b></span
            ><span
              >源端缺失 <b>{{ run.summary.missing }}</b></span
            ><span
              >失败 <b>{{ run.summary.failed }}</b></span
            >
          </div>
          <details v-if="run.errors.length">
            <summary>查看失败明细</summary>
            <p v-for="error in run.errors" :key="`${error.externalId}-${error.code}`">
              {{ error.externalId || '数据源' }}：{{ error.code }}
            </p>
          </details>
        </article>
      </div>
    </el-drawer>
  </div>
</template>
