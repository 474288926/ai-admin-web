<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Lock, Message } from '@element-plus/icons-vue'
import { ElMessage, type FormInstance, type FormRules } from 'element-plus'

import { ApiError } from '@/services/api/client'
import * as authApi from '@/services/api/auth'
import { normalizeInternalPath } from '@/services/navigation'
import { useAuthStore } from '@/stores/auth'

interface LoginForm {
  email: string
  password: string
}

const entryMode = ref<'admin' | 'employee'>('admin')

const route = useRoute()
const router = useRouter()
const authStore = useAuthStore()
const formRef = ref<FormInstance>()
const submitting = ref(false)
const ssoSubmitting = ref(false)
const oidcConfig = ref<authApi.OidcPublicConfig | null>(null)
const form = reactive<LoginForm>({ email: '', password: '' })
const rules: FormRules<LoginForm> = {
  email: [
    { required: true, message: '请输入登录邮箱', trigger: 'blur' },
    { type: 'email', message: '请输入正确的邮箱地址', trigger: 'blur' },
  ],
  password: [{ required: true, message: '请输入密码', trigger: 'blur' }],
}

async function submit(): Promise<void> {
  if (!(await formRef.value?.validate().catch(() => false))) return

  submitting.value = true
  try {
    await authStore.login(form.email.trim(), form.password)
    const redirect = normalizeInternalPath(
      typeof route.query.redirect === 'string'
        ? route.query.redirect
        : entryMode.value === 'employee'
          ? '/ask'
          : '/dashboard',
      entryMode.value === 'employee' ? '/ask' : '/dashboard',
    )
    await router.replace(redirect)
  } catch (error) {
    ElMessage.error(error instanceof ApiError ? error.message : '登录失败，请稍后重试')
  } finally {
    submitting.value = false
  }
}

async function startEnterpriseLogin(): Promise<void> {
  ssoSubmitting.value = true
  try {
    const returnTo = normalizeInternalPath(
      typeof route.query.redirect === 'string'
        ? route.query.redirect
        : entryMode.value === 'employee'
          ? '/ask'
          : '/dashboard',
      entryMode.value === 'employee' ? '/ask' : '/dashboard',
    )
    window.location.assign(await authApi.startOidcLogin(returnTo))
  } catch (error) {
    ElMessage.error(error instanceof ApiError ? error.message : '企业统一登录暂时不可用')
    ssoSubmitting.value = false
  }
}

onMounted(async () => {
  try {
    oidcConfig.value = await authApi.getOidcConfig()
  } catch {
    oidcConfig.value = null
  }
})
</script>

<template>
  <main class="login-page">
    <section class="login-intro">
      <div class="login-brand"><span>知</span> 知识库智能助手</div>
      <div class="login-intro-content">
        <p class="eyebrow light">KNOWLEDGE, GOVERNED</p>
        <h1>让可信知识<br />持续服务业务。</h1>
        <p>统一维护内部制度、产品文档和操作手册，为员工问答与客服辅助提供可追溯的知识底座。</p>
        <div class="capability-list">
          <span>权限隔离</span><span>版本管理</span><span>质量评测</span><span>引用溯源</span>
        </div>
      </div>
      <p class="login-footnote">内部系统 · 请使用已授权账号登录</p>
    </section>

    <section class="login-panel">
      <div class="login-card">
        <div class="login-card-header">
          <span class="status-dot"></span>
          <span>运营管理工作台</span>
        </div>
        <h2>欢迎回来</h2>
        <p>
          {{
            entryMode === 'employee'
              ? '登录后查询已获授权的制度、产品文档与操作手册。'
              : '登录后管理知识入库、发布、权限和质量。'
          }}
        </p>

        <el-segmented
          v-model="entryMode"
          class="login-entry-switch"
          :options="[
            { label: '运营管理', value: 'admin' },
            { label: '员工问答', value: 'employee' },
          ]"
        />

        <el-form
          ref="formRef"
          :model="form"
          :rules="rules"
          label-position="top"
          @submit.prevent="submit"
        >
          <el-form-item label="邮箱" prop="email">
            <el-input
              v-model="form.email"
              :prefix-icon="Message"
              size="large"
              autocomplete="username"
              placeholder="name@company.com"
            />
          </el-form-item>
          <el-form-item label="密码" prop="password">
            <el-input
              v-model="form.password"
              :prefix-icon="Lock"
              size="large"
              type="password"
              show-password
              autocomplete="current-password"
              placeholder="请输入密码"
              @keyup.enter="submit"
            />
          </el-form-item>
          <el-button
            class="login-submit"
            type="primary"
            size="large"
            native-type="submit"
            :loading="submitting"
            >进入管理端</el-button
          >
        </el-form>

        <template v-if="oidcConfig?.enabled">
          <el-divider>或</el-divider>
          <el-button
            class="login-sso-submit"
            size="large"
            :loading="ssoSubmitting"
            @click="startEnterpriseLogin"
          >
            {{ oidcConfig.displayName }}
          </el-button>
        </template>
      </div>
    </section>
  </main>
</template>
