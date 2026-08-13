<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ArrowRight, Collection, Connection, Lock, Monitor } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'

import * as authApi from '@/services/api/auth'
import { ApiError } from '@/services/api/client'
import { resolvePortalDestination } from '@/services/navigation'
import { useAuthStore } from '@/stores/auth'

const route = useRoute()
const router = useRouter()
const authStore = useAuthStore()
const loading = ref(true)
const ssoSubmitting = ref(false)
const oidcConfig = ref<authApi.OidcPublicConfig | null>(null)
const embedded = ref(false)
const destination = computed(() => resolvePortalDestination(route.query.target))

async function loadEntry(): Promise<void> {
  authStore.hydrate()
  if (authStore.isAuthenticated) {
    await router.replace(destination.value)
    return
  }

  try {
    oidcConfig.value = await authApi.getOidcConfig()
  } catch {
    oidcConfig.value = null
  } finally {
    loading.value = false
  }
}

async function startEnterpriseLogin(): Promise<void> {
  ssoSubmitting.value = true
  const popup = embedded.value ? window.open('about:blank', '_blank') : null
  try {
    const authorizationUrl = await authApi.startOidcLogin(destination.value)
    if (popup) {
      popup.opener = null
      popup.location.replace(authorizationUrl)
    } else {
      window.location.assign(authorizationUrl)
    }
  } catch (error) {
    popup?.close()
    ElMessage.error(error instanceof ApiError ? error.message : '企业统一登录暂时不可用')
    ssoSubmitting.value = false
  }
}

async function useLocalLogin(): Promise<void> {
  await router.push({ name: 'login', query: { redirect: destination.value } })
}

onMounted(() => {
  embedded.value = window.self !== window.top
  void loadEntry()
})
</script>

<template>
  <main class="portal-entry-page" :class="{ 'is-embedded': embedded }">
    <section class="portal-entry-brand">
      <div class="portal-entry-logo"><Collection /></div>
      <span>知识库智能助手</span>
    </section>

    <section class="portal-entry-card">
      <div class="portal-entry-eyebrow"><span></span> 企业知识入口</div>
      <h1>工作中的问题，<br />从可信知识开始。</h1>
      <p class="portal-entry-lead">
        查询内部制度、产品文档和操作手册。回答仅使用你有权访问的资料，并附带可追溯引用。
      </p>

      <div class="portal-entry-features">
        <article>
          <el-icon><Lock /></el-icon>
          <div><strong>权限一致</strong><span>自动继承企业账号和组织权限</span></div>
        </article>
        <article>
          <el-icon><Connection /></el-icon>
          <div><strong>证据可查</strong><span>每条回答都可查看来源与版本</span></div>
        </article>
        <article>
          <el-icon><Monitor /></el-icon>
          <div><strong>多端可用</strong><span>适配门户、OA 与桌面快捷入口</span></div>
        </article>
      </div>

      <div v-if="loading" class="portal-entry-loading">
        <span></span><span></span><span></span>
        <p>正在检查企业登录方式</p>
      </div>
      <div v-else class="portal-entry-actions">
        <el-button
          v-if="oidcConfig?.enabled"
          class="portal-entry-primary"
          type="primary"
          size="large"
          :loading="ssoSubmitting"
          @click="startEnterpriseLogin"
        >
          {{ oidcConfig.displayName }}
          <el-icon class="el-icon--right"><ArrowRight /></el-icon>
        </el-button>
        <el-button
          class="portal-entry-secondary"
          :class="{ 'is-fallback': oidcConfig?.enabled }"
          size="large"
          @click="useLocalLogin"
        >
          {{ oidcConfig?.enabled ? '使用内部账号' : '使用内部账号登录' }}
          <el-icon class="el-icon--right"><ArrowRight /></el-icon>
        </el-button>
      </div>

      <p v-if="embedded" class="portal-entry-embed-note">
        当前从办公门户打开，企业认证将在新窗口完成。
      </p>
    </section>

    <footer>企业内部知识服务 · 不会自动执行任何业务操作</footer>
  </main>
</template>
