<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { useQuery } from '@tanstack/vue-query'
import { Lock, OfficeBuilding, User } from '@element-plus/icons-vue'
import { ElMessage, type FormInstance, type FormRules } from 'element-plus'
import { useRoute, useRouter } from 'vue-router'

import { ApiError } from '@/services/api/client'
import * as organizationApi from '@/services/api/organizations'
import { useAuthStore } from '@/stores/auth'
import type { OrganizationRole } from '@/types/organization'

interface InvitationForm {
  name: string
  password: string
  passwordConfirm: string
}

const route = useRoute()
const router = useRouter()
const authStore = useAuthStore()
const formRef = ref<FormInstance>()
const submitting = ref(false)
const form = reactive<InvitationForm>({ name: '', password: '', passwordConfirm: '' })
const token = computed(() => (typeof route.query.token === 'string' ? route.query.token : ''))

const rules: FormRules<InvitationForm> = {
  name: [{ max: 100, message: '姓名不能超过 100 个字符', trigger: 'blur' }],
  password: [
    { required: true, message: '请设置登录密码', trigger: 'blur' },
    { min: 12, max: 128, message: '密码长度应为 12 至 128 个字符', trigger: 'blur' },
  ],
  passwordConfirm: [
    { required: true, message: '请再次输入密码', trigger: 'blur' },
    {
      validator: (_rule, value: string, callback) =>
        value === form.password ? callback() : callback(new Error('两次输入的密码不一致')),
      trigger: ['blur', 'change'],
    },
  ],
}

const invitationQuery = useQuery({
  queryKey: computed(() => ['organization-invitation', token.value]),
  queryFn: () => organizationApi.previewInvitation(token.value),
  enabled: computed(() => token.value.length === 43),
  retry: false,
})

const invitation = computed(() => invitationQuery.data.value)

function roleLabel(role: OrganizationRole): string {
  return {
    OWNER: '企业所有者',
    ADMIN: '企业管理员',
    KNOWLEDGE_ADMIN: '知识管理员',
    SUPPORT: '客服成员',
    MEMBER: '普通成员',
  }[role]
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}

function errorMessage(error: unknown): string {
  return error instanceof ApiError ? error.message : '邀请处理失败，请稍后重试'
}

async function acceptInvitation(): Promise<void> {
  if (!invitation.value || !(await formRef.value?.validate().catch(() => false))) return
  submitting.value = true
  try {
    const name = form.name.trim()
    await authStore.acceptOrganizationInvitation(token.value, {
      password: form.password,
      ...(name ? { name } : {}),
    })
    ElMessage.success(`已加入${invitation.value.organization.name}`)
    const managementRoles: OrganizationRole[] = ['ADMIN', 'KNOWLEDGE_ADMIN']
    await router.replace(managementRoles.includes(invitation.value.role) ? '/dashboard' : '/ask')
  } catch (error) {
    ElMessage.error(errorMessage(error))
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <main class="invitation-page">
    <section class="invitation-panel">
      <div class="invitation-brand"><span>知</span><strong>知识库智能助手</strong></div>

      <el-skeleton v-if="invitationQuery.isLoading.value" :rows="6" animated />

      <el-result
        v-else-if="!token || invitationQuery.isError.value"
        icon="warning"
        title="邀请链接不可用"
        :sub-title="errorMessage(invitationQuery.error.value)"
      >
        <template #extra>
          <el-button type="primary" @click="router.push('/login')">返回登录</el-button>
        </template>
      </el-result>

      <template v-else-if="invitation">
        <header class="invitation-header">
          <span class="invitation-icon"
            ><el-icon><OfficeBuilding /></el-icon
          ></span>
          <div>
            <span class="eyebrow">ENTERPRISE INVITATION</span>
            <h1>加入{{ invitation.organization.name }}</h1>
            <p>{{ invitation.email }}</p>
          </div>
        </header>

        <div class="invitation-meta">
          <div>
            <span>企业角色</span><strong>{{ roleLabel(invitation.role) }}</strong>
          </div>
          <div>
            <span>有效期至</span><strong>{{ formatDate(invitation.expiresAt) }}</strong>
          </div>
        </div>

        <el-form
          ref="formRef"
          :model="form"
          :rules="rules"
          label-position="top"
          @submit.prevent="acceptInvitation"
        >
          <el-form-item label="姓名" prop="name">
            <el-input v-model="form.name" :prefix-icon="User" placeholder="选填" />
          </el-form-item>
          <el-form-item label="设置登录密码" prop="password">
            <el-input
              v-model="form.password"
              :prefix-icon="Lock"
              type="password"
              show-password
              autocomplete="new-password"
            />
          </el-form-item>
          <el-form-item label="确认登录密码" prop="passwordConfirm">
            <el-input
              v-model="form.passwordConfirm"
              :prefix-icon="Lock"
              type="password"
              show-password
              autocomplete="new-password"
            />
          </el-form-item>
          <el-button
            class="invitation-submit"
            type="primary"
            native-type="submit"
            :loading="submitting"
          >
            接受邀请并登录
          </el-button>
        </el-form>
      </template>
    </section>
  </main>
</template>

<style scoped>
.invitation-page {
  display: grid;
  min-height: 100vh;
  padding: 32px 20px;
  place-items: center;
  background: #eef3f9;
}

.invitation-panel {
  width: min(520px, 100%);
  padding: 28px;
  border: 1px solid #dde5ef;
  border-radius: 8px;
  background: #fff;
  box-shadow: 0 18px 50px rgba(27, 49, 86, 0.1);
}

.invitation-brand,
.invitation-header {
  display: flex;
  align-items: center;
}

.invitation-brand {
  gap: 10px;
  margin-bottom: 30px;
  color: var(--ink);
}

.invitation-brand > span,
.invitation-icon {
  display: grid;
  place-items: center;
  color: #fff;
  background: #3568e8;
}

.invitation-brand > span {
  width: 34px;
  height: 34px;
  border-radius: 8px;
  font-weight: 700;
}

.invitation-header {
  gap: 14px;
}

.invitation-icon {
  flex: 0 0 48px;
  width: 48px;
  height: 48px;
  border-radius: 8px;
  font-size: 22px;
}

.invitation-header h1 {
  margin: 0;
  color: var(--ink);
  font-size: 24px;
  letter-spacing: 0;
}

.invitation-header p {
  margin: 5px 0 0;
  color: var(--muted);
  overflow-wrap: anywhere;
}

.invitation-meta {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  margin: 24px 0;
  border: 1px solid var(--line);
  border-radius: 8px;
}

.invitation-meta > div {
  display: grid;
  gap: 5px;
  padding: 15px;
}

.invitation-meta > div:first-child {
  border-right: 1px solid var(--line);
}

.invitation-meta span {
  color: var(--muted);
  font-size: 12px;
}

.invitation-meta strong {
  font-size: 14px;
}

.invitation-submit {
  width: 100%;
  margin-top: 6px;
}

@media (max-width: 520px) {
  .invitation-page {
    padding: 0;
    background: #fff;
  }

  .invitation-panel {
    min-height: 100vh;
    padding: 24px 20px;
    border: 0;
    box-shadow: none;
  }

  .invitation-meta {
    grid-template-columns: 1fr;
  }

  .invitation-meta > div:first-child {
    border-right: 0;
    border-bottom: 1px solid var(--line);
  }
}
</style>
