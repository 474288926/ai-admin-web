<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useMutation, useQuery } from '@tanstack/vue-query'
import {
  CircleCheckFilled,
  Connection,
  DataLine,
  Promotion,
  Refresh,
  Stopwatch,
  Switch,
  WarningFilled,
} from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'

import { ApiError } from '@/services/api/client'
import {
  getAiProviderHealthSummary,
  retryAiProviderAlertDelivery,
  sendAiProviderAlertTest,
} from '@/services/api/assistant'
import { providerFailoverReasonLabel, providerLabel } from '@/services/ai-usage'
import type {
  AiProviderHealthModel,
  AiProviderHealthStatus,
  AiProviderIncident,
  AiProviderAlertDelivery,
  AiProviderAlertTestResult,
  AiProviderIncidentType,
} from '@/types/assistant'

const selectedDays = ref(7)
const healthQuery = useQuery({
  queryKey: computed(() => ['ai-provider-health', selectedDays.value]),
  queryFn: () => getAiProviderHealthSummary(selectedDays.value),
})

const report = computed(() => healthQuery.data.value)
const selectedAlertModelId = ref('')
const selectedAlertType = ref<AiProviderIncidentType>('circuit_opened')
const lastAlertDelivery = ref<AiProviderAlertTestResult | null>(null)
const retryingDeliveryId = ref<string | null>(null)
const alertTypeOptions = [
  { label: '熔断告警', value: 'circuit_opened' },
  { label: '恢复通知', value: 'circuit_recovered' },
]

watch(
  () => report.value?.models ?? [],
  (models) => {
    if (!models.some((model) => model.modelId === selectedAlertModelId.value)) {
      selectedAlertModelId.value = models[0]?.modelId ?? ''
    }
  },
  { immediate: true },
)

const alertTestMutation = useMutation({
  mutationFn: () =>
    sendAiProviderAlertTest({
      modelId: selectedAlertModelId.value,
      type: selectedAlertType.value,
    }),
})
const alertRetryMutation = useMutation({
  mutationFn: (deliveryId: string) => retryAiProviderAlertDelivery(deliveryId),
})
const maxDailyRequests = computed(() =>
  Math.max(1, ...(report.value?.daily.map((day) => day.requests) ?? [])),
)
const metrics = computed(() => [
  {
    label: '上游请求',
    value: formatNumber(report.value?.totals.requests ?? 0),
    note: `成功 ${formatNumber(report.value?.totals.successes ?? 0)} · 失败 ${formatNumber(report.value?.totals.failures ?? 0)}`,
    icon: Connection,
    tone: 'blue',
  },
  {
    label: '整体成功率',
    value: formatRate(report.value?.totals.successRate),
    note: '按每次模型请求尝试统计',
    icon: DataLine,
    tone: 'green',
  },
  {
    label: '平均响应耗时',
    value: formatDuration(report.value?.totals.averageDurationMs),
    note: '包含成功和失败请求',
    icon: Stopwatch,
    tone: 'violet',
  },
  {
    label: '故障切换',
    value: formatNumber(report.value?.totals.failovers ?? 0),
    note: '源模型切换至备用模型',
    icon: Switch,
    tone: 'amber',
  },
])

const statusMeta: Record<
  AiProviderHealthStatus,
  { label: string; type: 'success' | 'warning' | 'danger' | 'info' }
> = {
  healthy: { label: '健康', type: 'success' },
  degraded: { label: '需关注', type: 'warning' },
  unavailable: { label: '不可用', type: 'danger' },
  idle: { label: '暂无流量', type: 'info' },
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat('zh-CN').format(value)
}

function formatRate(value: number | null | undefined): string {
  return value === null || value === undefined ? '—' : `${(value * 100).toFixed(1)}%`
}

function formatDuration(value: number | null | undefined): string {
  if (value === null || value === undefined) return '—'
  return value >= 1000 ? `${(value / 1000).toFixed(2)} 秒` : `${value} ms`
}

function dateLabel(value: string): string {
  return new Intl.DateTimeFormat('zh-CN', { month: '2-digit', day: '2-digit' }).format(
    new Date(`${value}T00:00:00`),
  )
}

function requestBarWidth(requests: number): string {
  return `${Math.max(requests > 0 ? 5 : 0, (requests / maxDailyRequests.value) * 100)}%`
}

function failureBarWidth(requests: number, failures: number): string {
  return requests === 0 ? '0%' : `${(failures / requests) * 100}%`
}

function failureDetails(model: AiProviderHealthModel): string {
  const details = [
    ['超时', model.timeoutCount],
    ['限流', model.rateLimitCount],
    ['连接不可用', model.unavailableCount],
    ['服务端错误', model.providerErrorCount],
  ]
    .filter(([, count]) => Number(count) > 0)
    .map(([label, count]) => `${label} ${count}`)
  return details.length ? details.join(' · ') : '未发现瞬时 Provider 故障'
}

function getErrorMessage(error: unknown, fallback = '模型健康数据加载失败，请稍后重试'): string {
  return error instanceof ApiError ? error.message : fallback
}

function incidentDescription(incident: AiProviderIncident): string {
  if (incident.type === 'circuit_recovered') {
    return `${providerLabel(incident.modelId)} 已通过成功请求确认恢复，后续请求恢复直连。`
  }
  const reason = incident.reason ? providerFailoverReasonLabel(incident.reason) : '瞬时故障'
  return `${providerLabel(incident.modelId)}因${reason}连续失败 ${incident.failureCount ?? 0} 次，熔断 ${incident.openSeconds ?? 0} 秒。`
}

function incidentTime(value: string): string {
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(new Date(value))
}

async function testAlertDelivery(): Promise<void> {
  if (!selectedAlertModelId.value) return
  try {
    const result = await alertTestMutation.mutateAsync()
    lastAlertDelivery.value = result
    if (result.status === 'delivered') {
      ElMessage.success('测试告警已成功投递')
    } else if (result.status === 'disabled') {
      ElMessage.warning('Webhook 告警当前未启用')
    } else {
      ElMessage.error('Webhook 返回失败，请检查接收服务')
    }
    await healthQuery.refetch()
  } catch (error) {
    ElMessage.error(getErrorMessage(error, '测试告警发送失败，请稍后重试'))
  }
}

async function retryAlertDelivery(delivery: AiProviderAlertDelivery): Promise<void> {
  retryingDeliveryId.value = delivery.id
  try {
    const result = await alertRetryMutation.mutateAsync(delivery.id)
    lastAlertDelivery.value = result
    if (result.status === 'delivered') {
      ElMessage.success('失败告警已重新投递成功')
    } else {
      ElMessage.error('重新投递仍然失败，请检查 Webhook 接收服务')
    }
    await healthQuery.refetch()
  } catch (error) {
    ElMessage.error(getErrorMessage(error, '告警重试失败，请稍后再试'))
  } finally {
    retryingDeliveryId.value = null
  }
}

function deliveryLabel(result: AiProviderAlertTestResult): string {
  if (result.status === 'delivered') {
    return `投递成功${result.statusCode ? ` · HTTP ${result.statusCode}` : ''}`
  }
  if (result.status === 'disabled') return '告警通道未启用'
  return `投递失败 · ${deliveryFailureLabel(result.failureReason)}${
    result.statusCode ? ` · HTTP ${result.statusCode}` : ''
  }`
}

function deliveryFailureLabel(reason: AiProviderAlertDelivery['failureReason']): string {
  if (reason === 'alerts_disabled') return '通道关闭'
  if (reason === 'network_error') return '网络或超时错误'
  if (reason === 'http_error') return 'Webhook 响应错误'
  return '无失败信息'
}

function deliveryTriggerLabel(delivery: AiProviderAlertDelivery): string {
  if (delivery.trigger === 'manual') return '人工重试'
  if (delivery.trigger === 'automatic') return `自动重试 ${delivery.attempt - 1}`
  return '首次投递'
}

function deliveryTagType(
  status: AiProviderAlertTestResult['status'],
): 'success' | 'warning' | 'danger' {
  if (status === 'delivered') return 'success'
  return status === 'disabled' ? 'warning' : 'danger'
}
</script>

<template>
  <div class="health-page">
    <section class="health-hero">
      <div>
        <span class="eyebrow">AI RELIABILITY</span>
        <h2>模型健康与故障切换</h2>
        <p>聚合展示各模型的调用成功率、平均耗时和备用模型切换情况。</p>
      </div>
      <div class="health-actions">
        <el-segmented v-model="selectedDays" :options="[7, 14, 30]" />
        <el-button
          :icon="Refresh"
          circle
          aria-label="刷新模型健康数据"
          :loading="healthQuery.isFetching.value"
          @click="healthQuery.refetch()"
        />
      </div>
    </section>

    <el-alert
      v-if="healthQuery.isError.value"
      title="模型健康数据加载失败"
      :description="getErrorMessage(healthQuery.error.value)"
      type="error"
      show-icon
      :closable="false"
    >
      <template #default>
        <el-button size="small" @click="healthQuery.refetch()">重新加载</el-button>
      </template>
    </el-alert>

    <section v-loading="healthQuery.isLoading.value" class="health-metrics">
      <article v-for="metric in metrics" :key="metric.label" class="health-metric-card">
        <span class="health-metric-icon" :class="metric.tone">
          <el-icon><component :is="metric.icon" /></el-icon>
        </span>
        <div>
          <span>{{ metric.label }}</span>
          <strong>{{ metric.value }}</strong>
          <small>{{ metric.note }}</small>
        </div>
      </article>
    </section>

    <section class="health-panel">
      <header>
        <div>
          <span class="eyebrow">PROVIDER STATUS</span>
          <h3>模型状态</h3>
        </div>
        <el-tag effect="plain">{{ report?.period.timeZone ?? 'Asia/Shanghai' }}</el-tag>
      </header>
      <el-empty
        v-if="!healthQuery.isLoading.value && !report?.models.length"
        description="暂无已启用模型"
      />
      <div v-else class="provider-grid">
        <article v-for="model in report?.models ?? []" :key="model.modelId" class="provider-card">
          <header>
            <div>
              <span class="provider-mark">{{ model.displayName.slice(0, 1) }}</span>
              <div>
                <strong>{{ model.displayName }}</strong>
                <small>{{ model.modelId }}</small>
              </div>
            </div>
            <el-tag :type="statusMeta[model.status].type" effect="light">
              {{ model.circuitOpen ? '熔断中' : statusMeta[model.status].label }}
            </el-tag>
          </header>
          <div class="provider-stats">
            <div>
              <span>请求</span><strong>{{ formatNumber(model.requests) }}</strong>
            </div>
            <div>
              <span>成功率</span><strong>{{ formatRate(model.successRate) }}</strong>
            </div>
            <div>
              <span>平均耗时</span><strong>{{ formatDuration(model.averageDurationMs) }}</strong>
            </div>
          </div>
          <div class="provider-foot">
            <span v-if="model.circuitOpen" class="circuit-warning">
              已绕过源模型，约 {{ model.circuitRetryAfterSeconds ?? 0 }} 秒后自动试探恢复
            </span>
            <span v-else>{{ failureDetails(model) }}</span>
            <span>切出 {{ model.failoverOutCount }} · 切入 {{ model.failoverInCount }}</span>
          </div>
        </article>
      </div>
    </section>

    <section class="health-panel alert-test-panel">
      <header>
        <div>
          <span class="eyebrow">WEBHOOK CHECK</span>
          <h3>测试告警投递</h3>
        </div>
        <el-tag effect="plain" type="info">不会调用模型</el-tag>
      </header>
      <div class="alert-test-content">
        <div class="alert-test-copy">
          <strong>验证当前 Webhook 配置</strong>
          <p>发送模拟运维事件，不改变熔断状态，也不会写入真实事件时间线。</p>
        </div>
        <div class="alert-test-controls">
          <el-select
            v-model="selectedAlertModelId"
            aria-label="选择测试告警模型"
            placeholder="选择模型"
          >
            <el-option
              v-for="model in report?.models ?? []"
              :key="model.modelId"
              :label="model.displayName"
              :value="model.modelId"
            />
          </el-select>
          <el-segmented v-model="selectedAlertType" :options="alertTypeOptions" />
          <el-button
            type="primary"
            :icon="Promotion"
            :loading="alertTestMutation.isPending.value"
            :disabled="!selectedAlertModelId"
            @click="testAlertDelivery"
          >
            发送测试告警
          </el-button>
        </div>
      </div>
      <div v-if="lastAlertDelivery" class="alert-delivery-result">
        <el-tag :type="deliveryTagType(lastAlertDelivery.status)" effect="light">
          {{ deliveryLabel(lastAlertDelivery) }}
        </el-tag>
        <span>
          {{ providerLabel(lastAlertDelivery.modelId) }} ·
          {{ lastAlertDelivery.incidentType === 'circuit_opened' ? '熔断告警' : '恢复通知' }} ·
          {{ lastAlertDelivery.channel }}
        </span>
      </div>
      <div v-if="report?.alertDeliveries.length" class="delivery-history">
        <div class="delivery-history-title">
          <strong>最近投递</strong>
          <span>显示最近 {{ Math.min(report.alertDeliveries.length, 8) }} 条</span>
        </div>
        <article
          v-for="delivery in report.alertDeliveries.slice(0, 8)"
          :key="delivery.id"
          class="delivery-history-row"
        >
          <el-tag :type="deliveryTagType(delivery.status)" effect="plain" size="small">
            {{
              delivery.status === 'delivered'
                ? '成功'
                : delivery.status === 'disabled'
                  ? '关闭'
                  : '失败'
            }}
          </el-tag>
          <div>
            <strong>{{ providerLabel(delivery.modelId) }}</strong>
            <small>
              {{ delivery.incidentType === 'circuit_opened' ? '熔断告警' : '恢复通知' }} ·
              {{ deliveryTriggerLabel(delivery) }} · {{ delivery.channel }} ·
              {{ deliveryLabel(delivery) }}
            </small>
          </div>
          <div class="delivery-history-meta">
            <time :datetime="delivery.attemptedAt">{{ incidentTime(delivery.attemptedAt) }}</time>
            <el-button
              v-if="delivery.status === 'failed'"
              link
              type="primary"
              size="small"
              :loading="retryingDeliveryId === delivery.id"
              :disabled="retryingDeliveryId !== null && retryingDeliveryId !== delivery.id"
              @click="retryAlertDelivery(delivery)"
            >
              重试
            </el-button>
          </div>
        </article>
      </div>
    </section>

    <section class="health-panel incident-panel">
      <header>
        <div>
          <span class="eyebrow">INCIDENT TIMELINE</span>
          <h3>最近熔断事件</h3>
        </div>
        <span class="period-copy">最多保留 35 天</span>
      </header>
      <div v-if="report?.incidents.length" class="incident-list">
        <article v-for="incident in report.incidents" :key="incident.id" :class="incident.type">
          <span class="incident-icon">
            <el-icon>
              <WarningFilled v-if="incident.type === 'circuit_opened'" />
              <CircleCheckFilled v-else />
            </el-icon>
          </span>
          <div>
            <strong>
              {{ incident.type === 'circuit_opened' ? 'Provider 熔断触发' : 'Provider 已恢复' }}
            </strong>
            <p>{{ incidentDescription(incident) }}</p>
          </div>
          <time :datetime="incident.occurredAt">{{ incidentTime(incident.occurredAt) }}</time>
        </article>
      </div>
      <el-empty v-else-if="!healthQuery.isLoading.value" description="最近没有熔断或恢复事件" />
    </section>

    <section class="health-panel trend-panel">
      <header>
        <div>
          <span class="eyebrow">DAILY RELIABILITY</span>
          <h3>每日请求趋势</h3>
        </div>
        <span class="period-copy">最近 {{ report?.period.days ?? selectedDays }} 天</span>
      </header>
      <div v-if="report?.daily.length" class="health-trend">
        <div v-for="day in report.daily" :key="day.date" class="trend-row">
          <span>{{ dateLabel(day.date) }}</span>
          <div class="trend-track">
            <div class="request-bar" :style="{ width: requestBarWidth(day.requests) }">
              <i :style="{ width: failureBarWidth(day.requests, day.failures) }" />
            </div>
          </div>
          <strong>{{ day.requests }} 次</strong>
          <small>{{ formatRate(day.successRate) }}</small>
        </div>
      </div>
      <el-empty v-else-if="!healthQuery.isLoading.value" description="所选时间范围暂无调用记录" />
    </section>

    <p class="health-note">
      状态基于所选时间范围内的聚合请求判断；“需关注”表示出现失败、瞬时故障或故障切换。统计不包含提示词、回答内容、用户标识或密钥。
    </p>
  </div>
</template>

<style scoped>
.health-page {
  display: grid;
  gap: 20px;
}

.health-hero,
.health-panel,
.health-metric-card {
  border: 1px solid var(--line);
  border-radius: 16px;
  background: #fff;
}

.health-hero {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 26px 30px;
  background: linear-gradient(120deg, #fff 0%, #f3f8ff 100%);
}

.health-hero h2,
.health-panel h3 {
  margin: 0;
}

.health-hero p {
  margin: 8px 0 0;
  color: var(--muted);
}

.health-actions {
  display: flex;
  align-items: center;
  gap: 10px;
}

.health-metrics {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 14px;
  min-height: 122px;
}

.health-metric-card {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 20px;
}

.health-metric-card > div {
  display: grid;
  min-width: 0;
}

.health-metric-card span,
.health-metric-card small,
.provider-card small,
.provider-stats span,
.provider-foot,
.period-copy,
.health-note {
  color: var(--muted);
}

.health-metric-card strong {
  margin: 3px 0;
  font-size: 25px;
}

.health-metric-card small {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.health-metric-icon {
  display: grid;
  flex: 0 0 42px;
  width: 42px;
  height: 42px;
  place-items: center;
  border-radius: 12px;
  font-size: 20px;
}

.health-metric-icon.blue {
  color: #2f63e9;
  background: #eaf0ff;
}
.health-metric-icon.green {
  color: #26966d;
  background: #e8f8f1;
}
.health-metric-icon.violet {
  color: #7557d8;
  background: #f1edff;
}
.health-metric-icon.amber {
  color: #bc7815;
  background: #fff5df;
}

.health-panel {
  padding: 22px;
}

.health-panel > header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 18px;
}

.provider-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
}

.provider-card {
  padding: 18px;
  border: 1px solid #e5eaf2;
  border-radius: 13px;
  background: #fafcff;
}

.provider-card > header,
.provider-card > header > div {
  display: flex;
  align-items: center;
}

.provider-card > header {
  justify-content: space-between;
}

.provider-card > header > div {
  gap: 11px;
}

.provider-card > header > div > div {
  display: grid;
  gap: 3px;
}

.provider-mark {
  display: grid;
  width: 38px;
  height: 38px;
  place-items: center;
  border-radius: 10px;
  color: #315fcf;
  background: #eaf0ff;
  font-weight: 700;
}

.provider-stats {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 10px;
  margin: 18px 0 14px;
}

.provider-stats > div {
  display: grid;
  gap: 4px;
  padding: 10px;
  border-radius: 9px;
  background: #fff;
}

.provider-foot {
  display: flex;
  justify-content: space-between;
  gap: 14px;
  padding-top: 12px;
  border-top: 1px dashed #dfe5ee;
  font-size: 11px;
}

.circuit-warning {
  color: #c04e59;
  font-weight: 600;
}

.health-trend {
  display: grid;
  gap: 12px;
}

.alert-test-content {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 24px;
}

.alert-test-copy {
  min-width: 220px;
}

.alert-test-copy p {
  margin: 6px 0 0;
  color: var(--muted);
  font-size: 12px;
}

.alert-test-controls {
  display: flex;
  align-items: center;
  gap: 10px;
}

.alert-test-controls .el-select {
  width: 190px;
}

.alert-delivery-result {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 16px;
  padding-top: 14px;
  border-top: 1px dashed #dfe5ee;
  color: var(--muted);
  font-size: 12px;
}

.delivery-history {
  display: grid;
  gap: 0;
  margin-top: 16px;
  padding-top: 14px;
  border-top: 1px dashed #dfe5ee;
}

.delivery-history-title {
  display: flex;
  justify-content: space-between;
  margin-bottom: 6px;
}

.delivery-history-title span,
.delivery-history-row small,
.delivery-history-row time {
  color: var(--muted);
  font-size: 11px;
}

.delivery-history-row {
  display: grid;
  grid-template-columns: 56px minmax(0, 1fr) auto;
  align-items: center;
  gap: 12px;
  padding: 11px 0;
  border-top: 1px solid #edf0f5;
}

.delivery-history-row > div {
  display: grid;
  gap: 3px;
  min-width: 0;
}

.delivery-history-meta {
  justify-items: end;
}

.delivery-history-row time {
  white-space: nowrap;
}

.incident-list {
  display: grid;
}

.incident-list article {
  display: grid;
  grid-template-columns: 38px minmax(0, 1fr) auto;
  align-items: center;
  gap: 13px;
  padding: 14px 4px;
  border-top: 1px solid #edf0f5;
}

.incident-list article:first-child {
  border-top: 0;
}

.incident-icon {
  display: grid;
  width: 36px;
  height: 36px;
  place-items: center;
  border-radius: 50%;
  color: #bd5560;
  background: #ffebee;
}

.incident-list .circuit_recovered .incident-icon {
  color: #278065;
  background: #e5f7f0;
}

.incident-list article > div {
  min-width: 0;
}

.incident-list p {
  margin: 4px 0 0;
  color: var(--muted);
  font-size: 12px;
}

.incident-list time {
  color: #8a96a9;
  font-size: 11px;
  white-space: nowrap;
}

.trend-row {
  display: grid;
  grid-template-columns: 70px minmax(120px, 1fr) 60px 55px;
  align-items: center;
  gap: 12px;
  font-size: 12px;
}

.trend-row strong,
.trend-row small {
  text-align: right;
}

.trend-track {
  height: 10px;
  overflow: hidden;
  border-radius: 999px;
  background: #edf1f7;
}

.request-bar {
  position: relative;
  height: 100%;
  overflow: hidden;
  border-radius: inherit;
  background: #5b82e8;
}

.request-bar i {
  position: absolute;
  top: 0;
  right: 0;
  height: 100%;
  background: #dc6670;
}

.health-note {
  margin: 0;
  font-size: 11px;
  line-height: 1.7;
}

@media (max-width: 1100px) {
  .health-metrics,
  .provider-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 720px) {
  .health-hero {
    align-items: stretch;
    flex-direction: column;
    gap: 18px;
  }
  .health-actions {
    justify-content: space-between;
  }
  .health-metrics,
  .provider-grid {
    grid-template-columns: 1fr;
  }
  .provider-foot {
    flex-direction: column;
    gap: 5px;
  }
  .alert-test-content,
  .alert-test-controls,
  .alert-delivery-result {
    align-items: stretch;
    flex-direction: column;
  }
  .alert-test-controls .el-select {
    width: 100%;
  }
  .delivery-history-row {
    grid-template-columns: 56px minmax(0, 1fr);
  }
  .delivery-history-meta {
    grid-column: 2;
    justify-items: start;
  }
  .trend-row {
    grid-template-columns: 58px minmax(80px, 1fr) 48px;
  }
  .incident-list article {
    grid-template-columns: 36px minmax(0, 1fr);
  }
  .incident-list time {
    grid-column: 2;
  }
  .trend-row small {
    display: none;
  }
}
</style>
