<script setup lang="ts">
import { computed } from 'vue'
import { useQuery } from '@tanstack/vue-query'

import * as assistantApi from '@/services/api/assistant'
import {
  estimateAiUsageCost,
  formatEstimatedCost,
  formatTokenCount,
  providerLabel,
} from '@/services/ai-usage'
import type { AiTokenUsage } from '@/types/assistant'

const props = defineProps<{
  provider: string | null
  model: string | null
  usage: AiTokenUsage | null
}>()

const modelsQuery = useQuery({
  queryKey: ['ai-models'],
  queryFn: assistantApi.listAiModels,
  staleTime: 5 * 60 * 1000,
})
const estimatedCost = computed(() => {
  if (!props.usage || !props.provider) return null
  const pricing = modelsQuery.data.value?.find(
    (model) => model.provider === props.provider,
  )?.pricing
  if (!pricing) return null
  return {
    label: formatEstimatedCost(estimateAiUsageCost(props.usage, pricing), pricing.currency),
    effectiveDate: pricing.effectiveDate,
  }
})

const tooltip = computed(() => {
  const parts = [props.model || '模型版本未记录']
  if (props.usage) {
    parts.push(`输入 ${formatTokenCount(props.usage.inputTokens)}`)
    parts.push(`输出 ${formatTokenCount(props.usage.outputTokens)}`)
    if (props.usage.cachedInputTokens) {
      parts.push(`缓存输入 ${formatTokenCount(props.usage.cachedInputTokens)}`)
    }
    if (props.usage.reasoningOutputTokens) {
      parts.push(`推理 ${formatTokenCount(props.usage.reasoningOutputTokens)}`)
    }
  }
  if (estimatedCost.value) {
    parts.push(`预估 ${estimatedCost.value.label}`)
    parts.push(`价格核验 ${estimatedCost.value.effectiveDate}`)
  }
  return parts.join(' · ')
})
</script>

<template>
  <el-tooltip :content="tooltip" placement="top">
    <span class="ai-usage-badge">
      <strong>{{ providerLabel(provider) }}</strong>
      <span v-if="model" class="ai-usage-model">{{ model }}</span>
      <span v-if="usage">{{ formatTokenCount(usage.totalTokens) }} Token</span>
      <em v-if="estimatedCost">≈{{ estimatedCost.label }}</em>
    </span>
  </el-tooltip>
</template>

<style scoped>
.ai-usage-badge {
  display: inline-flex;
  max-width: 100%;
  align-items: center;
  gap: 5px;
  padding: 2px 7px;
  border: 1px solid #dce4ef;
  border-radius: 999px;
  background: #f7f9fc;
  color: #667287;
  font-size: 9px;
  line-height: 1.5;
  white-space: nowrap;
}

.ai-usage-badge strong {
  color: #3d5f9d;
  font-size: inherit;
}

.ai-usage-badge em {
  color: #7a5a18;
  font-style: normal;
}

.ai-usage-model {
  max-width: 150px;
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>
