<script setup lang="ts">
import { ArrowRight, CircleCheck, Clock, Document, Warning } from '@element-plus/icons-vue'

const metrics = [
  { label: '已发布文档', value: '—', note: '待连接知识库接口', icon: Document, tone: 'blue' },
  { label: '处理中任务', value: '—', note: '待连接任务接口', icon: Clock, tone: 'amber' },
  { label: '质量门禁', value: '通过', note: '阶段 5 基线已冻结', icon: CircleCheck, tone: 'green' },
  { label: '待处理反馈', value: '—', note: '待连接质量接口', icon: Warning, tone: 'red' },
]

const nextSteps = [
  ['知识库与文档', '接入列表、上传、元数据和发布状态'],
  ['处理任务', '接入进度轮询、取消与失败重试'],
  ['检索与质量', '接入调试、反馈分析和评测结果'],
]
</script>

<template>
  <div class="dashboard">
    <section class="welcome-banner">
      <div>
        <span class="banner-kicker">阶段 6 · 知识运营管理端</span>
        <h2>运营基座已经就绪</h2>
        <p>前端工程、登录会话和管理导航已建立，接下来按业务闭环逐项连接现有后端能力。</p>
      </div>
      <div class="banner-orbit" aria-hidden="true"><span>RAG</span></div>
    </section>

    <section class="metric-grid" aria-label="运营指标">
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
          <span class="phase-badge">当前阶段</span>
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
          数据来自阶段 5 已完成的后端质量基线；动态指标将在后续接口接入后展示。
        </p>
      </article>
    </section>
  </div>
</template>
