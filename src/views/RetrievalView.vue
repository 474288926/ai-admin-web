<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { useMutation, useQuery } from '@tanstack/vue-query'
import {
  Aim,
  Connection,
  DataLine,
  Document,
  Lightning,
  Search,
  Stopwatch,
} from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import { useRoute, useRouter } from 'vue-router'

import { ApiError } from '@/services/api/client'
import * as knowledgeBaseApi from '@/services/api/knowledge-bases'
import { debugRetrieval } from '@/services/api/retrieval'
import type {
  EvidenceLevel,
  RetrievalDebugInput,
  RetrievalDebugItem,
  RetrievalMode,
} from '@/types/retrieval'

const route = useRoute()
const router = useRouter()
const queryInput = ref('')
const selectedKnowledgeBaseId = ref(String(route.query.knowledgeBaseId ?? ''))
const activeResultTab = ref('results')
const form = reactive<Omit<RetrievalDebugInput, 'query'>>({
  mode: 'hybrid',
  topK: 5,
  minSimilarity: 0.2,
})

const knowledgeBasesQuery = useQuery({
  queryKey: ['knowledge-bases', 'retrieval-options'],
  queryFn: () => knowledgeBaseApi.listKnowledgeBases(1, 100),
})

const searchMutation = useMutation({
  mutationFn: (input: RetrievalDebugInput) => debugRetrieval(selectedKnowledgeBaseId.value, input),
})

const knowledgeBases = computed(() => knowledgeBasesQuery.data.value?.items ?? [])
const selectedKnowledgeBase = computed(() =>
  knowledgeBases.value.find((item) => item.id === selectedKnowledgeBaseId.value),
)
const result = computed(() => searchMutation.data.value)
const rejectedCandidates = computed(
  () => result.value?.reranking.candidates.filter((item) => !item.accepted) ?? [],
)
const pipelineStages = computed(() => {
  const data = result.value
  if (!data) return []
  return [
    {
      label: '查询处理',
      value: data.queryProcessing.strategy === 'ai' ? 'AI 改写' : '规则处理',
      detail: `${data.queryProcessing.durationMs} ms`,
      icon: Lightning,
    },
    {
      label: '向量召回',
      value: `${data.candidateCounts.vector} 条`,
      detail: data.embedding
        ? `${data.vectorDriver ?? 'vector'} · ${data.timings.vectorMs} ms`
        : '本次未执行',
      icon: DataLine,
    },
    {
      label: '关键词召回',
      value: `${data.candidateCounts.keyword} 条`,
      detail: data.mode === 'vector' ? '本次未执行' : `${data.timings.keywordMs} ms`,
      icon: Search,
    },
    {
      label: '融合与重排',
      value: `${data.candidateCounts.returned} 条通过`,
      detail: `${data.candidateCounts.rejected} 条淘汰 · ${data.timings.fusionMs + data.timings.rerankMs} ms`,
      icon: Connection,
    },
  ]
})

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
  searchMutation.reset()
})

function getErrorMessage(error: unknown): string {
  return error instanceof ApiError ? error.message : '检索失败，请稍后重试'
}

async function runSearch(): Promise<void> {
  const query = queryInput.value.trim()
  if (!selectedKnowledgeBaseId.value) {
    ElMessage.warning('请先选择知识库')
    return
  }
  if (!query) {
    ElMessage.warning('请输入需要调试的问题')
    return
  }
  try {
    activeResultTab.value = 'results'
    await searchMutation.mutateAsync({ query, ...form })
  } catch (error) {
    ElMessage.error(getErrorMessage(error))
  }
}

function modeLabel(value: RetrievalMode): string {
  return { vector: '向量', keyword: '关键词', hybrid: '混合' }[value]
}

function evidenceLabel(value: EvidenceLevel): string {
  return { strong: '强证据', weak: '弱证据', insufficient: '证据不足', unassessed: '未评估' }[value]
}

function evidenceType(value: EvidenceLevel): 'success' | 'warning' | 'danger' | 'info' {
  return { strong: 'success', weak: 'warning', insufficient: 'danger', unassessed: 'info' }[
    value
  ] as 'success' | 'warning' | 'danger' | 'info'
}

function answerabilityLabel(value?: string): string {
  return (
    {
      supported: '可以回答',
      partially_supported: '部分可回答',
      unsupported: '无法回答',
      unassessed: '未评估',
    }[value ?? ''] ?? '等待检索'
  )
}

function sourceLabel(value: 'vector' | 'keyword'): string {
  return value === 'vector' ? '向量' : '关键词'
}

function score(value: number | null | undefined, digits = 3): string {
  return value === null || value === undefined ? '—' : value.toFixed(digits)
}

function metadataLocation(item: RetrievalDebugItem): string {
  if (!item.metadata || typeof item.metadata !== 'object') return `切片 ${item.position}`
  const metadata = item.metadata as Record<string, unknown>
  const heading = metadata.heading ?? metadata.sectionTitle ?? metadata.title
  const page = metadata.page ?? metadata.pageNumber
  if (typeof heading === 'string' && heading) return heading
  if (typeof page === 'number' || typeof page === 'string') return `第 ${page} 页`
  return `切片 ${item.position}`
}

function rejectionLabel(value: string | null): string {
  return (
    {
      low_score: '分数低于证据阈值',
      critical_exact_term_missing: '缺少关键精确词',
      outside_top_k: '位于 Top-K 之外',
    }[value ?? ''] ?? '未通过重排'
  )
}
</script>

<template>
  <div class="retrieval-page">
    <section class="retrieval-hero">
      <div>
        <span class="eyebrow">RETRIEVAL LAB</span>
        <h2>检索调试</h2>
        <p>输入真实问题，逐层查看查询改写、向量与关键词召回、融合重排以及最终可引用的知识片段。</p>
      </div>
      <div class="retrieval-context">
        <span>调试知识库</span>
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
    </section>

    <section class="retrieval-console">
      <div class="query-editor">
        <div class="query-editor-head">
          <div>
            <el-icon><Aim /></el-icon><span>测试问题</span>
          </div>
          <small>最多 4,000 个字符</small>
        </div>
        <el-input
          v-model="queryInput"
          type="textarea"
          :rows="4"
          maxlength="4000"
          placeholder="例如：ACME X200 出现 E1001 错误码时应该如何处理？"
          @keydown.ctrl.enter.prevent="runSearch"
        />
        <div class="query-editor-foot">
          <span>Ctrl + Enter 快速运行</span>
          <el-button
            type="primary"
            :icon="Search"
            :loading="searchMutation.isPending.value"
            @click="runSearch"
            >运行检索</el-button
          >
        </div>
      </div>
      <aside class="retrieval-settings">
        <h3>检索参数</h3>
        <label>检索模式</label>
        <el-segmented
          v-model="form.mode"
          :options="[
            { label: '混合', value: 'hybrid' },
            { label: '向量', value: 'vector' },
            { label: '关键词', value: 'keyword' },
          ]"
        />
        <div class="retrieval-setting-row">
          <label
            >返回数量 <strong>{{ form.topK }}</strong></label
          >
          <el-slider v-model="form.topK" :min="1" :max="20" :step="1" />
        </div>
        <div class="retrieval-setting-row">
          <label
            >最低相似度 <strong>{{ form.minSimilarity.toFixed(2) }}</strong></label
          >
          <el-slider v-model="form.minSimilarity" :min="-1" :max="1" :step="0.05" />
        </div>
      </aside>
    </section>

    <el-alert
      v-if="searchMutation.isError.value"
      title="检索调试失败"
      :description="getErrorMessage(searchMutation.error.value)"
      type="error"
      show-icon
      :closable="false"
    />

    <section v-if="result" class="retrieval-overview">
      <article>
        <span class="overview-icon"
          ><el-icon><Stopwatch /></el-icon
        ></span>
        <div>
          <span>总耗时</span><strong>{{ result.timings.totalMs }} ms</strong>
        </div>
      </article>
      <article>
        <span class="overview-icon"
          ><el-icon><Connection /></el-icon
        ></span>
        <div>
          <span>候选并集</span><strong>{{ result.candidateCounts.union }} 条</strong>
        </div>
      </article>
      <article>
        <span class="overview-icon"
          ><el-icon><Document /></el-icon
        ></span>
        <div>
          <span>最终返回</span><strong>{{ result.candidateCounts.returned }} 条</strong>
        </div>
      </article>
      <article>
        <span class="overview-icon"
          ><el-icon><Aim /></el-icon
        ></span>
        <div>
          <span>可回答性</span
          ><strong>{{ answerabilityLabel(result.answerability.status) }}</strong>
        </div>
      </article>
    </section>

    <section v-if="result" class="pipeline-panel">
      <div class="panel-heading">
        <div>
          <h3>检索流水线</h3>
          <span>{{ modeLabel(result.mode) }}检索 · {{ selectedKnowledgeBase?.name }}</span>
        </div>
        <el-tag :type="evidenceType(result.reranking.evidenceLevel)" effect="light">
          {{ evidenceLabel(result.reranking.evidenceLevel) }}
        </el-tag>
      </div>
      <div class="pipeline-stages">
        <article v-for="(stage, index) in pipelineStages" :key="stage.label">
          <span class="pipeline-index">{{ index + 1 }}</span>
          <span class="pipeline-icon"
            ><el-icon><component :is="stage.icon" /></el-icon
          ></span>
          <div>
            <span>{{ stage.label }}</span
            ><strong>{{ stage.value }}</strong
            ><small>{{ stage.detail }}</small>
          </div>
        </article>
      </div>
      <div class="query-processing-card">
        <div>
          <span>标准化问题</span><strong>{{ result.queryProcessing.normalizedQuery }}</strong>
        </div>
        <div>
          <span>向量查询</span><strong>{{ result.queryProcessing.vectorQuery }}</strong>
        </div>
        <div>
          <span>关键词查询</span><strong>{{ result.queryProcessing.keywordQuery }}</strong>
        </div>
        <div class="query-term-row">
          <span>识别关键词</span>
          <div>
            <el-tag
              v-for="keyword in result.queryProcessing.keywords"
              :key="keyword"
              size="small"
              effect="plain"
              >{{ keyword }}</el-tag
            >
            <el-tag
              v-for="term in result.queryProcessing.exactTerms"
              :key="`exact-${term}`"
              size="small"
              type="warning"
              >精确：{{ term }}</el-tag
            >
            <small
              v-if="
                !result.queryProcessing.keywords.length && !result.queryProcessing.exactTerms.length
              "
              >未提取到关键词</small
            >
          </div>
        </div>
      </div>
    </section>

    <section v-if="result" class="retrieval-results-panel">
      <el-tabs v-model="activeResultTab">
        <el-tab-pane :label="`最终结果 ${result.items.length}`" name="results">
          <el-empty v-if="!result.items.length" description="当前参数下没有通过证据阈值的切片" />
          <div v-else class="retrieval-result-list">
            <article v-for="item in result.items" :key="item.chunkId" class="retrieval-result-card">
              <div class="result-rank">{{ item.finalRank }}</div>
              <div class="result-main">
                <div class="result-head">
                  <div>
                    <strong>{{ item.documentName }}</strong>
                    <span>{{ metadataLocation(item) }}</span>
                  </div>
                  <div class="result-tags">
                    <el-tag
                      v-for="source in item.sources"
                      :key="source"
                      size="small"
                      effect="plain"
                      >{{ sourceLabel(source) }}</el-tag
                    >
                    <el-tag size="small" :type="evidenceType(item.evidenceLevel)">{{
                      evidenceLabel(item.evidenceLevel)
                    }}</el-tag>
                  </div>
                </div>
                <p>{{ item.content }}</p>
                <div class="score-strip">
                  <span
                    >召回名次 <strong>#{{ item.recallRank }}</strong></span
                  >
                  <span
                    >向量相似度 <strong>{{ score(item.vector?.similarityScore) }}</strong></span
                  >
                  <span
                    >关键词分 <strong>{{ score(item.keyword?.keywordScore) }}</strong></span
                  >
                  <span
                    >RRF <strong>{{ score(item.rrfScore, 4) }}</strong></span
                  >
                  <span
                    >重排分 <strong>{{ score(item.rerankScore) }}</strong></span
                  >
                </div>
              </div>
            </article>
          </div>
        </el-tab-pane>
        <el-tab-pane :label="`重排淘汰 ${rejectedCandidates.length}`" name="rejected">
          <el-empty v-if="!rejectedCandidates.length" description="没有被重排淘汰的候选" />
          <div v-else class="rejected-table">
            <div v-for="item in rejectedCandidates" :key="item.chunkId">
              <span>#{{ item.recallRank }}</span>
              <code>{{ item.chunkId.slice(0, 8) }}</code>
              <strong>{{ score(item.rerankScore) }}</strong>
              <el-tag size="small" type="danger" effect="plain">{{
                rejectionLabel(item.rejectionReason)
              }}</el-tag>
            </div>
          </div>
        </el-tab-pane>
        <el-tab-pane label="可回答性" name="answerability">
          <div class="answerability-card">
            <div>
              <span>判断结果</span
              ><strong>{{ answerabilityLabel(result.answerability.status) }}</strong>
            </div>
            <p>{{ result.answerability.reason }}</p>
            <div v-if="result.answerability.missingFacts.length" class="missing-facts">
              <span>缺失信息</span
              ><el-tag
                v-for="fact in result.answerability.missingFacts"
                :key="fact"
                type="warning"
                effect="plain"
                >{{ fact }}</el-tag
              >
            </div>
          </div>
        </el-tab-pane>
      </el-tabs>
    </section>

    <section v-else-if="!searchMutation.isPending.value" class="retrieval-empty">
      <span
        ><el-icon><Search /></el-icon
      ></span>
      <h3>等待检索问题</h3>
      <p>选择知识库并输入问题后，这里将展示完整的召回和重排诊断。</p>
    </section>
  </div>
</template>
