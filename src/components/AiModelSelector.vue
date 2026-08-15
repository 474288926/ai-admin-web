<script setup lang="ts">
import { computed, watch } from 'vue'
import { useQuery } from '@tanstack/vue-query'

import * as assistantApi from '@/services/api/assistant'

const MODEL_PREFERENCE_KEY = 'ai-admin-web:selected-model-id'

const selectedModelId = defineModel<string>({ default: '' })

const modelsQuery = useQuery({
  queryKey: ['ai-models'],
  queryFn: assistantApi.listAiModels,
  staleTime: 5 * 60 * 1000,
})
const models = computed(() => modelsQuery.data.value ?? [])

function readPreference(): string {
  try {
    return window.localStorage.getItem(MODEL_PREFERENCE_KEY) ?? ''
  } catch {
    return ''
  }
}

function savePreference(modelId: string): void {
  try {
    window.localStorage.setItem(MODEL_PREFERENCE_KEY, modelId)
  } catch {
    // 浏览器禁用本地存储时仍可在当前页面切换模型。
  }
}

watch(
  models,
  (items) => {
    if (!items.length || items.some((item) => item.id === selectedModelId.value)) return

    const preferredModelId = readPreference()
    const preferred = items.find((item) => item.id === preferredModelId)
    selectedModelId.value =
      preferred?.id ?? items.find((item) => item.isDefault)?.id ?? items[0]!.id
  },
  { immediate: true },
)

watch(selectedModelId, (modelId) => {
  if (models.value.some((item) => item.id === modelId)) savePreference(modelId)
})
</script>

<template>
  <div class="ai-model-selector">
    <span>AI 模型</span>
    <el-select
      v-model="selectedModelId"
      aria-label="选择 AI 模型"
      :loading="modelsQuery.isLoading.value"
      :disabled="modelsQuery.isError.value"
      :placeholder="modelsQuery.isError.value ? '使用服务端默认模型' : '选择模型'"
      :no-data-text="modelsQuery.isError.value ? '模型列表加载失败' : '暂无可用模型'"
    >
      <el-option
        v-for="model in models"
        :key="model.id"
        :label="model.displayName"
        :value="model.id"
      >
        <div class="ai-model-option">
          <span>{{ model.displayName }}</span>
          <el-tag v-if="model.isDefault" size="small" effect="plain">默认</el-tag>
        </div>
      </el-option>
    </el-select>
  </div>
</template>

<style scoped>
.ai-model-selector {
  display: flex;
  width: 190px;
  min-width: 0;
  align-items: center;
  gap: 8px;
}

.ai-model-selector > span {
  flex: 0 0 auto;
  color: #7d8796;
  font-size: 10px;
  font-weight: 600;
  white-space: nowrap;
}

.ai-model-selector :deep(.el-select) {
  width: 100%;
  min-width: 0;
  flex: 1;
}

.ai-model-option {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

@media (max-width: 640px) {
  .ai-model-selector {
    width: min(190px, 55vw);
  }

  .ai-model-selector > span {
    display: none;
  }
}
</style>
