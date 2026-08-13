<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { CircleCheck, Warning } from '@element-plus/icons-vue'

import { ApiError } from '@/services/api/client'
import { useAuthStore } from '@/stores/auth'
import { normalizeInternalPath } from '@/services/navigation'

const route = useRoute()
const router = useRouter()
const authStore = useAuthStore()
const errorMessage = ref('')

async function completeLogin(): Promise<void> {
  const providerError = typeof route.query.error === 'string' ? route.query.error : ''
  const code = typeof route.query.code === 'string' ? route.query.code : ''
  const state = typeof route.query.state === 'string' ? route.query.state : ''

  if (providerError || !code || !state) {
    errorMessage.value = providerError
      ? '企业身份平台未完成授权，请重新登录。'
      : '登录回调参数不完整，请重新登录。'
    return
  }

  try {
    const returnTo = await authStore.completeOidcLogin(code, state)
    await router.replace(normalizeInternalPath(returnTo))
  } catch (error) {
    errorMessage.value = error instanceof ApiError ? error.message : '企业统一登录失败，请重试。'
  }
}

onMounted(completeLogin)
</script>

<template>
  <main class="oidc-callback-page">
    <section class="oidc-callback-card">
      <template v-if="errorMessage">
        <el-icon class="oidc-callback-icon is-error"><Warning /></el-icon>
        <h1>登录未完成</h1>
        <p>{{ errorMessage }}</p>
        <el-button type="primary" @click="router.replace('/login')">返回登录页</el-button>
      </template>
      <template v-else>
        <el-icon class="oidc-callback-icon"><CircleCheck /></el-icon>
        <h1>正在完成企业登录</h1>
        <p>正在校验企业身份并加载账号权限，请稍候。</p>
      </template>
    </section>
  </main>
</template>
