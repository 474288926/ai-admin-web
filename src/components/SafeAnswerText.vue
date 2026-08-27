<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'

import { splitAnswerText, type AnswerTextSegment } from '@/utils/external-links'

const props = withDefaults(
  defineProps<{
    text: string
    as?: string
  }>(),
  { as: 'span' },
)

const router = useRouter()
const segments = computed(() => splitAnswerText(props.text))

function linkHref(segment: Extract<AnswerTextSegment, { type: 'link' }>): string {
  if (segment.trusted) return segment.url
  return router.resolve({ name: 'external-link-warning', query: { target: segment.url } }).href
}
</script>

<template>
  <component :is="as" class="safe-answer-text">
    <template v-for="(segment, index) in segments" :key="`${index}-${segment.text}`">
      <a
        v-if="segment.type === 'link'"
        class="safe-answer-link"
        :class="{ 'is-trusted': segment.trusted }"
        :href="linkHref(segment)"
        target="_blank"
        rel="noopener noreferrer"
        :title="
          segment.trusted
            ? `可信白名单地址：${segment.hostname}`
            : `非白名单地址：${segment.hostname}，点击后需确认风险`
        "
        >{{ segment.text }}</a
      >
      <template v-else>{{ segment.text }}</template>
    </template>
  </component>
</template>
