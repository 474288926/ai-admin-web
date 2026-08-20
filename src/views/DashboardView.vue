<script setup lang="ts">
import { computed } from 'vue'
import { useQuery } from '@tanstack/vue-query'
import { ArrowRight, CircleCheck, Clock, Document, Warning } from '@element-plus/icons-vue'

import * as documentsApi from '@/services/api/documents'
import * as knowledgeBaseApi from '@/services/api/knowledge-bases'
import { getQualitySummary } from '@/services/api/quality'
import { getErrorMessage } from '@/services/error-feedback'

const dashboardQuery = useQuery({
  queryKey: ['dashboard', 'operations-summary'],
  queryFn: async () => {
    const knowledgeBases = await knowledgeBaseApi.listKnowledgeBases(1, 100)
    const documents = await Promise.all(
      knowledgeBases.items.map((knowledgeBase) =>
        documentsApi.listDocuments(knowledgeBase.id, 1, 100),
      ),
    )
    const quality = await Promise.all(
      knowledgeBases.items.map((knowledgeBase) => getQualitySummary(knowledgeBase.id)),
    )

    return {
      publishedDocuments: documents.reduce(
        (total, result) =>
          total +
          result.items.filter((document) => document.lifecycleStatus === 'PUBLISHED').length,
        0,
      ),
      processingTasks: documents.reduce(
        (total, result) =>
          total +
          result.items.filter((document) =>
            ['PENDING', 'RUNNING'].includes(document.ingestionJob?.status ?? ''),
          ).length,
        0,
      ),
      unhelpfulFeedback: quality.reduce((total, summary) => total + summary.unhelpfulCount, 0),
    }
  },
})

const metrics = computed(() => [
  {
    label: '已发布文档',
    value: dashboardQuery.data.value?.publishedDocuments ?? '—',
    note: '来自全部知识库的已发布版本',
    icon: Document,
    tone: 'blue',
  },
  {
    label: '处理中任务',
    value: dashboardQuery.data.value?.processingTasks ?? '—',
    note: dashboardQuery.data.value?.processingTasks
      ? '文档入库任务进行中'
      : '当前没有运行中的任务',
    icon: Clock,
    tone: 'amber',
  },
  {
    label: '质量门禁',
    value: '通过',
    note: '当前 Demo 基线已冻结',
    icon: CircleCheck,
    tone: 'green',
  },
  {
    label: '待处理反馈',
    value: dashboardQuery.data.value?.unhelpfulFeedback ?? '—',
    note: '全部知识库的点踩反馈',
    icon: Warning,
    tone: 'red',
  },
])

const nextSteps = [
  ['知识库与文档', '已接入列表、上传、元数据和发布状态'],
  ['处理任务', '已接入进度轮询、取消与失败重试'],
  ['检索与质量', '已接入问答、反馈、质量分析和评测'],
]
</script>

<template>
  <div class="dashboard">
    <section class="welcome-banner">
      <div>
        <span class="banner-kicker">阶段 6 · 知识运营管理端</span>
        <h2>运营基座已经就绪</h2>
        <p>统一查看知识入库、处理任务、问答质量和评测基线，支持演示主流程快速巡检。</p>
      </div>
      <div class="banner-orbit" aria-hidden="true"><span>RAG</span></div>
    </section>

    <el-alert
      v-if="dashboardQuery.isError.value"
      class="dashboard-alert"
      title="运营指标加载失败"
      :description="getErrorMessage(dashboardQuery.error.value)"
      type="error"
      show-icon
      :closable="false"
    >
      <template #default>
        <el-button size="small" @click="dashboardQuery.refetch()">重新加载</el-button>
      </template>
    </el-alert>

    <section v-loading="dashboardQuery.isLoading.value" class="metric-grid" aria-label="运营指标">
      <article v-for="metric in metrics" :key="metric.label" class="metric-card">
        <div class="metric-icon" :class="metric.tone">
          <el-icon><component :is="metric.icon" /></el-icon>
        </div>
        <span>{{ metric.label }}</span>
        <strong>{{ metric.value }}</strong>
        <small>{{ metric.note }}</small>
      </article>
    </section>

    <section class="dashboard-grid">
      <article class="panel next-panel">
        <div class="panel-heading">
          <div>
            <span class="eyebrow">IMPLEMENTATION</span>
            <h3>接入顺序</h3>
          </div>
          <span class="phase-badge">运行状态</span>
        </div>
        <ol class="step-list">
          <li v-for="(step, index) in nextSteps" :key="step[0]">
            <span class="step-index">0{{ index + 1 }}</span>
            <div>
              <strong>{{ step[0] }}</strong>
              <p>{{ step[1] }}</p>
            </div>
            <el-icon><ArrowRight /></el-icon>
          </li>
        </ol>
      </article>

      <article class="panel baseline-panel">
        <div class="panel-heading">
          <div>
            <span class="eyebrow">BASELINE</span>
            <h3>当前能力边界</h3>
          </div>
        </div>
        <div class="baseline-score"><strong>1.0</strong><span>核心检索质量基线</span></div>
        <div class="baseline-row"><span>Recall@5</span><b>1.0</b></div>
        <div class="baseline-row"><span>MRR</span><b>1.0</b></div>
        <div class="baseline-row"><span>权限泄露</span><b>0</b></div>
        <p class="baseline-note">
          动态运营指标来自当前知识库与质量接口；评测得分仍以评测中心的固定评测集为准。
        </p>
      </article>
    </section>
  </div>
</template>
