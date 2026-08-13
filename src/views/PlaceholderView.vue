<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { Connection, Right } from '@element-plus/icons-vue'

const route = useRoute()
const title = computed(() => String(route.meta.title ?? '功能模块'))
const description = computed(() => String(route.meta.description ?? '该模块将在后续步骤完成。'))
</script>

<template>
  <section class="module-placeholder">
    <div class="placeholder-icon">
      <el-icon><Connection /></el-icon>
    </div>
    <span class="eyebrow">MODULE READY</span>
    <h2>{{ title }}</h2>
    <p>{{ description }}</p>
    <div class="placeholder-status">
      <span></span>工程入口已建立，等待下一步接口接入<el-icon><Right /></el-icon>
    </div>
  </section>
</template>
