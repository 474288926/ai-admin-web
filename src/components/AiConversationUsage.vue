<script setup lang="ts">
import { computed } from 'vue'
import { useQuery } from '@tanstack/vue-query'

import * as assistantApi from '@/services/api/assistant'
import {
  formatEstimatedCost,
  formatTokenCount,
  summarizeAiCosts,
  summarizeAiUsage,
} from '@/services/ai-usage'
import type { ConversationMessage } from '@/types/assistant'

const props = defineProps<{ messages: readonly ConversationMessage[] }>()

const modelsQuery = useQuery({
  queryKey: ['ai-models'],
  queryFn: assistantApi.listAiModels,
  staleTime: 5 * 60 * 1000,
})
const usage = computed(() => summarizeAiUsage(props.messages))
const costs = computed(() => summarizeAiCosts(props.messages, modelsQuery.data.value ?? []))
</script>

<template>
  <span v-if="usage.callCount" class="ai-conversation-usage">
    {{ usage.callCount }} 次调用 · {{ formatTokenCount(usage.totalTokens) }} Token
    <template v-for="cost in costs" :key="cost.currency">
      · 约 {{ formatEstimatedCost(cost.amount, cost.currency) }}
    </template>
  </span>
</template>
