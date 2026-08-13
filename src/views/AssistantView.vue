<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query'
import {
  ChatDotRound,
  CircleCheck,
  CopyDocument,
  Delete,
  Document,
  Plus,
  Promotion,
  Refresh,
  Search,
  Service,
  Tickets,
  Warning,
} from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox } from 'element-plus'

import { ApiError } from '@/services/api/client'
import * as assistantApi from '@/services/api/assistant'
import * as knowledgeBaseApi from '@/services/api/knowledge-bases'
import {
  buildTicketEscalationDraft,
  formatTicketEscalationDraft,
  openTicketSystem,
  parseTicketSystemUrl,
  type TicketEscalationDraft,
} from '@/services/ticket-handoff'
import type {
  Citation,
  Conversation,
  ConversationMessage,
  FeedbackReason,
  FeedbackRating,
} from '@/types/assistant'

const queryClient = useQueryClient()
const selectedKnowledgeBaseId = ref('')
const selectedConversationId = ref('')
const draft = ref('')
const conversationSearch = ref('')
const selectedCitation = ref<Citation | null>(null)
const feedbackByMessage = ref<Record<string, FeedbackRating>>({})
const feedbackDialogVisible = ref(false)
const feedbackMessage = ref<ConversationMessage | null>(null)
const feedbackReason = ref<FeedbackReason>('INCOMPLETE')
const feedbackComment = ref('')
const ticketDialogVisible = ref(false)
const ticketConfirmed = ref(false)
const ticketDraft = ref<TicketEscalationDraft | null>(null)
const ticketSystemUrl = parseTicketSystemUrl(
  import.meta.env.VITE_TICKET_SYSTEM_CREATE_URL as string | undefined,
  window.location.origin,
)

const knowledgeBasesQuery = useQuery({
  queryKey: ['knowledge-bases', 'assistant-options'],
  queryFn: () => knowledgeBaseApi.listKnowledgeBases(1, 100),
})
const knowledgeBases = computed(() => knowledgeBasesQuery.data.value?.items ?? [])

const conversationsQuery = useQuery({
  queryKey: ['assistant-conversations'],
  queryFn: () => assistantApi.listConversations(),
})
const conversations = computed(() =>
  (conversationsQuery.data.value?.items ?? []).filter(
    (item) => item.knowledgeBaseId === selectedKnowledgeBaseId.value,
  ),
)
const filteredConversations = computed(() => {
  const keyword = conversationSearch.value.trim().toLowerCase()
  return keyword
    ? conversations.value.filter((item) => (item.title ?? '新会话').toLowerCase().includes(keyword))
    : conversations.value
})
const selectedConversation = computed(
  () => conversations.value.find((item) => item.id === selectedConversationId.value) ?? null,
)
const selectedKnowledgeBase = computed(
  () => knowledgeBases.value.find((item) => item.id === selectedKnowledgeBaseId.value) ?? null,
)

const messagesQuery = useQuery({
  queryKey: computed(() => ['assistant-messages', selectedConversationId.value]),
  queryFn: () => assistantApi.listMessages(selectedConversationId.value),
  enabled: computed(() => Boolean(selectedConversationId.value)),
})
const messages = computed(() => messagesQuery.data.value?.items ?? [])

const sendMutation = useMutation({
  mutationFn: async (content: string) => {
    let conversation = selectedConversation.value
    if (!conversation) {
      conversation = await assistantApi.createConversation({
        knowledgeBaseId: selectedKnowledgeBaseId.value,
        title: content.slice(0, 42),
      })
    }
    const result = await assistantApi.sendMessage(conversation.id, content)
    return { conversation, result }
  },
})
const feedbackMutation = useMutation({
  mutationFn: (input: {
    conversationId: string
    messageId: string
    rating: FeedbackRating
    reason?: FeedbackReason
    comment?: string
  }) =>
    assistantApi.upsertMessageFeedback(input.conversationId, input.messageId, {
      rating: input.rating,
      reason: input.reason,
      comment: input.comment,
    }),
})

const promptSuggestions = [
  '客户反馈设备无法联网，我应该先让客户检查哪些项目？',
  '请给出退换货流程的客服回复话术和内部操作步骤。',
  '这个问题需要升级人工或二线支持吗？判断条件是什么？',
]

const feedbackReasons: Array<{ value: FeedbackReason; label: string }> = [
  { value: 'INCORRECT', label: '回答错误' },
  { value: 'INCOMPLETE', label: '信息不完整' },
  { value: 'INACCURATE_CITATION', label: '引用不准确' },
  { value: 'SHOULD_HAVE_ANSWERED', label: '不应拒答' },
  { value: 'SHOULD_HAVE_REFUSED', label: '应该拒答' },
  { value: 'NOT_ACTIONABLE', label: '缺少可执行性' },
  { value: 'EXPRESSION', label: '表达不清晰' },
  { value: 'OTHER', label: '其他' },
]

watch(
  knowledgeBases,
  (items) => {
    if (!items.some((item) => item.id === selectedKnowledgeBaseId.value)) {
      selectedKnowledgeBaseId.value = items[0]?.id ?? ''
    }
  },
  { immediate: true },
)
watch(selectedKnowledgeBaseId, () => {
  selectedConversationId.value = ''
  selectedCitation.value = null
})

function getErrorMessage(error: unknown): string {
  return error instanceof ApiError ? error.message : '操作失败，请稍后重试'
}

function createNewConversation(): void {
  selectedConversationId.value = ''
  selectedCitation.value = null
  draft.value = ''
}

async function send(): Promise<void> {
  const content = draft.value.trim()
  if (!content || !selectedKnowledgeBaseId.value || sendMutation.isPending.value) return
  draft.value = ''
  try {
    const { conversation } = await sendMutation.mutateAsync(content)
    selectedConversationId.value = conversation.id
    await nextTick()
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['assistant-conversations'] }),
      queryClient.invalidateQueries({ queryKey: ['assistant-messages', conversation.id] }),
    ])
  } catch (error) {
    draft.value = content
    ElMessage.error(getErrorMessage(error))
  }
}

function handleComposerKeydown(event: Event | KeyboardEvent): void {
  if (event instanceof KeyboardEvent && event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault()
    void send()
  }
}

function useSuggestion(value: string): void {
  draft.value = value
}

async function copyText(value: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(value)
    ElMessage.success('已复制到剪贴板')
  } catch {
    ElMessage.error('复制失败，请手动选择文本')
  }
}

function findCustomerQuestion(message: ConversationMessage): string {
  const index = messages.value.findIndex((item) => item.id === message.id)
  for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
    const candidate = messages.value[cursor]
    if (candidate?.role === 'USER' && candidate.content?.trim()) return candidate.content
  }
  return selectedConversation.value?.title ?? ''
}

function openTicketHandoff(message: ConversationMessage): void {
  const nextDraft = buildTicketEscalationDraft({
    assistantMessage: message,
    customerQuestion: findCustomerQuestion(message),
  })
  if (!nextDraft) {
    ElMessage.warning('当前回答无法生成升级工单草稿')
    return
  }
  ticketDraft.value = nextDraft
  ticketConfirmed.value = false
  ticketDialogVisible.value = true
}

async function copyTicketDraft(): Promise<void> {
  if (!ticketDraft.value || !ticketConfirmed.value) return
  await copyText(formatTicketEscalationDraft(ticketDraft.value))
}

async function handoffToTicketSystem(): Promise<void> {
  if (!ticketDraft.value || !ticketConfirmed.value) return
  if (ticketSystemUrl) openTicketSystem(ticketSystemUrl)
  await copyTicketDraft()
  if (!ticketSystemUrl) {
    ElMessage.info('工单系统地址尚未配置，草稿已复制，请人工创建工单')
    return
  }
  ticketDialogVisible.value = false
  ElMessage.success('已打开工单系统新建页，草稿仍需人工粘贴并提交')
}

async function rateHelpful(message: ConversationMessage): Promise<void> {
  if (!selectedConversationId.value) return
  try {
    await feedbackMutation.mutateAsync({
      conversationId: selectedConversationId.value,
      messageId: message.id,
      rating: 'HELPFUL',
    })
    feedbackByMessage.value[message.id] = 'HELPFUL'
    ElMessage.success('感谢反馈')
  } catch (error) {
    ElMessage.error(getErrorMessage(error))
  }
}

function openUnhelpfulFeedback(message: ConversationMessage): void {
  feedbackMessage.value = message
  feedbackReason.value = 'INCOMPLETE'
  feedbackComment.value = ''
  feedbackDialogVisible.value = true
}

async function submitUnhelpfulFeedback(): Promise<void> {
  if (!feedbackMessage.value || !selectedConversationId.value) return
  if (feedbackReason.value === 'OTHER' && !feedbackComment.value.trim()) {
    ElMessage.warning('选择其他原因时请填写备注')
    return
  }
  try {
    await feedbackMutation.mutateAsync({
      conversationId: selectedConversationId.value,
      messageId: feedbackMessage.value.id,
      rating: 'UNHELPFUL',
      reason: feedbackReason.value,
      comment: feedbackComment.value.trim() || undefined,
    })
    feedbackByMessage.value[feedbackMessage.value.id] = 'UNHELPFUL'
    feedbackDialogVisible.value = false
    ElMessage.success('问题反馈已记录')
  } catch (error) {
    ElMessage.error(getErrorMessage(error))
  }
}

async function removeConversation(item: Conversation): Promise<void> {
  try {
    await ElMessageBox.confirm('删除后将无法在工作台继续查看该会话。', '删除会话', {
      confirmButtonText: '确认删除',
      cancelButtonText: '取消',
      type: 'warning',
    })
    await assistantApi.deleteConversation(item.id)
    if (selectedConversationId.value === item.id) createNewConversation()
    await conversationsQuery.refetch()
    ElMessage.success('会话已删除')
  } catch (error) {
    if (error === 'cancel' || error === 'close') return
    ElMessage.error(getErrorMessage(error))
  }
}

function scenarioLabel(value: string): string {
  return (
    {
      internal_policy: '内部制度',
      product_documentation: '产品文档',
      operation_manual: '操作手册',
      customer_service_assist: '客服辅助',
      unknown: '待确认',
    }[value] ?? value
  )
}

function citationLocation(item: Citation): string {
  const location = item.location
  if (!location) return `切片 ${item.position}`
  if (location.pageStart) {
    return location.pageEnd && location.pageEnd !== location.pageStart
      ? `第 ${location.pageStart}-${location.pageEnd} 页`
      : `第 ${location.pageStart} 页`
  }
  if (location.sectionPath?.length) return location.sectionPath.join(' / ')
  if (location.worksheetName) {
    return `${location.worksheetName}${location.cellRange ? ` · ${location.cellRange}` : ''}`
  }
  return `切片 ${location.chunkPosition}`
}

function formatTime(value: string): string {
  return new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit' }).format(
    new Date(value),
  )
}
</script>

<template>
  <div class="assistant-page">
    <section class="assistant-toolbar">
      <div>
        <span class="eyebrow">KNOWLEDGE COPILOT</span>
        <h2>客服知识辅助</h2>
        <p>基于已授权知识生成客服话术、内部排查步骤和升级条件，每条回答都可追溯到原始文档。</p>
      </div>
      <div class="assistant-kb-picker">
        <span>当前知识库</span>
        <el-select
          v-model="selectedKnowledgeBaseId"
          filterable
          :loading="knowledgeBasesQuery.isLoading.value"
          placeholder="选择知识库"
        >
          <el-option
            v-for="item in knowledgeBases"
            :key="item.id"
            :label="item.name"
            :value="item.id"
          />
        </el-select>
        <el-tag type="success" effect="light"
          ><el-icon><CircleCheck /></el-icon> 权限已校验</el-tag
        >
      </div>
    </section>

    <el-alert
      v-if="knowledgeBasesQuery.isError.value || conversationsQuery.isError.value"
      title="工作台数据加载失败"
      :description="
        getErrorMessage(knowledgeBasesQuery.error.value || conversationsQuery.error.value)
      "
      type="error"
      show-icon
      :closable="false"
    />

    <section class="assistant-workspace">
      <aside class="assistant-history">
        <el-button
          type="primary"
          :icon="Plus"
          :disabled="!selectedKnowledgeBaseId"
          @click="createNewConversation"
          >新建会话</el-button
        >
        <el-input
          v-model="conversationSearch"
          :prefix-icon="Search"
          placeholder="搜索会话"
          clearable
        />
        <div class="assistant-history-head">
          <span>最近会话</span
          ><el-button :icon="Refresh" link @click="conversationsQuery.refetch()" />
        </div>
        <el-empty
          v-if="!filteredConversations.length"
          description="暂无历史会话"
          :image-size="54"
        />
        <div class="assistant-conversation-list">
          <button
            v-for="item in filteredConversations"
            :key="item.id"
            type="button"
            :class="{ active: item.id === selectedConversationId }"
            @click="selectedConversationId = item.id"
          >
            <el-icon><ChatDotRound /></el-icon>
            <span
              ><strong>{{ item.title || '新会话' }}</strong
              ><small>{{ formatTime(item.updatedAt) }}</small></span
            >
            <el-button
              :icon="Delete"
              link
              aria-label="删除会话"
              @click.stop="removeConversation(item)"
            />
          </button>
        </div>
      </aside>

      <main class="assistant-chat">
        <header class="assistant-chat-head">
          <div>
            <span class="assistant-status-dot"></span>
            <div>
              <strong>{{ selectedConversation?.title || '新的客服辅助会话' }}</strong
              ><small>{{ selectedKnowledgeBase?.name || '请选择知识库' }}</small>
            </div>
          </div>
          <el-tag effect="plain">仅使用已授权资料</el-tag>
        </header>

        <div class="assistant-message-list">
          <div v-if="messagesQuery.isLoading.value" v-loading="true" class="assistant-loading" />
          <section v-else-if="!messages.length" class="assistant-welcome">
            <div>
              <el-icon><Service /></el-icon>
            </div>
            <h3>今天需要辅助处理什么问题？</h3>
            <p>描述客户现象或业务问题，我会区分对客话术和内部操作，并标注引用依据。</p>
            <button
              v-for="item in promptSuggestions"
              :key="item"
              type="button"
              @click="useSuggestion(item)"
            >
              {{ item }}
            </button>
          </section>

          <article
            v-for="message in messages"
            :key="message.id"
            class="assistant-message"
            :class="message.role.toLowerCase()"
          >
            <div class="assistant-message-avatar">{{ message.role === 'USER' ? '客' : '知' }}</div>
            <div class="assistant-message-body">
              <div class="assistant-message-meta">
                <strong>{{ message.role === 'USER' ? '客服提问' : '知识助手' }}</strong
                ><span>{{ formatTime(message.createdAt) }}</span
                ><el-tag v-if="message.structuredResponse" size="small" effect="plain">{{
                  scenarioLabel(message.structuredResponse.scenario)
                }}</el-tag>
              </div>

              <div v-if="message.status === 'FAILED'" class="assistant-message-error">
                <el-icon><Warning /></el-icon
                ><span>回答生成失败：{{ message.errorCode || '未知错误' }}</span>
              </div>
              <div v-else-if="message.status === 'PENDING'" class="assistant-thinking">
                <i></i><i></i><i></i><span>正在检索知识并组织回答</span>
              </div>
              <template v-else-if="message.role === 'ASSISTANT' && message.structuredResponse">
                <section
                  v-if="message.structuredResponse.customerService"
                  class="customer-reply-card"
                >
                  <header>
                    <span>建议对客回复</span
                    ><el-button
                      :icon="CopyDocument"
                      link
                      @click="
                        copyText(message.structuredResponse!.customerService!.customerFacingReply)
                      "
                      >复制话术</el-button
                    >
                  </header>
                  <p>{{ message.structuredResponse.customerService.customerFacingReply }}</p>
                </section>
                <p v-else class="assistant-answer">{{ message.structuredResponse.answer }}</p>

                <div
                  v-if="message.structuredResponse.steps.length"
                  class="assistant-guidance-block"
                >
                  <strong>内部处理步骤</strong>
                  <ol>
                    <li v-for="item in message.structuredResponse.steps" :key="item">{{ item }}</li>
                  </ol>
                </div>
                <div
                  v-if="message.structuredResponse.customerService?.internalTroubleshooting.length"
                  class="assistant-guidance-block"
                >
                  <strong>内部排查</strong>
                  <ol>
                    <li
                      v-for="item in message.structuredResponse.customerService
                        .internalTroubleshooting"
                      :key="item"
                    >
                      {{ item }}
                    </li>
                  </ol>
                </div>
                <div
                  v-if="message.structuredResponse.riskWarnings.length"
                  class="assistant-warning-block"
                >
                  <strong>风险提醒</strong>
                  <ul>
                    <li v-for="item in message.structuredResponse.riskWarnings" :key="item">
                      {{ item }}
                    </li>
                  </ul>
                </div>
                <div
                  v-if="message.structuredResponse.customerService?.escalationConditions.length"
                  class="assistant-warning-block"
                >
                  <strong>升级条件</strong>
                  <ul>
                    <li
                      v-for="item in message.structuredResponse.customerService
                        .escalationConditions"
                      :key="item"
                    >
                      {{ item }}
                    </li>
                  </ul>
                </div>
                <div
                  v-if="message.structuredResponse.missingInformation.length"
                  class="assistant-missing"
                >
                  <strong>仍需确认：</strong
                  >{{ message.structuredResponse.missingInformation.join('；') }}
                </div>
                <div v-if="message.structuredResponse.refusalReason" class="assistant-refusal">
                  <el-icon><Warning /></el-icon
                  ><span>{{ message.structuredResponse.refusalReason }}</span>
                </div>
              </template>
              <p v-else class="assistant-answer">{{ message.content }}</p>

              <div
                v-if="message.role === 'ASSISTANT' && message.status === 'COMPLETED'"
                class="assistant-message-actions"
              >
                <div v-if="message.citations?.length" class="assistant-citations">
                  <button
                    v-for="citation in message.citations"
                    :key="citation.sourceId"
                    type="button"
                    @click="selectedCitation = citation"
                  >
                    <el-icon><Document /></el-icon>{{ citation.sourceId }} ·
                    {{ citation.documentName }}
                  </button>
                </div>
                <div class="assistant-rating">
                  <el-button
                    v-if="message.structuredResponse?.customerService"
                    size="small"
                    :icon="Tickets"
                    @click="openTicketHandoff(message)"
                    >准备升级工单</el-button
                  >
                  <span>这个回答有帮助吗？</span
                  ><el-button
                    size="small"
                    :type="feedbackByMessage[message.id] === 'HELPFUL' ? 'success' : 'default'"
                    @click="rateHelpful(message)"
                    >有帮助</el-button
                  ><el-button
                    size="small"
                    :type="feedbackByMessage[message.id] === 'UNHELPFUL' ? 'danger' : 'default'"
                    @click="openUnhelpfulFeedback(message)"
                    >需改进</el-button
                  >
                </div>
              </div>
            </div>
          </article>

          <article v-if="sendMutation.isPending.value" class="assistant-message assistant">
            <div class="assistant-message-avatar">知</div>
            <div class="assistant-message-body">
              <div class="assistant-thinking">
                <i></i><i></i><i></i><span>正在检索知识并生成可追溯回答</span>
              </div>
            </div>
          </article>
        </div>

        <footer class="assistant-composer">
          <el-input
            v-model="draft"
            type="textarea"
            :autosize="{ minRows: 2, maxRows: 6 }"
            maxlength="20000"
            show-word-limit
            placeholder="输入客户问题或需要查询的业务事项，Enter 发送，Shift + Enter 换行"
            :disabled="!selectedKnowledgeBaseId"
            @keydown="handleComposerKeydown"
          />
          <div>
            <span>AI 建议需结合实际业务判断后发送给客户</span
            ><el-button
              type="primary"
              :icon="Promotion"
              :loading="sendMutation.isPending.value"
              :disabled="!draft.trim() || !selectedKnowledgeBaseId"
              @click="send"
              >发送问题</el-button
            >
          </div>
        </footer>
      </main>

      <aside class="assistant-evidence">
        <header>
          <div><span>引用依据</span><small>回答证据与文档位置</small></div>
          <el-icon><Document /></el-icon>
        </header>
        <el-empty
          v-if="!selectedCitation"
          description="点击回答下方的引用查看原文"
          :image-size="70"
        />
        <template v-else>
          <div class="evidence-source">
            <span>{{ selectedCitation.sourceId }}</span>
            <div>
              <strong>{{ selectedCitation.documentName }}</strong
              ><small>{{ citationLocation(selectedCitation) }}</small>
            </div>
          </div>
          <div class="evidence-score">
            <span>相关度</span
            ><strong>{{ (selectedCitation.similarityScore * 100).toFixed(1) }}%</strong>
          </div>
          <div v-if="selectedCitation.documentVersion" class="evidence-version">
            <span>文档版本</span
            ><strong>{{
              selectedCitation.documentVersion.versionLabel ||
              `v${selectedCitation.documentVersion.version}`
            }}</strong>
          </div>
          <blockquote v-if="selectedCitation.excerpt">
            {{ selectedCitation.excerpt
            }}<small v-if="selectedCitation.excerptTruncated">摘录已按安全长度截断</small>
          </blockquote>
          <el-alert
            v-else-if="selectedCitation.excerptWithheldReason"
            title="原文包含敏感信息，已隐藏摘录"
            type="warning"
            show-icon
            :closable="false"
          />
          <p v-else class="evidence-no-excerpt">
            当前引用未保存原文摘录，可根据文档名和位置回到文档管理查看。
          </p>
        </template>
      </aside>
    </section>

    <el-dialog
      v-model="feedbackDialogVisible"
      title="这个回答哪里需要改进？"
      width="min(520px, 94vw)"
    >
      <el-form label-position="top"
        ><el-form-item label="问题类型"
          ><el-select v-model="feedbackReason"
            ><el-option
              v-for="item in feedbackReasons"
              :key="item.value"
              :label="item.label"
              :value="item.value" /></el-select></el-form-item
        ><el-form-item label="补充说明"
          ><el-input
            v-model="feedbackComment"
            type="textarea"
            :rows="4"
            maxlength="500"
            show-word-limit
            placeholder="可补充具体错误或期望内容" /></el-form-item
      ></el-form>
      <template #footer
        ><el-button @click="feedbackDialogVisible = false">取消</el-button
        ><el-button
          type="primary"
          :loading="feedbackMutation.isPending.value"
          @click="submitUnhelpfulFeedback"
          >提交反馈</el-button
        ></template
      >
    </el-dialog>
  </div>

  <el-dialog v-model="ticketDialogVisible" title="人工确认升级工单草稿" width="min(680px, 94vw)">
    <template v-if="ticketDraft">
      <el-alert
        title="知识助手只准备并复制草稿，不会自动创建、提交、关闭或修改工单。"
        type="warning"
        :closable="false"
        show-icon
      />
      <div class="ticket-draft-preview">
        <strong>{{ ticketDraft.subject }}</strong>
        <pre>{{ formatTicketEscalationDraft(ticketDraft) }}</pre>
      </div>
      <el-checkbox v-model="ticketConfirmed">
        我已核对客户问题、升级条件、知识依据和禁止承诺
      </el-checkbox>
    </template>
    <template #footer>
      <el-button @click="ticketDialogVisible = false">取消</el-button>
      <el-button :disabled="!ticketConfirmed" @click="copyTicketDraft">复制草稿</el-button>
      <el-button type="primary" :disabled="!ticketConfirmed" @click="handoffToTicketSystem">
        {{ ticketSystemUrl ? '复制并打开工单系统' : '复制工单草稿' }}
      </el-button>
    </template>
  </el-dialog>
</template>
