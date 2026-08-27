<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import { useMutation, useQuery } from '@tanstack/vue-query'
import {
  CircleCheck,
  CopyDocument,
  Document,
  Promotion,
  Service,
  Tickets,
} from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'

import AiModelSelector from '@/components/AiModelSelector.vue'
import AiUsageBadge from '@/components/AiUsageBadge.vue'
import SafeAnswerText from '@/components/SafeAnswerText.vue'
import * as assistantApi from '@/services/api/assistant'
import { ApiError } from '@/services/api/client'
import { budgetDecisionMessage, providerFailoverMessage } from '@/services/ai-usage'
import * as knowledgeBaseApi from '@/services/api/knowledge-bases'
import {
  buildSupportQuestion,
  isTrustedWorkbenchOrigin,
  parseSupportTicketContext,
  parseTrustedWorkbenchOrigins,
  SUPPORT_WORKBENCH_PROTOCOL,
  type SupportTicketContext,
  type SupportWorkbenchMessage,
} from '@/services/support-workbench'
import { buildTicketEscalationDraft, type TicketEscalationDraft } from '@/services/ticket-handoff'
import type { Citation, ConversationMessage } from '@/types/assistant'

const configuredOrigins = import.meta.env.VITE_SUPPORT_WORKBENCH_ORIGINS as string | undefined
const trustedOrigins = parseTrustedWorkbenchOrigins(configuredOrigins, window.location.origin)
const embedded = window.self !== window.top
const context = ref<SupportTicketContext | null>(null)
const sourceOrigin = ref('')
const selectedKnowledgeBaseId = ref('')
const selectedModelId = ref('')
const answer = ref<ConversationMessage | null>(null)
const confirmationVisible = ref(false)
const humanConfirmed = ref(false)
const selectedCitation = ref<Citation | null>(null)
const citationDrawerVisible = ref(false)
const ticketConfirmationVisible = ref(false)
const ticketConfirmed = ref(false)
const ticketDraft = shallowRef<TicketEscalationDraft | null>(null)

const knowledgeBasesQuery = useQuery({
  queryKey: ['knowledge-bases', 'support-embed-options'],
  queryFn: () => knowledgeBaseApi.listKnowledgeBases(1, 100),
})
const knowledgeBases = computed(() => knowledgeBasesQuery.data.value?.items ?? [])
const customerReply = computed(() => {
  const structured = answer.value?.structuredResponse
  return structured?.customerService?.customerFacingReply ?? structured?.answer ?? ''
})
const internalSteps = computed(() => {
  const structured = answer.value?.structuredResponse
  return structured?.customerService?.internalTroubleshooting ?? structured?.steps ?? []
})
const escalationConditions = computed(
  () => answer.value?.structuredResponse?.customerService?.escalationConditions ?? [],
)
const prohibitedCommitments = computed(
  () => answer.value?.structuredResponse?.customerService?.prohibitedCommitments ?? [],
)

watch(
  knowledgeBases,
  (items) => {
    if (!selectedKnowledgeBaseId.value && items[0]) {
      selectedKnowledgeBaseId.value = items[0].id
    }
  },
  { immediate: true },
)

const generateMutation = useMutation({
  mutationFn: async () => {
    if (!context.value || !selectedKnowledgeBaseId.value) throw new Error('missing context')
    const contextSnapshot = context.value
    const question = buildSupportQuestion(contextSnapshot)
    const conversation = await assistantApi.createConversation({
      knowledgeBaseId: selectedKnowledgeBaseId.value,
      title: `工单 ${contextSnapshot.ticketId}`.slice(0, 42),
    })
    const result = await assistantApi.sendMessage(
      conversation.id,
      question,
      selectedModelId.value || undefined,
    )
    return { requestId: contextSnapshot.requestId, result }
  },
})

async function generateSuggestion(): Promise<void> {
  if (!context.value) {
    ElMessage.warning('请先从客服工作台加载工单问题')
    return
  }
  if (!selectedKnowledgeBaseId.value) {
    ElMessage.warning('请选择有权限的知识库')
    return
  }
  try {
    const { requestId, result } = await generateMutation.mutateAsync()
    if (context.value?.requestId !== requestId) {
      ElMessage.info('工单已切换，已忽略上一工单的生成结果')
      return
    }
    const budgetNotice = budgetDecisionMessage(result.modelSelection)
    if (budgetNotice) ElMessage.warning(budgetNotice)
    const failoverNotice = providerFailoverMessage(result.providerFailover)
    if (failoverNotice) ElMessage.warning(failoverNotice)
    answer.value = result.assistantMessage
    selectedCitation.value = result.assistantMessage.citations?.[0] ?? null
    humanConfirmed.value = false
  } catch (error) {
    ElMessage.error(error instanceof ApiError ? error.message : '生成建议失败，请稍后重试')
  }
}

function openConfirmation(): void {
  if (!customerReply.value.trim()) {
    ElMessage.warning('当前没有可回填的回复草稿')
    return
  }
  humanConfirmed.value = false
  confirmationVisible.value = true
}

function openCitation(citation: Citation): void {
  selectedCitation.value = citation
  citationDrawerVisible.value = true
}

function openTicketHandoff(): void {
  if (!context.value || !answer.value) return
  const nextDraft = buildTicketEscalationDraft({
    assistantMessage: answer.value,
    customerQuestion: context.value.customerQuestion,
    ticketId: context.value.ticketId,
    productName: context.value.productName,
  })
  if (!nextDraft) {
    ElMessage.warning('当前回答无法生成升级工单草稿')
    return
  }
  ticketDraft.value = nextDraft
  ticketConfirmed.value = false
  ticketConfirmationVisible.value = true
}

function returnTicketDraft(): void {
  if (!ticketConfirmed.value || !ticketDraft.value || !context.value || !sourceOrigin.value) {
    return
  }
  window.parent.postMessage(
    {
      protocol: SUPPORT_WORKBENCH_PROTOCOL,
      type: 'TICKET_DRAFT_READY',
      payload: {
        requestId: context.value.requestId,
        ticketId: context.value.ticketId,
        draft: ticketDraft.value,
        humanConfirmed: true,
        automaticCreate: false,
      },
    },
    sourceOrigin.value,
  )
  ticketConfirmationVisible.value = false
  ElMessage.success('升级工单草稿已返回工作台，仍需人工创建和提交')
}

function returnDraft(): void {
  if (
    !humanConfirmed.value ||
    !context.value ||
    !answer.value ||
    !sourceOrigin.value ||
    !customerReply.value.trim()
  ) {
    return
  }
  window.parent.postMessage(
    {
      protocol: SUPPORT_WORKBENCH_PROTOCOL,
      type: 'DRAFT_READY',
      payload: {
        requestId: context.value.requestId,
        ticketId: context.value.ticketId,
        assistantMessageId: answer.value.id,
        draft: customerReply.value,
        citationCount: answer.value.citations?.length ?? 0,
        humanConfirmed: true,
      },
    },
    sourceOrigin.value,
  )
  confirmationVisible.value = false
  ElMessage.success('回复草稿已回填，仍需在客服工作台手动发送')
}

async function copyReply(): Promise<void> {
  try {
    await navigator.clipboard.writeText(customerReply.value)
    ElMessage.success('回复草稿已复制，发送前请再次核对')
  } catch {
    ElMessage.error('复制失败，请手动选择文本')
  }
}

function handleWorkbenchMessage(event: MessageEvent<SupportWorkbenchMessage>): void {
  if (
    !embedded ||
    event.source !== window.parent ||
    !isTrustedWorkbenchOrigin(event.origin, trustedOrigins) ||
    event.data?.protocol !== SUPPORT_WORKBENCH_PROTOCOL
  ) {
    return
  }
  sourceOrigin.value = event.origin
  if (event.data.type === 'PING') {
    notifyReady(event.origin)
    return
  }
  if (event.data.type !== 'SET_CONTEXT') return
  const nextContext = parseSupportTicketContext(event.data.payload)
  if (!nextContext) {
    window.parent.postMessage(
      { protocol: SUPPORT_WORKBENCH_PROTOCOL, type: 'CONTEXT_REJECTED' },
      event.origin,
    )
    return
  }
  context.value = nextContext
  answer.value = null
  selectedCitation.value = null
  citationDrawerVisible.value = false
  confirmationVisible.value = false
  humanConfirmed.value = false
  ticketConfirmationVisible.value = false
  ticketConfirmed.value = false
  ticketDraft.value = null
  window.parent.postMessage(
    {
      protocol: SUPPORT_WORKBENCH_PROTOCOL,
      type: 'CONTEXT_ACCEPTED',
      payload: { requestId: nextContext.requestId, ticketId: nextContext.ticketId },
    },
    event.origin,
  )
}

function notifyReady(origin: string): void {
  window.parent.postMessage(
    {
      protocol: SUPPORT_WORKBENCH_PROTOCOL,
      type: 'READY',
      payload: {
        capabilities: ['context', 'draft-return', 'ticket-draft-return'],
        automaticSend: false,
        automaticTicketCreate: false,
      },
    },
    origin,
  )
}

onMounted(() => {
  window.addEventListener('message', handleWorkbenchMessage)
  if (embedded) trustedOrigins.forEach(notifyReady)
})
onBeforeUnmount(() => window.removeEventListener('message', handleWorkbenchMessage))
</script>

<template>
  <main class="support-embed-page">
    <header class="support-embed-head">
      <div>
        <el-icon><Service /></el-icon><strong>知识辅助</strong>
      </div>
      <span><i></i> 人工确认模式</span>
    </header>

    <section class="support-embed-context">
      <div>
        <span>当前工单</span>
        <strong>{{ context?.ticketId || '等待客服工作台传入' }}</strong>
      </div>
      <el-select
        v-model="selectedKnowledgeBaseId"
        placeholder="选择知识库"
        :loading="knowledgeBasesQuery.isLoading.value"
      >
        <el-option
          v-for="item in knowledgeBases"
          :key="item.id"
          :label="item.name"
          :value="item.id"
        />
      </el-select>
      <AiModelSelector v-model="selectedModelId" />
    </section>

    <section v-if="context" class="support-embed-question">
      <span>客户问题</span>
      <p>{{ context.customerQuestion }}</p>
      <small v-if="context.productName">{{ context.productName }}</small>
      <small v-if="context.issueSummary">{{ context.issueSummary }}</small>
    </section>
    <el-empty v-else description="在客服工作台选择工单后，问题会显示在这里" :image-size="64" />

    <el-button
      class="support-embed-generate"
      type="primary"
      :icon="Promotion"
      :loading="generateMutation.isPending.value"
      :disabled="!context || !selectedKnowledgeBaseId"
      @click="generateSuggestion"
      >生成知识建议</el-button
    >

    <section v-if="answer" class="support-embed-answer">
      <header>
        <div>
          <el-icon><CircleCheck /></el-icon><strong>建议对客回复</strong>
          <AiUsageBadge :provider="answer.provider" :model="answer.model" :usage="answer.usage" />
        </div>
        <el-button :icon="CopyDocument" link @click="copyReply">复制</el-button>
      </header>
      <SafeAnswerText as="p" :text="customerReply" />

      <details v-if="internalSteps.length" open>
        <summary>内部排查步骤</summary>
        <ol>
          <li v-for="item in internalSteps" :key="item"><SafeAnswerText :text="item" /></li>
        </ol>
      </details>
      <details v-if="escalationConditions.length">
        <summary>升级条件</summary>
        <ul>
          <li v-for="item in escalationConditions" :key="item">
            <SafeAnswerText :text="item" />
          </li>
        </ul>
      </details>
      <details v-if="prohibitedCommitments.length" class="is-warning">
        <summary>禁止承诺</summary>
        <ul>
          <li v-for="item in prohibitedCommitments" :key="item">
            <SafeAnswerText :text="item" />
          </li>
        </ul>
      </details>

      <div v-if="answer.citations?.length" class="support-embed-citations">
        <span>引用依据</span>
        <button
          v-for="citation in answer.citations"
          :key="citation.sourceId"
          type="button"
          @click="openCitation(citation)"
        >
          <el-icon><Document /></el-icon>{{ citation.sourceId }} · {{ citation.documentName }}
        </button>
      </div>

      <el-button
        type="success"
        :icon="CircleCheck"
        :disabled="!customerReply.trim()"
        @click="openConfirmation"
      >
        核对后回填回复草稿
      </el-button>
      <el-button :icon="Tickets" @click="openTicketHandoff">准备升级工单</el-button>
    </section>

    <el-alert
      class="support-embed-safety"
      title="本面板只返回回复草稿，不会自动发送消息或执行业务操作。"
      type="warning"
      :closable="false"
      show-icon
    />

    <el-drawer
      v-model="citationDrawerVisible"
      title="引用原文"
      direction="rtl"
      size="min(420px, 92vw)"
    >
      <template v-if="selectedCitation">
        <h3>{{ selectedCitation.documentName }}</h3>
        <p v-if="selectedCitation.excerpt">{{ selectedCitation.excerpt }}</p>
        <el-alert v-else title="当前引用未提供可展示的原文摘录" type="info" :closable="false" />
      </template>
    </el-drawer>

    <el-dialog v-model="confirmationVisible" title="人工确认后回填草稿" width="min(480px, 94vw)">
      <p class="support-confirm-copy">请确认已核对客户问题、引用依据、风险提醒及禁止承诺。</p>
      <el-checkbox v-model="humanConfirmed">我已完成核对，确认仅回填草稿，不自动发送</el-checkbox>
      <template #footer>
        <el-button @click="confirmationVisible = false">取消</el-button>
        <el-button type="primary" :disabled="!humanConfirmed" @click="returnDraft"
          >确认回填</el-button
        >
      </template>
    </el-dialog>

    <el-dialog
      v-model="ticketConfirmationVisible"
      title="人工确认升级工单草稿"
      width="min(520px, 94vw)"
    >
      <el-alert
        title="只向客服工作台返回结构化草稿，不会自动创建、提交或修改工单。"
        type="warning"
        :closable="false"
        show-icon
      />
      <div v-if="ticketDraft" class="support-ticket-draft">
        <strong>{{ ticketDraft.subject }}</strong>
        <p>{{ ticketDraft.customerQuestion }}</p>
        <small
          >引用 {{ ticketDraft.evidence.length }} 条 · 升级条件
          {{ ticketDraft.escalationConditions.length }} 条</small
        >
      </div>
      <el-checkbox v-model="ticketConfirmed">
        我已核对客户问题、升级条件、知识依据和禁止承诺
      </el-checkbox>
      <template #footer>
        <el-button @click="ticketConfirmationVisible = false">取消</el-button>
        <el-button type="primary" :disabled="!ticketConfirmed" @click="returnTicketDraft">
          确认返回工单草稿
        </el-button>
      </template>
    </el-dialog>
  </main>
</template>
