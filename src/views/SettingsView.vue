<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query'
import { ElMessage } from 'element-plus'
import {
  CircleCheck,
  Clock,
  Cpu,
  DataAnalysis,
  Edit,
  Files,
  Lock,
  Refresh,
  Right,
  Search,
  Setting,
} from '@element-plus/icons-vue'

import { ApiError } from '@/services/api/client'
import { providerLabel } from '@/services/ai-usage'
import {
  getSystemConfiguration,
  getSystemConfigurationHistory,
  updateSystemConfiguration,
} from '@/services/api/system-configuration'

const queryClient = useQueryClient()
const editVisible = ref(false)
const editForm = reactive({
  aiDefaultModelId: '',
  ragPromptVersion: '',
})

const configurationQuery = useQuery({
  queryKey: ['system-configuration'],
  queryFn: getSystemConfiguration,
  staleTime: 30_000,
})

const historyQuery = useQuery({
  queryKey: ['system-configuration-history'],
  queryFn: () => getSystemConfigurationHistory(20),
  staleTime: 30_000,
})

const configuration = computed(() => configurationQuery.data.value)
const configurationHistory = computed(() => historyQuery.data.value?.items ?? [])
const enabledModels = computed(
  () => configuration.value?.ai.models.filter((model) => model.enabled) ?? [],
)
const configurableModels = computed(() =>
  enabledModels.value.filter((model) => model.credentialConfigured && model.model !== null),
)

const updateMutation = useMutation({
  mutationFn: updateSystemConfiguration,
})

const summaryCards = computed(() => {
  const value = configuration.value
  if (!value) return []
  const defaultModel = value.ai.models.find((model) => model.isDefault)
  return [
    {
      label: '生成模型',
      value: value.ai.defaultModelId,
      detail: `${providerLabel(defaultModel?.provider ?? value.ai.provider)} · ${value.ai.enabled ? '服务已启用' : '服务未启用'}`,
      icon: Cpu,
      ready: value.ai.enabled && value.ai.credentialConfigured,
    },
    {
      label: '检索链路',
      value: retrievalModeLabel(value.retrieval.mode),
      detail: `${value.retrieval.driver} · ${value.retrieval.rerankEnabled ? '重排开启' : '重排关闭'}`,
      icon: Search,
      ready: value.retrieval.driver === 'pgvector',
    },
    {
      label: 'Prompt 版本',
      value: value.rag.promptVersion,
      detail: `结构化回答${value.rag.structuredResponseEnabled ? '已开启' : '已关闭'}`,
      icon: Setting,
      ready: value.rag.structuredResponseEnabled,
    },
    {
      label: '后台任务',
      value:
        value.documents.pipelineWorkerEnabled && value.evaluation.workerEnabled
          ? '全部运行中'
          : '部分未启用',
      detail: `文档处理 · 评测执行`,
      icon: DataAnalysis,
      ready: value.documents.pipelineWorkerEnabled && value.evaluation.workerEnabled,
    },
  ]
})

function getErrorMessage(error: unknown): string {
  return error instanceof ApiError ? error.message : '系统配置加载失败，请稍后重试'
}

function openEditor(): void {
  const value = configuration.value
  if (!value) return
  editForm.aiDefaultModelId = value.pending?.aiDefaultModelId ?? value.ai.defaultModelId
  editForm.ragPromptVersion = value.pending?.ragPromptVersion ?? value.rag.promptVersion
  editVisible.value = true
}

async function saveConfiguration(): Promise<void> {
  const value = configuration.value
  if (!value) return

  const promptVersion = editForm.ragPromptVersion.trim()
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,99}$/.test(promptVersion)) {
    ElMessage.warning('Prompt 版本格式无效')
    return
  }

  try {
    const updated = await updateMutation.mutateAsync({
      revision: value.policy.currentRevision,
      aiDefaultModelId: editForm.aiDefaultModelId,
      ragPromptVersion: promptVersion,
    })
    queryClient.setQueryData(['system-configuration'], updated)
    await queryClient.invalidateQueries({ queryKey: ['system-configuration-history'] })
    editVisible.value = false
    ElMessage.success('配置已保存，将在后端重启后生效')
  } catch (error) {
    if (error instanceof ApiError && error.status === 409) {
      await configurationQuery.refetch()
    }
    ElMessage.error(error instanceof ApiError ? error.message : '系统配置保存失败，请稍后重试')
  }
}

function booleanText(value: boolean): string {
  return value ? '已开启' : '已关闭'
}

function booleanType(value: boolean): 'success' | 'info' {
  return value ? 'success' : 'info'
}

function retrievalModeLabel(value: string): string {
  return { vector: '向量检索', keyword: '关键词检索', hybrid: '混合检索' }[value] ?? value
}

function bytesToMb(value: number): string {
  return `${Math.round(value / 1024 / 1024)} MB`
}

function milliseconds(value: number): string {
  return value >= 1000 ? `${value / 1000} 秒` : `${value} ms`
}

function formatCapturedAt(value: string): string {
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(new Date(value))
}

function historyActorName(actor: { name: string | null; email: string } | null): string {
  return actor?.name ?? actor?.email ?? '已删除用户'
}

function historyActorDetail(actor: { name: string | null; email: string } | null): string | null {
  return actor?.name ? actor.email : null
}

async function refreshConfiguration(): Promise<void> {
  await Promise.all([configurationQuery.refetch(), historyQuery.refetch()])
}
</script>

<template>
  <div class="settings-page">
    <section class="settings-hero">
      <div>
        <span class="eyebrow">SYSTEM CONFIGURATION</span>
        <h2>系统配置</h2>
        <p>查看当前后端实际生效的模型、检索、Prompt、文档处理和评测运行参数。</p>
      </div>
      <div class="settings-snapshot">
        <span>配置快照</span>
        <strong v-if="configuration">{{ formatCapturedAt(configuration.capturedAt) }}</strong>
        <strong v-else>正在读取</strong>
        <el-button
          :icon="Edit"
          :disabled="!configuration?.policy.mutationAllowed"
          :title="configuration?.policy.mutationAllowed ? '编辑配置' : '仅组织所有者或管理员可修改'"
          @click="openEditor"
          >编辑配置</el-button
        >
        <el-button
          :icon="Refresh"
          :loading="configurationQuery.isFetching.value || historyQuery.isFetching.value"
          @click="refreshConfiguration"
          >刷新快照</el-button
        >
      </div>
    </section>

    <el-alert
      title="配置由环境基线与数据库覆盖共同管理"
      description="默认模型和 Prompt 版本可在本页修改，并在后端重启后统一生效。密码、令牌、数据库地址和服务端点仍由部署环境管理，且不会通过接口返回。"
      type="info"
      show-icon
      :closable="false"
    />

    <el-alert
      v-if="configuration?.pending"
      :title="`配置 revision ${configuration.pending.revision} 等待生效`"
      :description="`默认模型将切换为 ${configuration.pending.aiDefaultModelId}，Prompt 版本将切换为 ${configuration.pending.ragPromptVersion}。保存时间：${formatCapturedAt(configuration.pending.updatedAt)}`"
      type="warning"
      show-icon
      :closable="false"
    />

    <el-alert
      v-if="configurationQuery.isError.value"
      title="无法读取系统配置"
      :description="getErrorMessage(configurationQuery.error.value)"
      type="error"
      show-icon
      :closable="false"
    />

    <div v-if="configurationQuery.isLoading.value" v-loading="true" class="settings-loading" />

    <template v-else-if="configuration">
      <section class="settings-summary-grid">
        <article v-for="item in summaryCards" :key="item.label">
          <div class="settings-summary-icon">
            <el-icon><component :is="item.icon" /></el-icon>
          </div>
          <div>
            <span>{{ item.label }}</span>
            <strong>{{ item.value }}</strong>
            <small>{{ item.detail }}</small>
          </div>
          <el-icon :class="{ ready: item.ready }"><CircleCheck /></el-icon>
        </article>
      </section>

      <section class="settings-main-grid">
        <article class="settings-panel">
          <header>
            <div class="settings-panel-icon purple">
              <el-icon><Cpu /></el-icon>
            </div>
            <div>
              <h3>模型与调用限制</h3>
              <p>生成、向量化和用户级调用保护</p>
            </div>
            <el-tag :type="booleanType(configuration.ai.enabled)" effect="light">{{
              booleanText(configuration.ai.enabled)
            }}</el-tag>
          </header>
          <div class="settings-row">
            <span>模型提供方</span><strong>{{ configuration.ai.provider }}</strong>
          </div>
          <div class="settings-row">
            <span>默认生成模型</span
            ><strong>{{ configuration.ai.defaultModel ?? '未配置' }}</strong>
          </div>
          <div class="settings-row settings-models-row">
            <span>启用模型</span>
            <div class="settings-models">
              <el-tag
                v-for="model in enabledModels"
                :key="model.id"
                :type="model.isDefault ? 'success' : 'info'"
                effect="plain"
              >
                {{ providerLabel(model.provider) }} · {{ model.model ?? '模型名未配置' }}
                {{ model.isDefault ? '（默认）' : '' }} ·
                {{ model.credentialConfigured ? '凭据已配置' : '凭据未配置' }}
              </el-tag>
              <span v-if="enabledModels.length === 0">暂无启用模型</span>
            </div>
          </div>
          <div class="settings-row">
            <span>访问凭据</span
            ><el-tag
              :type="configuration.ai.credentialConfigured ? 'success' : 'warning'"
              size="small"
              >{{ configuration.ai.credentialConfigured ? '已安全配置' : '未配置' }}</el-tag
            >
          </div>
          <div class="settings-row">
            <span>向量模型</span><strong>{{ configuration.ai.embeddingModel }}</strong>
          </div>
          <div class="settings-row">
            <span>向量维度 / 批量</span
            ><strong
              >{{ configuration.ai.embeddingDimensions }} /
              {{ configuration.ai.embeddingBatchSize }}</strong
            >
          </div>
          <div class="settings-row">
            <span>超时 / 重试</span
            ><strong
              >{{ milliseconds(configuration.ai.requestTimeoutMs) }} /
              {{ configuration.ai.maxRetries }} 次</strong
            >
          </div>
          <div class="settings-row">
            <span>用户调用限制</span
            ><strong
              >{{ configuration.ai.userRateLimit }} 次 /
              {{ configuration.ai.rateLimitWindowSeconds }} 秒</strong
            >
          </div>
        </article>

        <article class="settings-panel">
          <header>
            <div class="settings-panel-icon blue">
              <el-icon><Search /></el-icon>
            </div>
            <div>
              <h3>检索与证据门槛</h3>
              <p>召回、融合、重排与可回答性判断</p>
            </div>
            <el-tag effect="light">{{ retrievalModeLabel(configuration.retrieval.mode) }}</el-tag>
          </header>
          <div class="settings-row">
            <span>检索驱动</span><strong>{{ configuration.retrieval.driver }}</strong>
          </div>
          <div class="settings-row">
            <span>关键词候选倍数</span
            ><strong>{{ configuration.retrieval.keywordCandidateMultiplier }}×</strong>
          </div>
          <div class="settings-row">
            <span>关键词最低分</span
            ><strong>{{ configuration.retrieval.keywordMinimumScore }}</strong>
          </div>
          <div class="settings-row">
            <span>RRF 常量</span><strong>{{ configuration.retrieval.rrfK }}</strong>
          </div>
          <div class="settings-row">
            <span>重排 / 候选倍数</span
            ><strong
              >{{ booleanText(configuration.retrieval.rerankEnabled) }} /
              {{ configuration.retrieval.rerankCandidateMultiplier }}×</strong
            >
          </div>
          <div class="settings-row">
            <span>最低 / 强证据分</span
            ><strong
              >{{ configuration.retrieval.minimumEvidenceScore }} /
              {{ configuration.retrieval.strongEvidenceScore }}</strong
            >
          </div>
          <div class="settings-row">
            <span>AI 查询改写 / 可回答性</span
            ><strong
              >{{ booleanText(configuration.retrieval.queryRewriteAiEnabled) }} /
              {{ booleanText(configuration.retrieval.answerabilityAiEnabled) }}</strong
            >
          </div>
        </article>

        <article class="settings-panel">
          <header>
            <div class="settings-panel-icon orange">
              <el-icon><Setting /></el-icon>
            </div>
            <div>
              <h3>Prompt 与回答策略</h3>
              <p>结构化回答、引用、安全和冲突控制</p>
            </div>
            <el-tag type="warning" effect="light">{{ configuration.rag.promptVersion }}</el-tag>
          </header>
          <div class="settings-row">
            <span>结构化回答</span
            ><el-tag
              :type="booleanType(configuration.rag.structuredResponseEnabled)"
              size="small"
              >{{ booleanText(configuration.rag.structuredResponseEnabled) }}</el-tag
            >
          </div>
          <div class="settings-row">
            <span>推理强度</span><strong>{{ configuration.rag.reasoningEffort }}</strong>
          </div>
          <div class="settings-row">
            <span>客服安全规则 / AI 辅助</span
            ><strong
              >{{ booleanText(configuration.rag.customerSafetyEnabled) }} /
              {{ booleanText(configuration.rag.customerSafetyAiEnabled) }}</strong
            >
          </div>
          <div class="settings-row">
            <span>引用摘录</span
            ><strong
              >{{ booleanText(configuration.rag.citationExcerptEnabled) }} · 最多
              {{ configuration.rag.citationExcerptMaxChars }} 字</strong
            >
          </div>
          <div class="settings-row">
            <span>冲突检测 / AI 辅助</span
            ><strong
              >{{ booleanText(configuration.rag.conflictDetectionEnabled) }} /
              {{ booleanText(configuration.rag.conflictDetectionAiEnabled) }}</strong
            >
          </div>
          <div class="settings-row">
            <span>多轮查询改写</span
            ><strong
              >{{ booleanText(configuration.rag.multiTurnQueryRewriteEnabled) }} ·
              {{ configuration.rag.multiTurnHistoryMessageLimit }} 条上下文</strong
            >
          </div>
        </article>

        <article class="settings-panel">
          <header>
            <div class="settings-panel-icon green">
              <el-icon><Files /></el-icon>
            </div>
            <div>
              <h3>文档处理</h3>
              <p>存储、上传、切片、OCR 与任务恢复</p>
            </div>
            <el-tag type="success" effect="light">{{
              configuration.documents.storageDriver
            }}</el-tag>
          </header>
          <div class="settings-row">
            <span>单文件 / 批次上限</span
            ><strong
              >{{ bytesToMb(configuration.documents.maxFileSizeBytes) }} /
              {{ bytesToMb(configuration.documents.batchMaxTotalSizeBytes) }}</strong
            >
          </div>
          <div class="settings-row">
            <span>单批文件数</span><strong>{{ configuration.documents.batchMaxFiles }}</strong>
          </div>
          <div class="settings-row extensions-row">
            <span>允许格式</span>
            <div>
              <code v-for="item in configuration.documents.allowedExtensions" :key="item">{{
                item
              }}</code>
            </div>
          </div>
          <div class="settings-row">
            <span>切片 / 重叠字符</span
            ><strong
              >{{ configuration.documents.chunkSizeChars }} /
              {{ configuration.documents.chunkOverlapChars }}</strong
            >
          </div>
          <div class="settings-row">
            <span>处理超时</span
            ><strong>{{ milliseconds(configuration.documents.processingTimeoutMs) }}</strong>
          </div>
          <div class="settings-row">
            <span>OCR</span
            ><strong
              >{{ booleanText(configuration.documents.ocrEnabled)
              }}<template v-if="configuration.documents.ocrModel">
                · {{ configuration.documents.ocrModel }}</template
              ></strong
            >
          </div>
          <div class="settings-row">
            <span>处理任务 / 自动恢复</span
            ><strong
              >{{ booleanText(configuration.documents.pipelineWorkerEnabled) }} /
              {{ booleanText(configuration.documents.pipelineRecoveryEnabled) }}</strong
            >
          </div>
        </article>
      </section>

      <section class="settings-operations">
        <div class="settings-operation-head">
          <div>
            <el-icon><DataAnalysis /></el-icon>
          </div>
          <div>
            <h3>评测执行与运行环境</h3>
            <p>后台执行器状态和当前服务入口</p>
          </div>
        </div>
        <div class="settings-operation-grid">
          <div>
            <span>评测执行器</span
            ><strong>{{ booleanText(configuration.evaluation.workerEnabled) }}</strong
            ><small>{{ configuration.evaluation.pollingIntervalMs }} ms 轮询</small>
          </div>
          <div>
            <span>评测套件上限</span
            ><strong>{{ configuration.evaluation.maxCasesPerSuite }} 题</strong
            ><small>失败最多 {{ configuration.evaluation.maxAttempts }} 次</small>
          </div>
          <div>
            <span>单题超时</span
            ><strong>{{ milliseconds(configuration.evaluation.caseTimeoutMs) }}</strong
            ><small>真实问答链路</small>
          </div>
          <div>
            <span>运行环境</span><strong>{{ configuration.runtime.environment }}</strong
            ><small
              >{{ configuration.runtime.applicationName }} : {{ configuration.runtime.port }}</small
            >
          </div>
        </div>
      </section>

      <section class="settings-history" aria-labelledby="settings-history-title">
        <header class="settings-history-head">
          <div class="settings-history-title">
            <div>
              <el-icon><Clock /></el-icon>
            </div>
            <div>
              <h3 id="settings-history-title">配置变更历史</h3>
              <p>最近 20 次受管配置修改，按 revision 从新到旧排列</p>
            </div>
          </div>
          <el-button
            :icon="Refresh"
            :loading="historyQuery.isFetching.value"
            @click="historyQuery.refetch()"
            >刷新记录</el-button
          >
        </header>

        <el-alert
          v-if="historyQuery.isError.value"
          title="无法读取配置变更历史"
          :description="getErrorMessage(historyQuery.error.value)"
          type="error"
          show-icon
          :closable="false"
        />
        <div
          v-else-if="historyQuery.isLoading.value"
          v-loading="true"
          class="settings-history-loading"
        />
        <el-empty
          v-else-if="configurationHistory.length === 0"
          description="暂无配置变更记录"
          :image-size="72"
        />
        <ol v-else class="settings-history-list">
          <li v-for="item in configurationHistory" :key="item.id">
            <div class="settings-history-meta">
              <el-tag size="small" effect="plain">revision {{ item.revision }}</el-tag>
              <strong>{{ historyActorName(item.actor) }}</strong>
              <span v-if="historyActorDetail(item.actor)">{{
                historyActorDetail(item.actor)
              }}</span>
              <time :datetime="item.createdAt">{{ formatCapturedAt(item.createdAt) }}</time>
            </div>
            <div class="settings-history-changes">
              <div v-if="item.changes.aiDefaultModelId">
                <span>默认模型</span>
                <code>{{ item.changes.aiDefaultModelId.before }}</code>
                <el-icon><Right /></el-icon>
                <code>{{ item.changes.aiDefaultModelId.after }}</code>
              </div>
              <div v-if="item.changes.ragPromptVersion">
                <span>Prompt 版本</span>
                <code>{{ item.changes.ragPromptVersion.before }}</code>
                <el-icon><Right /></el-icon>
                <code>{{ item.changes.ragPromptVersion.after }}</code>
              </div>
            </div>
          </li>
        </ol>
      </section>

      <section class="settings-security-note">
        <div>
          <el-icon><Lock /></el-icon>
        </div>
        <div>
          <strong>敏感信息保护已生效</strong>
          <p>接口只返回凭据是否已配置，不返回任何密钥内容、连接地址或本地文件路径。</p>
        </div>
        <el-tag type="success" effect="dark">零密钥回显</el-tag>
      </section>
    </template>

    <el-dialog v-model="editVisible" title="编辑系统配置" width="min(520px, calc(100vw - 32px))">
      <el-form label-position="top">
        <el-form-item label="默认生成模型" required>
          <el-select v-model="editForm.aiDefaultModelId" style="width: 100%">
            <el-option
              v-for="model in configurableModels"
              :key="model.id"
              :label="`${providerLabel(model.provider)} · ${model.model}`"
              :value="model.id"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="Prompt 版本" required>
          <el-input
            v-model="editForm.ragPromptVersion"
            maxlength="100"
            placeholder="rag-structured-response-2.0"
          />
        </el-form-item>
        <el-alert
          title="保存后不会立即切换运行配置"
          description="请在维护窗口重启全部后端实例，使同一 revision 在所有实例统一生效。"
          type="warning"
          show-icon
          :closable="false"
        />
      </el-form>
      <template #footer>
        <el-button @click="editVisible = false">取消</el-button>
        <el-button
          type="primary"
          :loading="updateMutation.isPending.value"
          :disabled="configurableModels.length === 0"
          @click="saveConfiguration"
          >保存配置</el-button
        >
      </template>
    </el-dialog>
  </div>
</template>
