<script setup lang="ts">
import { computed, ref } from 'vue'
import { useQuery } from '@tanstack/vue-query'
import { Coin, Cpu, DataLine, Refresh, Tickets } from '@element-plus/icons-vue'

import { ApiError } from '@/services/api/client'
import { getAiUsageSummary } from '@/services/api/assistant'
import { formatEstimatedCost, formatTokenCount, providerLabel } from '@/services/ai-usage'
import type { AiUsageCostSummary } from '@/types/assistant'

function currentMonth(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

const selectedMonth = ref(currentMonth())
const usageQuery = useQuery({
  queryKey: computed(() => ['ai-usage-summary', selectedMonth.value]),
  queryFn: () => getAiUsageSummary(selectedMonth.value),
})

const report = computed(() => usageQuery.data.value)
const budgetAlerts = computed(() =>
  (report.value?.costs ?? []).filter(
    (cost) =>
      cost.usageRatio !== null && cost.usageRatio >= (report.value?.budgetPolicy.warningRatio ?? 1),
  ),
)
const metrics = computed(() => [
  {
    label: '模型调用',
    value: formatTokenCount(report.value?.totals.callCount ?? 0),
    note: '已完成的助手回复',
    icon: Cpu,
    tone: 'blue',
  },
  {
    label: '总 Token',
    value: formatTokenCount(report.value?.totals.totalTokens ?? 0),
    note: `输入 ${formatTokenCount(report.value?.totals.inputTokens ?? 0)} · 输出 ${formatTokenCount(report.value?.totals.outputTokens ?? 0)}`,
    icon: Tickets,
    tone: 'violet',
  },
  {
    label: '缓存输入',
    value: formatTokenCount(report.value?.totals.cachedInputTokens ?? 0),
    note: '按缓存命中单价估算',
    icon: Coin,
    tone: 'green',
  },
  {
    label: '推理输出',
    value: formatTokenCount(report.value?.totals.reasoningOutputTokens ?? 0),
    note: '已包含在输出 Token 中',
    icon: DataLine,
    tone: 'amber',
  },
])

function getErrorMessage(error: unknown): string {
  return error instanceof ApiError ? error.message : '模型用量加载失败，请稍后重试'
}

function budgetPercent(cost: AiUsageCostSummary): number {
  return Math.min(100, Math.round((cost.usageRatio ?? 0) * 10000) / 100)
}

function budgetStatus(cost: AiUsageCostSummary): 'success' | 'warning' | 'exception' | undefined {
  if (cost.usageRatio === null) return undefined
  if (cost.usageRatio >= 1) return 'exception'
  if (cost.usageRatio >= 0.8) return 'warning'
  return 'success'
}

function costListLabel(costs: Array<{ currency: 'CNY' | 'USD'; amount: number }>): string {
  return costs.length
    ? costs.map((cost) => formatEstimatedCost(cost.amount, cost.currency)).join(' · ')
    : '—'
}

function dateLabel(value: string): string {
  return new Intl.DateTimeFormat('zh-CN', { month: '2-digit', day: '2-digit' }).format(
    new Date(`${value}T00:00:00`),
  )
}
</script>

<template>
  <div class="usage-page">
    <section class="usage-hero">
      <div>
        <span class="eyebrow">AI COST CONTROL</span>
        <h2>我的模型用量</h2>
        <p>按月查看自己的模型调用、Token 消耗和预估费用，不包含其他用户的数据。</p>
      </div>
      <div class="usage-filter">
        <div>
          <span>统计月份</span>
          <el-date-picker
            v-model="selectedMonth"
            type="month"
            value-format="YYYY-MM"
            format="YYYY 年 MM 月"
            :clearable="false"
          />
        </div>
        <el-button
          :icon="Refresh"
          circle
          aria-label="刷新模型用量"
          :loading="usageQuery.isFetching.value"
          @click="usageQuery.refetch()"
        />
      </div>
    </section>

    <el-alert
      v-if="usageQuery.isError.value"
      title="模型用量加载失败"
      :description="getErrorMessage(usageQuery.error.value)"
      type="error"
      show-icon
      :closable="false"
    >
      <template #default>
        <el-button size="small" @click="usageQuery.refetch()">重新加载</el-button>
      </template>
    </el-alert>

    <el-alert
      v-for="cost in budgetAlerts"
      :key="cost.currency"
      :title="
        cost.usageRatio! >= (report?.budgetPolicy.fallbackRatio ?? 1)
          ? `${cost.currency} 月度预算已达到降级阈值`
          : `${cost.currency} 月度预算即将达到预警线`
      "
      :description="`${formatEstimatedCost(cost.amount, cost.currency)} / ${formatEstimatedCost(cost.budget ?? 0, cost.currency)}，已使用 ${((cost.usageRatio ?? 0) * 100).toFixed(1)}%${report?.budgetPolicy.autoFallbackEnabled ? '；达到降级阈值后将按配置自动切换模型。' : '。'}`"
      :type="cost.usageRatio! >= (report?.budgetPolicy.fallbackRatio ?? 1) ? 'error' : 'warning'"
      show-icon
      :closable="false"
    />

    <section v-loading="usageQuery.isLoading.value" class="usage-metrics" aria-label="用量概览">
      <article v-for="metric in metrics" :key="metric.label" class="usage-metric-card">
        <span class="usage-metric-icon" :class="metric.tone">
          <el-icon><component :is="metric.icon" /></el-icon>
        </span>
        <div>
          <span>{{ metric.label }}</span>
          <strong>{{ metric.value }}</strong>
          <small>{{ metric.note }}</small>
        </div>
      </article>
    </section>

    <section class="usage-grid">
      <article class="usage-panel budget-panel">
        <header>
          <div>
            <span class="eyebrow">MONTHLY BUDGET</span>
            <h3>预估费用与预算</h3>
          </div>
          <el-tag effect="plain">{{ report?.timeZone ?? 'Asia/Shanghai' }}</el-tag>
        </header>

        <el-empty
          v-if="!usageQuery.isLoading.value && !report?.costs.length"
          description="暂未配置模型计价"
        />
        <div v-else class="budget-list">
          <div v-for="cost in report?.costs ?? []" :key="cost.currency" class="budget-item">
            <div class="budget-heading">
              <div>
                <span>{{ cost.currency === 'CNY' ? '人民币费用' : '美元费用' }}</span>
                <strong>{{ formatEstimatedCost(cost.amount, cost.currency) }}</strong>
              </div>
              <span v-if="cost.budget !== null">
                预算 {{ formatEstimatedCost(cost.budget, cost.currency) }}
              </span>
              <span v-else>未配置预算</span>
            </div>
            <el-progress
              v-if="cost.budget !== null"
              :percentage="budgetPercent(cost)"
              :status="budgetStatus(cost)"
            />
            <p v-else>设置服务端月度预算后可在这里查看使用进度。</p>
          </div>
        </div>
        <p class="estimate-note">费用按当前配置单价估算；CNY 与 USD 分开统计，以厂商账单为准。</p>
      </article>

      <article class="usage-panel trend-panel">
        <header>
          <div>
            <span class="eyebrow">DAILY USAGE</span>
            <h3>每日消耗</h3>
          </div>
        </header>
        <el-empty
          v-if="!usageQuery.isLoading.value && !report?.daily.length"
          description="该月份暂无调用记录"
        />
        <div v-else class="daily-list">
          <div
            v-for="day in [...(report?.daily ?? [])].reverse()"
            :key="day.date"
            class="daily-row"
          >
            <span>{{ dateLabel(day.date) }}</span>
            <strong>{{ formatTokenCount(day.totalTokens) }} Token</strong>
            <small>{{ day.callCount }} 次 · {{ costListLabel(day.costs) }}</small>
          </div>
        </div>
      </article>
    </section>

    <section class="usage-panel model-panel">
      <header>
        <div>
          <span class="eyebrow">MODEL BREAKDOWN</span>
          <h3>模型明细</h3>
        </div>
      </header>
      <el-table :data="report?.byModel ?? []" empty-text="该月份暂无模型调用">
        <el-table-column label="提供方" min-width="130">
          <template #default="{ row }">{{ providerLabel(row.provider) }}</template>
        </el-table-column>
        <el-table-column prop="model" label="实际模型" min-width="220" show-overflow-tooltip />
        <el-table-column prop="callCount" label="调用次数" min-width="100" align="right" />
        <el-table-column label="输入 Token" min-width="120" align="right">
          <template #default="{ row }">{{ formatTokenCount(row.inputTokens) }}</template>
        </el-table-column>
        <el-table-column label="输出 Token" min-width="120" align="right">
          <template #default="{ row }">{{ formatTokenCount(row.outputTokens) }}</template>
        </el-table-column>
        <el-table-column label="总 Token" min-width="120" align="right">
          <template #default="{ row }">{{ formatTokenCount(row.totalTokens) }}</template>
        </el-table-column>
        <el-table-column label="预估费用" min-width="120" align="right">
          <template #default="{ row }">
            {{ row.cost ? formatEstimatedCost(row.cost.amount, row.cost.currency) : '未配置' }}
          </template>
        </el-table-column>
      </el-table>
    </section>
  </div>
</template>

<style scoped>
.usage-page {
  display: grid;
  gap: 22px;
}

.usage-hero,
.usage-panel,
.usage-metric-card {
  border: 1px solid var(--line);
  border-radius: 16px;
  background: #fff;
}

.usage-hero {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 26px 30px;
  background: linear-gradient(120deg, #fff 0%, #f4f7ff 100%);
}

.usage-hero h2,
.usage-panel h3 {
  margin: 0;
}

.usage-hero p {
  margin: 8px 0 0;
  color: var(--muted);
}

.usage-filter {
  display: flex;
  align-items: flex-end;
  gap: 10px;
}

.usage-filter > div {
  display: grid;
  gap: 6px;
}

.usage-filter span {
  color: var(--muted);
  font-size: 12px;
}

.usage-metrics {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 14px;
  min-height: 122px;
}

.usage-metric-card {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 20px;
}

.usage-metric-card > div {
  display: grid;
  min-width: 0;
}

.usage-metric-card span,
.usage-metric-card small,
.budget-heading span,
.daily-row small,
.estimate-note,
.budget-item p {
  color: var(--muted);
}

.usage-metric-card strong {
  margin: 3px 0;
  font-size: 25px;
}

.usage-metric-card small {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.usage-metric-icon {
  display: grid;
  flex: 0 0 42px;
  width: 42px;
  height: 42px;
  place-items: center;
  border-radius: 12px;
  font-size: 20px;
}

.usage-metric-icon.blue {
  color: #2f63e9;
  background: #eaf0ff;
}
.usage-metric-icon.violet {
  color: #7557d8;
  background: #f1edff;
}
.usage-metric-icon.green {
  color: #26966d;
  background: #e8f8f1;
}
.usage-metric-icon.amber {
  color: #bc7815;
  background: #fff5df;
}

.usage-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.15fr) minmax(320px, 0.85fr);
  gap: 18px;
}

.usage-panel {
  padding: 22px;
}

.usage-panel > header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 18px;
}

.budget-list,
.daily-list {
  display: grid;
  gap: 12px;
}

.budget-item,
.daily-row {
  padding: 14px 16px;
  border: 1px solid #e8edf5;
  border-radius: 12px;
  background: #fafcff;
}

.budget-heading {
  display: flex;
  align-items: end;
  justify-content: space-between;
  margin-bottom: 11px;
}

.budget-heading > div {
  display: grid;
}

.budget-heading strong {
  margin-top: 3px;
  font-size: 22px;
}

.budget-item p,
.estimate-note {
  margin: 8px 0 0;
  font-size: 12px;
}

.estimate-note {
  padding-top: 14px;
  border-top: 1px dashed var(--line);
}

.daily-row {
  display: grid;
  grid-template-columns: 80px 1fr auto;
  align-items: center;
  gap: 12px;
}

.daily-row strong {
  text-align: right;
}

.model-panel :deep(.el-table) {
  --el-table-border-color: #edf0f5;
}

@media (max-width: 1100px) {
  .usage-metrics {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .usage-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 720px) {
  .usage-hero {
    align-items: stretch;
    flex-direction: column;
    gap: 18px;
  }
  .usage-metrics {
    grid-template-columns: 1fr;
  }
  .daily-row {
    grid-template-columns: 70px 1fr;
  }
  .daily-row small {
    grid-column: 1 / -1;
  }
}
</style>
