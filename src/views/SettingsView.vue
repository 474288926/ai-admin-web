<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  CircleCheck,
  Clock,
  Cpu,
  DataAnalysis,
  Edit,
  Files,
  Lock,
  Refresh,
  RefreshLeft,
  Right,
  QuestionFilled,
  Search,
  Setting,
} from '@element-plus/icons-vue'

import { ApiError } from '@/services/api/client'
import { providerLabel } from '@/services/ai-usage'
import {
  getSystemConfiguration,
  getSystemConfigurationHistory,
  rollbackSystemConfiguration,
  updateSystemConfiguration,
} from '@/services/api/system-configuration'

const queryClient = useQueryClient()
const editVisible = ref(false)
const rollbackTargetRevision = ref<number | null>(null)
const editForm = reactive({
  aiDefaultModelId: '',
  ragPromptVersion: '',
  aiMaxOutputTokens: 2048,
  aiContextMessageLimit: 20,
  retrievalMinimumSimilarity: 0.2,
  retrievalKeywordMinimumScore: 0.1,
  rerankMinimumEvidenceScore: 0.3,
  rerankStrongEvidenceScore: 0.65,
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

const configurationDescriptions: Record<string, string> = {
  defaultModel:
    '默认生成模型是系统回答问题时优先使用的文字模型。只能选择已启用且已配置凭据的模型，切换后建议重新运行评测。',
  prompt:
    'Prompt 版本是一套固定的回答规则，决定模型如何组织答案、引用证据和处理拒答。修改后应重新验证关键问题。',
  provider:
    '模型提供方是实际提供文字生成或向量服务的平台，例如 OpenAI、千问。切换前必须确认对应模型和密钥已经配置。',
  embedding:
    '向量模型把文档和问题转换成可比较的数字特征，用于语义检索。更换模型通常需要重新处理文档，不能只改名称。',
  embeddingDimensions:
    '向量维度是每条数字特征的长度，必须和数据库向量字段一致；改错会导致文档入库或检索失败。',
  embeddingBatch:
    '一次发送给模型的文本条数。调大通常更快，但会占用更多内存，也可能触发服务商限流。',
  timeout:
    '系统等待模型返回的最长时间。调大能减少慢请求失败，但用户需要等待更久；调小会更快失败。',
  outputTokens:
    '模型一次最多生成多少词元，中文可粗略理解为文字容量。过小会截断答案，过大则增加耗时和费用。',
  context:
    '回答时带入的历史消息数量。越大越能记住上下文，但会增加模型输入长度、耗时和费用。',
  rateLimit:
    '同一用户在一段时间内最多能调用 AI 的次数，用于防止误操作、程序循环或高额费用。',
  retrievalMode:
    '向量检索理解相近意思，关键词检索擅长产品型号和错误码，混合检索同时使用两者，通常更稳妥。',
  candidateMultiplier:
    '先多找一些候选文档，再筛选最相关内容。调大可能提高召回，但会增加数据库查询和后续处理时间。',
  similarity:
    '向量结果与问题的相似程度门槛。调高会更严格、减少无关内容，也可能漏掉表达不同但正确的文档。',
  keywordScore:
    '关键词匹配的最低分数。调高能减少错误码或型号不匹配的结果，调低则更容易召回相关变体。',
  rrf:
    '混合检索合并多种排序结果时的平滑常量，主要影响不同检索方式之间的权重，通常不建议随意修改。',
  evidence:
    '证据分决定检索内容是否足以支持回答。最低证据分是放行线，强证据分是“非常确定”标记，强证据分必须更高。',
  rerank:
    '重排会对初步召回结果再次排序并过滤证据不足的内容，关闭后结果更快但更容易混入无关片段。',
  structured:
    '结构化回答要求模型按固定字段返回答案、步骤、引用和拒答原因，便于系统校验和稳定展示。',
  reasoning:
    '推理强度影响模型思考深度。提高可能改善复杂问题，但会增加响应时间和费用；普通问答通常使用 minimal。',
  safety:
    '客服安全规则用于拦截价格承诺、交付承诺、赔偿和兼容性保证等高风险表达，建议保持开启。',
  citation:
    '引用摘录是回答中展示的原文证据片段。字数过小不易核对，过大则会让页面和回答变长。',
  conflict:
    '冲突检测用于发现不同文档对版本、数值或步骤的说法不一致，发现冲突时系统会要求人工确认。',
  multiturn:
    '多轮查询改写会把“那它呢”这类追问补全成独立问题。上下文条数越多，理解连续对话越好，但成本越高。',
  chunk:
    '切片是把长文档拆成检索片段。切片太大不易精准命中，太小会丢失上下文；重叠字符用于连接相邻片段。',
  ocr:
    'OCR 把扫描 PDF 的图片识别成文字，需要视觉模型并会产生额外费用；普通可复制文字 PDF 不需要开启。',
  pipeline:
    '文档处理 Worker 负责后台解析、切片和向量化。关闭后任务会停留在队列中，上传接口本身仍可能成功。',
  evaluation:
    '评测 Worker 负责后台逐题执行回答评测。单题超时和重试次数决定评测耗时，也会影响模型调用量。',
}

function configurationDescription(key: string): string {
  return configurationDescriptions[key] ?? ''
}

const updateMutation = useMutation({
  mutationFn: updateSystemConfiguration,
})

const rollbackMutation = useMutation({
  mutationFn: rollbackSystemConfiguration,
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
  editForm.aiMaxOutputTokens = value.pending?.aiMaxOutputTokens ?? value.ai.maxOutputTokens
  editForm.aiContextMessageLimit =
    value.pending?.aiContextMessageLimit ?? value.ai.contextMessageLimit
  editForm.retrievalMinimumSimilarity =
    value.pending?.retrievalMinimumSimilarity ?? value.retrieval.minimumSimilarity
  editForm.retrievalKeywordMinimumScore =
    value.pending?.retrievalKeywordMinimumScore ?? value.retrieval.keywordMinimumScore
  editForm.rerankMinimumEvidenceScore =
    value.pending?.rerankMinimumEvidenceScore ?? value.retrieval.minimumEvidenceScore
  editForm.rerankStrongEvidenceScore =
    value.pending?.rerankStrongEvidenceScore ?? value.retrieval.strongEvidenceScore
  editVisible.value = true
}

async function saveConfiguration(): Promise<void> {
  const value = configuration.value
  if (!value) return

  const promptVersion = editForm.ragPromptVersion.trim()
  if (!value.rag.availablePromptVersions.some((prompt) => prompt.id === promptVersion)) {
    ElMessage.warning('Prompt 版本格式无效')
    return
  }
  if (
    !Number.isInteger(editForm.aiMaxOutputTokens) ||
    editForm.aiMaxOutputTokens < 1 ||
    editForm.aiMaxOutputTokens > 32768 ||
    !Number.isInteger(editForm.aiContextMessageLimit) ||
    editForm.aiContextMessageLimit < 1 ||
    editForm.aiContextMessageLimit > 200
  ) {
    ElMessage.warning('Token 与上下文消息数必须是有效整数')
    return
  }
  if (editForm.retrievalMinimumSimilarity < -1 || editForm.retrievalMinimumSimilarity > 1) {
    ElMessage.warning('向量最低相似度必须在 -1 到 1 之间')
    return
  }
  if (
    editForm.retrievalKeywordMinimumScore < 0 ||
    editForm.retrievalKeywordMinimumScore > 1 ||
    editForm.rerankMinimumEvidenceScore < 0 ||
    editForm.rerankMinimumEvidenceScore > 1 ||
    editForm.rerankStrongEvidenceScore < 0 ||
    editForm.rerankStrongEvidenceScore > 1
  ) {
    ElMessage.warning('检索与证据分必须在 0 到 1 之间')
    return
  }
  if (editForm.rerankStrongEvidenceScore <= editForm.rerankMinimumEvidenceScore) {
    ElMessage.warning('强证据分必须高于最低证据分')
    return
  }

  try {
    const updated = await updateMutation.mutateAsync({
      revision: value.policy.currentRevision,
      aiDefaultModelId: editForm.aiDefaultModelId,
      ragPromptVersion: promptVersion,
      aiMaxOutputTokens: editForm.aiMaxOutputTokens,
      aiContextMessageLimit: editForm.aiContextMessageLimit,
      retrievalMinimumSimilarity: editForm.retrievalMinimumSimilarity,
      retrievalKeywordMinimumScore: editForm.retrievalKeywordMinimumScore,
      rerankMinimumEvidenceScore: editForm.rerankMinimumEvidenceScore,
      rerankStrongEvidenceScore: editForm.rerankStrongEvidenceScore,
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

async function rollbackToRevision(targetRevision: number): Promise<void> {
  const value = configuration.value
  if (!value?.policy.mutationAllowed) return

  try {
    await ElMessageBox.confirm(
      `系统将创建新的 revision，并恢复 revision ${targetRevision} 当时的全部受管配置。全部后端实例仍需重启后生效。`,
      `确认恢复到 revision ${targetRevision}`,
      {
        type: 'warning',
        confirmButtonText: '确认恢复',
        cancelButtonText: '取消',
      },
    )
    rollbackTargetRevision.value = targetRevision
    const updated = await rollbackMutation.mutateAsync({
      revision: value.policy.currentRevision,
      targetRevision,
    })
    queryClient.setQueryData(['system-configuration'], updated)
    await queryClient.invalidateQueries({ queryKey: ['system-configuration-history'] })
    ElMessage.success(`已创建回滚 revision ${updated.policy.currentRevision}`)
  } catch (error) {
    if (error === 'cancel' || error === 'close') return
    if (error instanceof ApiError && error.status === 409) {
      await refreshConfiguration()
    }
    ElMessage.error(error instanceof ApiError ? error.message : '系统配置回滚失败，请稍后重试')
  } finally {
    rollbackTargetRevision.value = null
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

function pendingDescription(): string {
  const pending = configuration.value?.pending
  if (!pending) return ''
  return `默认模型 ${pending.aiDefaultModelId}，Prompt ${pending.ragPromptVersion}，输出 ${pending.aiMaxOutputTokens} Token，上下文 ${pending.aiContextMessageLimit} 条。保存时间：${formatCapturedAt(pending.updatedAt)}`
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
      description="模型、Prompt、生成限制与检索证据门槛可在本页修改，并在后端重启后统一生效。密码、令牌、数据库地址和服务端点仍由部署环境管理，且不会通过接口返回。"
      type="info"
      show-icon
      :closable="false"
    />

    <el-alert
      v-if="configuration?.pending"
      :title="`配置 revision ${configuration.pending.revision} 等待生效`"
      :description="pendingDescription()"
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
            <span>模型提供方 <el-tooltip :content="configurationDescription('provider')"><el-icon><QuestionFilled /></el-icon></el-tooltip></span><strong>{{ configuration.ai.provider }}</strong>
          </div>
          <div class="settings-row">
            <span>默认生成模型 <el-tooltip :content="configurationDescription('defaultModel')"><el-icon><QuestionFilled /></el-icon></el-tooltip></span
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
            <span>向量模型 <el-tooltip :content="configurationDescription('embedding')"><el-icon><QuestionFilled /></el-icon></el-tooltip></span><strong>{{ configuration.ai.embeddingModel }}</strong>
          </div>
          <div class="settings-row">
            <span>向量维度 / 批量 <el-tooltip :content="`${configurationDescription('embeddingDimensions')} ${configurationDescription('embeddingBatch')}`"><el-icon><QuestionFilled /></el-icon></el-tooltip></span
            ><strong
              >{{ configuration.ai.embeddingDimensions }} /
              {{ configuration.ai.embeddingBatchSize }}</strong
            >
          </div>
          <div class="settings-row">
            <span>超时 / 重试 <el-tooltip :content="configurationDescription('timeout')"><el-icon><QuestionFilled /></el-icon></el-tooltip></span
            ><strong
              >{{ milliseconds(configuration.ai.requestTimeoutMs) }} /
              {{ configuration.ai.maxRetries }} 次</strong
            >
          </div>
          <div class="settings-row">
            <span>输出 Token / 上下文 <el-tooltip :content="`${configurationDescription('outputTokens')} ${configurationDescription('context')}`"><el-icon><QuestionFilled /></el-icon></el-tooltip></span
            ><strong
              >{{ configuration.ai.maxOutputTokens }} /
              {{ configuration.ai.contextMessageLimit }} 条</strong
            >
          </div>
          <div class="settings-row">
            <span>用户调用限制 <el-tooltip :content="configurationDescription('rateLimit')"><el-icon><QuestionFilled /></el-icon></el-tooltip></span
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
            <span>检索驱动 <el-tooltip content="memory 适合小规模临时测试；pgvector 使用 PostgreSQL 向量索引，适合长期运行。"><el-icon><QuestionFilled /></el-icon></el-tooltip></span><strong>{{ configuration.retrieval.driver }}</strong>
          </div>
          <div class="settings-row">
            <span>关键词候选倍数 <el-tooltip :content="configurationDescription('candidateMultiplier')"><el-icon><QuestionFilled /></el-icon></el-tooltip></span
            ><strong>{{ configuration.retrieval.keywordCandidateMultiplier }}×</strong>
          </div>
          <div class="settings-row">
            <span>向量最低相似度 <el-tooltip :content="configurationDescription('similarity')"><el-icon><QuestionFilled /></el-icon></el-tooltip></span
            ><strong>{{ configuration.retrieval.minimumSimilarity }}</strong>
          </div>
          <div class="settings-row">
            <span>关键词最低分 <el-tooltip :content="configurationDescription('keywordScore')"><el-icon><QuestionFilled /></el-icon></el-tooltip></span
            ><strong>{{ configuration.retrieval.keywordMinimumScore }}</strong>
          </div>
          <div class="settings-row">
            <span>RRF 常量 <el-tooltip :content="configurationDescription('rrf')"><el-icon><QuestionFilled /></el-icon></el-tooltip></span><strong>{{ configuration.retrieval.rrfK }}</strong>
          </div>
          <div class="settings-row">
            <span>重排 / 候选倍数 <el-tooltip :content="configurationDescription('rerank')"><el-icon><QuestionFilled /></el-icon></el-tooltip></span
            ><strong
              >{{ booleanText(configuration.retrieval.rerankEnabled) }} /
              {{ configuration.retrieval.rerankCandidateMultiplier }}×</strong
            >
          </div>
          <div class="settings-row">
            <span>最低 / 强证据分 <el-tooltip :content="configurationDescription('evidence')"><el-icon><QuestionFilled /></el-icon></el-tooltip></span
            ><strong
              >{{ configuration.retrieval.minimumEvidenceScore }} /
              {{ configuration.retrieval.strongEvidenceScore }}</strong
            >
          </div>
          <div class="settings-row">
            <span>AI 查询改写 / 可回答性 <el-tooltip content="查询改写会把口语问题整理成更适合检索的表达；可回答性会判断证据是否足以回答。开启 AI 辅助会增加模型调用和费用。"><el-icon><QuestionFilled /></el-icon></el-tooltip></span
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
            <span>结构化回答 <el-tooltip :content="configurationDescription('structured')"><el-icon><QuestionFilled /></el-icon></el-tooltip></span
            ><el-tag
              :type="booleanType(configuration.rag.structuredResponseEnabled)"
              size="small"
              >{{ booleanText(configuration.rag.structuredResponseEnabled) }}</el-tag
            >
          </div>
          <div class="settings-row">
            <span>推理强度 <el-tooltip :content="configurationDescription('reasoning')"><el-icon><QuestionFilled /></el-icon></el-tooltip></span><strong>{{ configuration.rag.reasoningEffort }}</strong>
          </div>
          <div class="settings-row">
            <span>客服安全规则 / AI 辅助 <el-tooltip :content="configurationDescription('safety')"><el-icon><QuestionFilled /></el-icon></el-tooltip></span
            ><strong
              >{{ booleanText(configuration.rag.customerSafetyEnabled) }} /
              {{ booleanText(configuration.rag.customerSafetyAiEnabled) }}</strong
            >
          </div>
          <div class="settings-row">
            <span>引用摘录 <el-tooltip :content="configurationDescription('citation')"><el-icon><QuestionFilled /></el-icon></el-tooltip></span
            ><strong
              >{{ booleanText(configuration.rag.citationExcerptEnabled) }} · 最多
              {{ configuration.rag.citationExcerptMaxChars }} 字</strong
            >
          </div>
          <div class="settings-row">
            <span>冲突检测 / AI 辅助 <el-tooltip :content="configurationDescription('conflict')"><el-icon><QuestionFilled /></el-icon></el-tooltip></span
            ><strong
              >{{ booleanText(configuration.rag.conflictDetectionEnabled) }} /
              {{ booleanText(configuration.rag.conflictDetectionAiEnabled) }}</strong
            >
          </div>
          <div class="settings-row">
            <span>多轮查询改写 <el-tooltip :content="configurationDescription('multiturn')"><el-icon><QuestionFilled /></el-icon></el-tooltip></span
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
            <span>切片 / 重叠字符 <el-tooltip :content="configurationDescription('chunk')"><el-icon><QuestionFilled /></el-icon></el-tooltip></span
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
            <span>OCR <el-tooltip :content="configurationDescription('ocr')"><el-icon><QuestionFilled /></el-icon></el-tooltip></span
            ><strong
              >{{ booleanText(configuration.documents.ocrEnabled)
              }}<template v-if="configuration.documents.ocrModel">
                · {{ configuration.documents.ocrModel }}</template
              ></strong
            >
          </div>
          <div class="settings-row">
            <span>处理任务 / 自动恢复 <el-tooltip :content="configurationDescription('pipeline')"><el-icon><QuestionFilled /></el-icon></el-tooltip></span
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
            <span>评测执行器 <el-tooltip :content="configurationDescription('evaluation')"><el-icon><QuestionFilled /></el-icon></el-tooltip></span
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
              <el-tag v-if="item.operation.type === 'rollback'" size="small" type="warning">
                回滚到 revision {{ item.operation.targetRevision }}
              </el-tag>
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
              <div v-if="item.changes.aiMaxOutputTokens">
                <span>输出 Token</span>
                <code>{{ item.changes.aiMaxOutputTokens.before }}</code>
                <el-icon><Right /></el-icon>
                <code>{{ item.changes.aiMaxOutputTokens.after }}</code>
              </div>
              <div v-if="item.changes.aiContextMessageLimit">
                <span>上下文消息</span>
                <code>{{ item.changes.aiContextMessageLimit.before }}</code>
                <el-icon><Right /></el-icon>
                <code>{{ item.changes.aiContextMessageLimit.after }}</code>
              </div>
              <div v-if="item.changes.retrievalMinimumSimilarity">
                <span>向量最低相似度</span>
                <code>{{ item.changes.retrievalMinimumSimilarity.before }}</code>
                <el-icon><Right /></el-icon>
                <code>{{ item.changes.retrievalMinimumSimilarity.after }}</code>
              </div>
              <div v-if="item.changes.retrievalKeywordMinimumScore">
                <span>关键词最低分</span>
                <code>{{ item.changes.retrievalKeywordMinimumScore.before }}</code>
                <el-icon><Right /></el-icon>
                <code>{{ item.changes.retrievalKeywordMinimumScore.after }}</code>
              </div>
              <div v-if="item.changes.rerankMinimumEvidenceScore">
                <span>最低证据分</span>
                <code>{{ item.changes.rerankMinimumEvidenceScore.before }}</code>
                <el-icon><Right /></el-icon>
                <code>{{ item.changes.rerankMinimumEvidenceScore.after }}</code>
              </div>
              <div v-if="item.changes.rerankStrongEvidenceScore">
                <span>强证据分</span>
                <code>{{ item.changes.rerankStrongEvidenceScore.before }}</code>
                <el-icon><Right /></el-icon>
                <code>{{ item.changes.rerankStrongEvidenceScore.after }}</code>
              </div>
            </div>
            <div
              v-if="
                configuration.policy.mutationAllowed &&
                item.revision < configuration.policy.currentRevision
              "
              class="settings-history-actions"
            >
              <el-button
                :icon="RefreshLeft"
                :loading="
                  rollbackMutation.isPending.value && rollbackTargetRevision === item.revision
                "
                :disabled="rollbackMutation.isPending.value"
                @click="rollbackToRevision(item.revision)"
              >
                恢复到 revision {{ item.revision }}
              </el-button>
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

    <el-dialog v-model="editVisible" title="编辑系统配置" width="min(620px, calc(100vw - 32px))">
      <el-form label-position="top">
        <el-form-item required>
          <template #label>默认生成模型 <el-tooltip :content="configurationDescription('defaultModel')"><el-icon><QuestionFilled /></el-icon></el-tooltip></template>
          <el-select v-model="editForm.aiDefaultModelId" style="width: 100%">
            <el-option
              v-for="model in configurableModels"
              :key="model.id"
              :label="`${providerLabel(model.provider)} · ${model.model}`"
              :value="model.id"
            />
          </el-select>
        </el-form-item>
        <el-form-item required>
          <template #label>Prompt 版本 <el-tooltip :content="configurationDescription('prompt')"><el-icon><QuestionFilled /></el-icon></el-tooltip></template>
          <el-select v-model="editForm.ragPromptVersion" style="width: 100%">
            <el-option
              v-for="prompt in configuration?.rag.availablePromptVersions ?? []"
              :key="prompt.id"
              :label="prompt.label"
              :value="prompt.id"
            />
          </el-select>
        </el-form-item>
        <div class="settings-edit-grid">
          <el-form-item required>
            <template #label>最大输出 Token <el-tooltip :content="configurationDescription('outputTokens')"><el-icon><QuestionFilled /></el-icon></el-tooltip></template>
            <el-input-number
              v-model="editForm.aiMaxOutputTokens"
              :min="1"
              :max="32768"
              :step="256"
              controls-position="right"
            />
          </el-form-item>
          <el-form-item required>
            <template #label>上下文消息数 <el-tooltip :content="configurationDescription('context')"><el-icon><QuestionFilled /></el-icon></el-tooltip></template>
            <el-input-number
              v-model="editForm.aiContextMessageLimit"
              :min="1"
              :max="200"
              controls-position="right"
            />
          </el-form-item>
          <el-form-item required>
            <template #label>关键词最低分 <el-tooltip :content="configurationDescription('keywordScore')"><el-icon><QuestionFilled /></el-icon></el-tooltip></template>
            <el-input-number
              v-model="editForm.retrievalKeywordMinimumScore"
              :min="0"
              :max="1"
              :step="0.05"
              controls-position="right"
            />
          </el-form-item>
          <el-form-item required>
            <template #label>向量最低相似度 <el-tooltip :content="configurationDescription('similarity')"><el-icon><QuestionFilled /></el-icon></el-tooltip></template>
            <el-input-number
              v-model="editForm.retrievalMinimumSimilarity"
              :min="-1"
              :max="1"
              :step="0.05"
              controls-position="right"
            />
          </el-form-item>
          <el-form-item required>
            <template #label>最低证据分 <el-tooltip :content="configurationDescription('evidence')"><el-icon><QuestionFilled /></el-icon></el-tooltip></template>
            <el-input-number
              v-model="editForm.rerankMinimumEvidenceScore"
              :min="0"
              :max="1"
              :step="0.05"
              controls-position="right"
            />
          </el-form-item>
          <el-form-item required>
            <template #label>强证据分 <el-tooltip :content="configurationDescription('evidence')"><el-icon><QuestionFilled /></el-icon></el-tooltip></template>
            <el-input-number
              v-model="editForm.rerankStrongEvidenceScore"
              :min="0"
              :max="1"
              :step="0.05"
              controls-position="right"
            />
          </el-form-item>
        </div>
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
