<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query'
import {
  ArrowDown,
  ChatDotRound,
  CircleCheck,
  Collection,
  CopyDocument,
  Delete,
  Document,
  Plus,
  Promotion,
  Search,
  SwitchButton,
  Warning,
} from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useRouter } from 'vue-router'

import AiModelSelector from '@/components/AiModelSelector.vue'
import AiConversationUsage from '@/components/AiConversationUsage.vue'
import AiUsageBadge from '@/components/AiUsageBadge.vue'
import { ApiError } from '@/services/api/client'
import * as assistantApi from '@/services/api/assistant'
import { budgetDecisionMessage, providerFailoverMessage } from '@/services/ai-usage'
import * as evaluationApi from '@/services/api/evaluations'
import * as knowledgeBaseApi from '@/services/api/knowledge-bases'
import { useAuthStore } from '@/stores/auth'
import type { Citation, Conversation, ConversationMessage, FeedbackRating } from '@/types/assistant'

const router = useRouter()
const authStore = useAuthStore()
const queryClient = useQueryClient()
const selectedKnowledgeBaseId = ref('')
const selectedConversationId = ref('')
const selectedModelId = ref('')
const conversationSearch = ref('')
const draft = ref('')
const evidenceDrawerVisible = ref(false)
const selectedCitation = ref<Citation | null>(null)
const feedbackByMessage = ref<Record<string, FeedbackRating>>({})

const knowledgeBasesQuery = useQuery({
  queryKey: ['knowledge-bases', 'employee-options'],
  queryFn: () => knowledgeBaseApi.listKnowledgeBases(1, 100),
})
const knowledgeBases = computed(() => knowledgeBasesQuery.data.value?.items ?? [])
const recommendedQuestionsQuery = useQuery({
  queryKey: computed(() => ['recommended-questions', selectedKnowledgeBaseId.value]),
  queryFn: () => evaluationApi.listRecommendedQuestions(selectedKnowledgeBaseId.value),
  enabled: computed(() => Boolean(selectedKnowledgeBaseId.value)),
})
const recommendedQuestions = computed(() => recommendedQuestionsQuery.data.value?.items ?? [])
const selectedKnowledgeBase = computed(
  () => knowledgeBases.value.find((item) => item.id === selectedKnowledgeBaseId.value) ?? null,
)

const conversationsQuery = useQuery({
  queryKey: ['employee-conversations'],
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

const messagesQuery = useQuery({
  queryKey: computed(() => ['employee-messages', selectedConversationId.value]),
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
    const result = await assistantApi.sendMessage(
      conversation.id,
      content,
      selectedModelId.value || undefined,
    )
    return { conversation, result }
  },
})
const feedbackMutation = useMutation({
  mutationFn: ({
    conversationId,
    messageId,
    rating,
    reason,
  }: {
    conversationId: string
    messageId: string
    rating: FeedbackRating
    reason?: 'INCOMPLETE'
  }) =>
    assistantApi.upsertMessageFeedback(conversationId, messageId, {
      rating,
      reason,
    }),
})

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

function newConversation(): void {
  selectedConversationId.value = ''
  selectedCitation.value = null
  draft.value = ''
}

async function send(): Promise<void> {
  const content = draft.value.trim()
  if (!content || !selectedKnowledgeBaseId.value || sendMutation.isPending.value) return
  draft.value = ''
  try {
    const { conversation, result } = await sendMutation.mutateAsync(content)
    selectedConversationId.value = conversation.id
    const budgetNotice = budgetDecisionMessage(result.modelSelection)
    if (budgetNotice) ElMessage.warning(budgetNotice)
    const failoverNotice = providerFailoverMessage(result.providerFailover)
    if (failoverNotice) ElMessage.warning(failoverNotice)
    await nextTick()
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['employee-conversations'] }),
      queryClient.invalidateQueries({ queryKey: ['employee-messages', conversation.id] }),
    ])
  } catch (error) {
    draft.value = content
    ElMessage.error(getErrorMessage(error))
  }
}

function handleKeydown(event: Event | KeyboardEvent): void {
  if (event instanceof KeyboardEvent && event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault()
    void send()
  }
}

async function copyText(value: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(value)
    ElMessage.success('回答已复制')
  } catch {
    ElMessage.error('复制失败，请手动选择文本')
  }
}

async function rate(message: ConversationMessage, rating: FeedbackRating): Promise<void> {
  if (!selectedConversationId.value) return
  try {
    await feedbackMutation.mutateAsync({
      conversationId: selectedConversationId.value,
      messageId: message.id,
      rating,
      ...(rating === 'UNHELPFUL' ? { reason: 'INCOMPLETE' as const } : {}),
    })
    feedbackByMessage.value[message.id] = rating
    ElMessage.success('感谢反馈')
  } catch (error) {
    ElMessage.error(getErrorMessage(error))
  }
}

function openCitation(item: Citation): void {
  selectedCitation.value = item
  evidenceDrawerVisible.value = true
}

async function removeConversation(item: Conversation): Promise<void> {
  try {
    await ElMessageBox.confirm('确定删除这条问答记录吗？', '删除会话', {
      confirmButtonText: '删除',
      cancelButtonText: '取消',
      type: 'warning',
    })
    await assistantApi.deleteConversation(item.id)
    if (item.id === selectedConversationId.value) newConversation()
    await conversationsQuery.refetch()
  } catch (error) {
    if (error === 'cancel' || error === 'close') return
    ElMessage.error(getErrorMessage(error))
  }
}

async function logout(): Promise<void> {
  await authStore.logout()
  await router.replace({ name: 'login' })
}

function scenarioLabel(value: string): string {
  return (
    {
      internal_policy: '内部制度',
      product_documentation: '产品文档',
      operation_manual: '操作手册',
      customer_service_assist: '客服知识',
      unknown: '综合问答',
    }[value] ?? value
  )
}

function locationLabel(item: Citation): string {
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
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}
</script>

<template>
  <div class="employee-app">
    <header class="employee-header">
      <div class="employee-brand">
        <span>知</span>
        <div><strong>知识库智能助手</strong><small>员工知识问答</small></div>
      </div>
      <div class="employee-header-actions">
        <div class="employee-kb-select">
          <el-icon><Collection /></el-icon
          ><el-select
            v-model="selectedKnowledgeBaseId"
            filterable
            :loading="knowledgeBasesQuery.isLoading.value"
            placeholder="选择知识库"
            ><el-option
              v-for="item in knowledgeBases"
              :key="item.id"
              :label="item.name"
              :value="item.id"
          /></el-select>
        </div>
        <el-dropdown trigger="click"
          ><button type="button" class="employee-user-button">
            <span>{{
              (authStore.user?.name || authStore.user?.email || '用').slice(0, 1).toUpperCase()
            }}</span
            >{{ authStore.user?.name || authStore.user?.email
            }}<el-icon><ArrowDown /></el-icon></button
          ><template #dropdown
            ><el-dropdown-menu
              ><el-dropdown-item :icon="SwitchButton" @click="logout"
                >退出登录</el-dropdown-item
              ></el-dropdown-menu
            ></template
          ></el-dropdown
        >
      </div>
    </header>

    <main class="employee-workspace">
      <aside class="employee-history">
        <el-button
          type="primary"
          :icon="Plus"
          :disabled="!selectedKnowledgeBaseId"
          @click="newConversation"
          >发起新问题</el-button
        >
        <el-input
          v-model="conversationSearch"
          :prefix-icon="Search"
          placeholder="搜索问答记录"
          clearable
        />
        <div class="employee-history-title">
          <span>历史问答</span><small>{{ conversations.length }} 条</small>
        </div>
        <el-empty
          v-if="!filteredConversations.length"
          description="暂无问答记录"
          :image-size="54"
        />
        <div class="employee-history-list">
          <button
            v-for="item in filteredConversations"
            :key="item.id"
            type="button"
            :class="{ active: item.id === selectedConversationId }"
            @click="selectedConversationId = item.id"
          >
            <el-icon><ChatDotRound /></el-icon
            ><span
              ><strong>{{ item.title || '新会话' }}</strong
              ><small>{{ formatTime(item.updatedAt) }}</small></span
            ><el-button
              :icon="Delete"
              link
              aria-label="删除问答记录"
              @click.stop="removeConversation(item)"
            />
          </button>
        </div>
      </aside>

      <section class="employee-chat">
        <header class="employee-chat-header">
          <div>
            <span class="employee-online-dot"></span>
            <div>
              <strong>{{ selectedConversation?.title || '开始知识问答' }}</strong
              ><small>{{ selectedKnowledgeBase?.name || '请先选择知识库' }}</small>
            </div>
          </div>
          <div class="employee-chat-header-actions">
            <AiConversationUsage :messages="messages" />
            <el-tag type="success" effect="plain"
              ><el-icon><CircleCheck /></el-icon> 仅检索有权限资料</el-tag
            >
          </div>
        </header>

        <div class="employee-messages">
          <div v-if="messagesQuery.isLoading.value" v-loading="true" class="employee-loading" />
          <section v-else-if="!messages.length" class="employee-welcome">
            <span class="eyebrow">TRUSTED KNOWLEDGE</span>
            <h1>有问题，查知识。</h1>
            <p>查询内部制度、产品文档与操作手册。回答会附上文档来源，资料不足时明确说明。</p>
            <div
              v-if="recommendedQuestionsQuery.isLoading.value"
              class="employee-recommendation-loading"
            >
              正在加载推荐问题
            </div>
            <div v-else class="employee-suggestions">
              <button
                v-for="item in recommendedQuestions"
                :key="item.id"
                type="button"
                @click="draft = item.question"
              >
                <el-icon><Document /></el-icon
                ><span
                  ><strong>{{ scenarioLabel(item.scenario) }}</strong
                  ><small>{{ item.question }}</small></span
                >
              </button>
            </div>
            <el-empty
              v-if="!recommendedQuestionsQuery.isLoading.value && !recommendedQuestions.length"
              description="当前知识库暂无已审核问题，请直接输入问题"
              :image-size="58"
            />
          </section>

          <article
            v-for="message in messages"
            :key="message.id"
            class="employee-message"
            :class="message.role.toLowerCase()"
          >
            <div class="employee-avatar">{{ message.role === 'USER' ? '我' : '知' }}</div>
            <div class="employee-bubble">
              <div class="employee-message-meta">
                <strong>{{ message.role === 'USER' ? '我的问题' : '知识助手' }}</strong
                ><span>{{ formatTime(message.createdAt) }}</span
                ><AiUsageBadge
                  v-if="message.role === 'ASSISTANT' && (message.provider || message.usage)"
                  :provider="message.provider"
                  :model="message.model"
                  :usage="message.usage"
                />
                ><el-tag v-if="message.structuredResponse" size="small" effect="plain">{{
                  scenarioLabel(message.structuredResponse.scenario)
                }}</el-tag>
              </div>
              <div v-if="message.status === 'FAILED'" class="employee-error">
                <el-icon><Warning /></el-icon>回答生成失败：{{ message.errorCode || '未知错误' }}
              </div>
              <div v-else-if="message.status === 'PENDING'" class="employee-thinking">
                <i></i><i></i><i></i><span>正在查询知识库</span>
              </div>
              <template v-else-if="message.role === 'ASSISTANT' && message.structuredResponse">
                <p class="employee-answer">{{ message.structuredResponse.answer }}</p>
                <div v-if="message.structuredResponse.steps.length" class="employee-answer-section">
                  <strong>操作步骤</strong>
                  <ol>
                    <li v-for="item in message.structuredResponse.steps" :key="item">{{ item }}</li>
                  </ol>
                </div>
                <div
                  v-if="message.structuredResponse.applicableConditions.length"
                  class="employee-answer-section"
                >
                  <strong>适用条件</strong>
                  <ul>
                    <li v-for="item in message.structuredResponse.applicableConditions" :key="item">
                      {{ item }}
                    </li>
                  </ul>
                </div>
                <div v-if="message.structuredResponse.riskWarnings.length" class="employee-risk">
                  <strong>注意事项</strong>
                  <ul>
                    <li v-for="item in message.structuredResponse.riskWarnings" :key="item">
                      {{ item }}
                    </li>
                  </ul>
                </div>
                <div
                  v-if="message.structuredResponse.missingInformation.length"
                  class="employee-missing"
                >
                  <strong>资料不足：</strong
                  >{{ message.structuredResponse.missingInformation.join('；') }}
                </div>
                <div v-if="message.structuredResponse.refusalReason" class="employee-refusal">
                  <el-icon><Warning /></el-icon>{{ message.structuredResponse.refusalReason }}
                </div>
              </template>
              <p v-else class="employee-answer">{{ message.content }}</p>

              <footer
                v-if="message.role === 'ASSISTANT' && message.status === 'COMPLETED'"
                class="employee-message-footer"
              >
                <div v-if="message.citations?.length" class="employee-source-list">
                  <span>参考来源</span
                  ><button
                    v-for="citation in message.citations"
                    :key="citation.sourceId"
                    type="button"
                    @click="openCitation(citation)"
                  >
                    <el-icon><Document /></el-icon>{{ citation.sourceId }} ·
                    {{ citation.documentName }}
                  </button>
                </div>
                <div class="employee-message-tools">
                  <el-button
                    :icon="CopyDocument"
                    link
                    @click="copyText(message.content || message.structuredResponse?.answer || '')"
                    >复制</el-button
                  ><span>回答有帮助吗？</span
                  ><el-button
                    size="small"
                    :type="feedbackByMessage[message.id] === 'HELPFUL' ? 'success' : 'default'"
                    @click="rate(message, 'HELPFUL')"
                    >有帮助</el-button
                  ><el-button
                    size="small"
                    :type="feedbackByMessage[message.id] === 'UNHELPFUL' ? 'danger' : 'default'"
                    @click="rate(message, 'UNHELPFUL')"
                    >需改进</el-button
                  >
                </div>
              </footer>
            </div>
          </article>
          <article v-if="sendMutation.isPending.value" class="employee-message assistant">
            <div class="employee-avatar">知</div>
            <div class="employee-bubble">
              <div class="employee-thinking">
                <i></i><i></i><i></i><span>正在检索和核对资料</span>
              </div>
            </div>
          </article>
        </div>

        <footer class="employee-composer">
          <el-input
            v-model="draft"
            type="textarea"
            :autosize="{ minRows: 2, maxRows: 6 }"
            maxlength="20000"
            show-word-limit
            :disabled="!selectedKnowledgeBaseId"
            placeholder="输入你想查询的问题，Enter 发送，Shift + Enter 换行"
            @keydown="handleKeydown"
          />
          <div>
            <span>回答由 AI 基于内部知识生成，请以引用原文为准</span>
            <div class="employee-composer-actions">
              <AiModelSelector v-model="selectedModelId" />
              <el-button
                type="primary"
                :icon="Promotion"
                :loading="sendMutation.isPending.value"
                :disabled="!draft.trim() || !selectedKnowledgeBaseId"
                @click="send"
                >发送</el-button
              >
            </div>
          </div>
        </footer>
      </section>
    </main>

    <el-drawer v-model="evidenceDrawerVisible" title="引用依据" size="min(500px, 94vw)">
      <div v-if="selectedCitation" class="employee-evidence">
        <div class="employee-evidence-head">
          <span>{{ selectedCitation.sourceId }}</span>
          <div>
            <strong>{{ selectedCitation.documentName }}</strong
            ><small>{{ locationLabel(selectedCitation) }}</small>
          </div>
        </div>
        <div class="employee-evidence-meta">
          <span>相关度 {{ (selectedCitation.similarityScore * 100).toFixed(1) }}%</span
          ><span v-if="selectedCitation.documentVersion"
            >版本
            {{
              selectedCitation.documentVersion.versionLabel ||
              `v${selectedCitation.documentVersion.version}`
            }}</span
          >
        </div>
        <blockquote v-if="selectedCitation.excerpt">
          {{ selectedCitation.excerpt
          }}<small v-if="selectedCitation.excerptTruncated">摘录已按安全长度截断</small>
        </blockquote>
        <el-alert
          v-else-if="selectedCitation.excerptWithheldReason"
          title="原文含敏感信息，摘录已隐藏"
          type="warning"
          show-icon
          :closable="false"
        /><el-empty v-else description="该历史引用未保存原文摘录" />
      </div>
    </el-drawer>
  </div>
</template>
