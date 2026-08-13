<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query'
import {
  ArrowLeft,
  Avatar,
  Collection,
  Delete,
  OfficeBuilding,
  Plus,
  Refresh,
  UserFilled,
} from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useRoute, useRouter } from 'vue-router'

import { ApiError } from '@/services/api/client'
import * as knowledgeBaseApi from '@/services/api/knowledge-bases'
import type {
  ResourceGrantTargetType,
  ResourcePermissionLevel,
  UpsertKnowledgeBaseGrantInput,
} from '@/types/knowledge-base'

interface GrantRow {
  id: string
  targetType: ResourceGrantTargetType
  name: string
  detail: string
  permission: ResourcePermissionLevel
}

interface TargetOption {
  id: string
  label: string
  detail: string
}

const route = useRoute()
const router = useRouter()
const queryClient = useQueryClient()
const knowledgeBaseId = computed(() => String(route.params.knowledgeBaseId ?? ''))
const dialogVisible = ref(false)
const targetFilter = ref<'ALL' | ResourceGrantTargetType>('ALL')
const form = reactive<UpsertKnowledgeBaseGrantInput>({
  targetType: 'USER',
  targetId: '',
  permission: 'READ',
})

const knowledgeBaseQuery = useQuery({
  queryKey: computed(() => ['knowledge-base', knowledgeBaseId.value]),
  queryFn: () => knowledgeBaseApi.getKnowledgeBase(knowledgeBaseId.value),
})

const grantsQuery = useQuery({
  queryKey: computed(() => ['knowledge-base-grants', knowledgeBaseId.value]),
  queryFn: () => knowledgeBaseApi.listKnowledgeBaseGrants(knowledgeBaseId.value),
})

const organizationId = computed(
  () => grantsQuery.data.value?.organizationId ?? knowledgeBaseQuery.data.value?.organizationId,
)

const organizationQuery = useQuery({
  queryKey: computed(() => ['organization-structure', organizationId.value]),
  queryFn: () => knowledgeBaseApi.getOrganization(organizationId.value!),
  enabled: computed(() => Boolean(organizationId.value)),
})

const saveMutation = useMutation({
  mutationFn: (input: UpsertKnowledgeBaseGrantInput) =>
    knowledgeBaseApi.upsertKnowledgeBaseGrant(knowledgeBaseId.value, input),
})

const removeMutation = useMutation({
  mutationFn: ({ targetType, targetId }: Pick<GrantRow, 'targetType'> & { targetId: string }) =>
    knowledgeBaseApi.removeKnowledgeBaseGrant(knowledgeBaseId.value, targetType, targetId),
})

const knowledgeBase = computed(() => knowledgeBaseQuery.data.value)
const grants = computed(() => grantsQuery.data.value)
const isPersonal = computed(() => grants.value?.organizationId === null)
const isLoading = computed(() => knowledgeBaseQuery.isLoading.value || grantsQuery.isLoading.value)
const isError = computed(() => knowledgeBaseQuery.isError.value || grantsQuery.isError.value)
const grantRows = computed<GrantRow[]>(() => [
  ...(grants.value?.users ?? []).map((item) => ({
    id: item.userId,
    targetType: 'USER' as const,
    name: item.user.name || item.user.email,
    detail: item.user.name ? item.user.email : '企业成员',
    permission: item.permission,
  })),
  ...(grants.value?.departments ?? []).map((item) => ({
    id: item.departmentId,
    targetType: 'DEPARTMENT' as const,
    name: item.department.name,
    detail: '企业部门',
    permission: item.permission,
  })),
  ...(grants.value?.groups ?? []).map((item) => ({
    id: item.groupId,
    targetType: 'GROUP' as const,
    name: item.group.name,
    detail: '用户组',
    permission: item.permission,
  })),
])
const filteredRows = computed(() =>
  targetFilter.value === 'ALL'
    ? grantRows.value
    : grantRows.value.filter((item) => item.targetType === targetFilter.value),
)
const grantedTargetIds = computed(
  () =>
    new Set(
      grantRows.value.filter((item) => item.targetType === form.targetType).map((item) => item.id),
    ),
)
const targetOptions = computed<TargetOption[]>(() => {
  const organization = organizationQuery.data.value
  if (!organization) return []
  if (form.targetType === 'USER') {
    return organization.memberships
      .filter((item) => item.status === 'ACTIVE' && !grantedTargetIds.value.has(item.userId))
      .map((item) => ({
        id: item.userId,
        label: item.user.name || item.user.email,
        detail: `${item.user.email} · ${roleLabel(item.role)}`,
      }))
  }
  if (form.targetType === 'DEPARTMENT') {
    return organization.departments
      .filter((item) => !grantedTargetIds.value.has(item.id))
      .map((item) => ({ id: item.id, label: item.name, detail: '企业部门' }))
  }
  return organization.groups
    .filter((item) => !grantedTargetIds.value.has(item.id))
    .map((item) => ({ id: item.id, label: item.name, detail: item.description || '用户组' }))
})

watch(
  () => form.targetType,
  () => {
    form.targetId = ''
  },
)

function getErrorMessage(error: unknown): string {
  return error instanceof ApiError ? error.message : '操作失败，请稍后重试'
}

function openCreate(): void {
  form.targetType = 'USER'
  form.targetId = ''
  form.permission = 'READ'
  dialogVisible.value = true
}

async function refreshGrants(): Promise<void> {
  await Promise.all([
    knowledgeBaseQuery.refetch(),
    grantsQuery.refetch(),
    organizationQuery.refetch(),
  ])
}

async function saveGrant(): Promise<void> {
  if (!form.targetId) {
    ElMessage.warning('请选择授权对象')
    return
  }
  try {
    await saveMutation.mutateAsync({ ...form })
    dialogVisible.value = false
    ElMessage.success('共享权限已添加')
    await queryClient.invalidateQueries({
      queryKey: ['knowledge-base-grants', knowledgeBaseId.value],
    })
  } catch (error) {
    ElMessage.error(getErrorMessage(error))
  }
}

async function updatePermission(row: GrantRow, permission: ResourcePermissionLevel): Promise<void> {
  try {
    await saveMutation.mutateAsync({ targetType: row.targetType, targetId: row.id, permission })
    ElMessage.success('权限等级已更新')
    await queryClient.invalidateQueries({
      queryKey: ['knowledge-base-grants', knowledgeBaseId.value],
    })
  } catch (error) {
    ElMessage.error(getErrorMessage(error))
    await grantsQuery.refetch()
  }
}

async function removeGrant(row: GrantRow): Promise<void> {
  try {
    await ElMessageBox.confirm(
      `移除“${row.name}”的单独授权后，其仍可能通过企业可见范围或其他用户组获得访问权限。`,
      '确认移除授权',
      { confirmButtonText: '确认移除', cancelButtonText: '取消', type: 'warning' },
    )
    await removeMutation.mutateAsync({ targetType: row.targetType, targetId: row.id })
    ElMessage.success('共享权限已移除')
    await queryClient.invalidateQueries({
      queryKey: ['knowledge-base-grants', knowledgeBaseId.value],
    })
  } catch (error) {
    if (error === 'cancel' || error === 'close') return
    ElMessage.error(getErrorMessage(error))
  }
}

function targetLabel(value: ResourceGrantTargetType): string {
  return { USER: '成员', DEPARTMENT: '部门', GROUP: '用户组' }[value]
}

function targetIcon(value: ResourceGrantTargetType) {
  return { USER: UserFilled, DEPARTMENT: OfficeBuilding, GROUP: Avatar }[value]
}

function permissionLabel(value: ResourcePermissionLevel): string {
  return { READ: '只读', EDIT: '可编辑', MANAGE: '可管理' }[value]
}

function permissionDescription(value: ResourcePermissionLevel): string {
  return {
    READ: '查看知识库并进行问答',
    EDIT: '可维护文档和知识内容',
    MANAGE: '可编辑知识库并继续分配权限',
  }[value]
}

function roleLabel(value: string): string {
  return (
    {
      OWNER: '企业所有者',
      ADMIN: '企业管理员',
      KNOWLEDGE_ADMIN: '知识管理员',
      MEMBER: '企业成员',
      SUPPORT: '客服成员',
    }[value] ?? value
  )
}

function visibilityLabel(value?: string): string {
  return (
    { PRIVATE: '仅所有者', ORGANIZATION: '企业成员均可读取', RESTRICTED: '仅授权对象可访问' }[
      value ?? ''
    ] ?? '加载中'
  )
}
</script>

<template>
  <div class="grants-page">
    <section class="grants-hero">
      <div class="grants-title-block">
        <el-button link :icon="ArrowLeft" @click="router.push({ name: 'knowledge-bases' })"
          >返回知识库</el-button
        >
        <div>
          <span class="eyebrow">ACCESS CONTROL</span>
          <h2>{{ knowledgeBase?.name || '知识库权限' }}</h2>
          <p>按企业成员、部门或用户组分配访问权限。权限变更会立即影响知识检索和管理操作。</p>
        </div>
      </div>
      <el-button
        v-if="!isPersonal"
        type="primary"
        size="large"
        :icon="Plus"
        :disabled="isLoading || isError"
        @click="openCreate"
        >添加授权</el-button
      >
    </section>

    <el-alert
      v-if="isError"
      title="权限信息加载失败"
      :description="getErrorMessage(knowledgeBaseQuery.error.value || grantsQuery.error.value)"
      type="error"
      show-icon
      :closable="false"
    >
      <template #default
        ><el-button size="small" @click="refreshGrants">重新加载</el-button></template
      >
    </el-alert>

    <el-alert
      v-else-if="isPersonal"
      title="个人知识库不支持共享授权"
      description="如需向成员、部门或用户组共享，请创建企业知识库。"
      type="info"
      show-icon
      :closable="false"
    />

    <section v-loading="isLoading" class="access-summary">
      <div class="access-card access-card-primary">
        <span class="access-icon"
          ><el-icon><Collection /></el-icon
        ></span>
        <div>
          <span>知识库访问范围</span>
          <strong>{{ visibilityLabel(knowledgeBase?.visibility) }}</strong>
          <small>共享授权与此范围共同生效</small>
        </div>
      </div>
      <div class="access-card">
        <span>成员授权</span><strong>{{ grants?.users.length ?? 0 }}</strong
        ><small>单独指定的企业成员</small>
      </div>
      <div class="access-card">
        <span>部门授权</span><strong>{{ grants?.departments.length ?? 0 }}</strong
        ><small>覆盖部门内的有效成员</small>
      </div>
      <div class="access-card">
        <span>用户组授权</span><strong>{{ grants?.groups.length ?? 0 }}</strong
        ><small>适合跨部门协作范围</small>
      </div>
    </section>

    <section class="grants-panel">
      <div class="grants-toolbar">
        <div>
          <h3>共享授权</h3>
          <span>共 {{ grantRows.length }} 条单独授权</span>
        </div>
        <div class="grants-toolbar-actions">
          <el-segmented
            v-model="targetFilter"
            :options="[
              { label: '全部', value: 'ALL' },
              { label: '成员', value: 'USER' },
              { label: '部门', value: 'DEPARTMENT' },
              { label: '用户组', value: 'GROUP' },
            ]"
          />
          <el-button
            :icon="Refresh"
            circle
            aria-label="刷新权限"
            :loading="grantsQuery.isFetching.value"
            @click="refreshGrants"
          />
        </div>
      </div>

      <el-empty
        v-if="!isLoading && !isError && filteredRows.length === 0"
        :description="grantRows.length ? '当前分类下暂无授权' : '尚未添加单独授权'"
      >
        <el-button
          v-if="!isPersonal && !grantRows.length"
          type="primary"
          :icon="Plus"
          @click="openCreate"
          >添加第一条授权</el-button
        >
      </el-empty>

      <div v-else class="grant-list">
        <article v-for="row in filteredRows" :key="`${row.targetType}-${row.id}`" class="grant-row">
          <span class="grant-target-icon"
            ><el-icon><component :is="targetIcon(row.targetType)" /></el-icon
          ></span>
          <div class="grant-target-copy">
            <strong>{{ row.name }}</strong>
            <span
              ><el-tag size="small" effect="plain">{{ targetLabel(row.targetType) }}</el-tag
              >{{ row.detail }}</span
            >
          </div>
          <div class="grant-permission-copy">
            <strong>{{ permissionLabel(row.permission) }}</strong>
            <span>{{ permissionDescription(row.permission) }}</span>
          </div>
          <el-select
            :model-value="row.permission"
            class="grant-permission-select"
            aria-label="权限等级"
            :disabled="saveMutation.isPending.value"
            @change="updatePermission(row, $event as ResourcePermissionLevel)"
          >
            <el-option label="只读" value="READ" />
            <el-option label="可编辑" value="EDIT" />
            <el-option label="可管理" value="MANAGE" />
          </el-select>
          <el-button
            link
            type="danger"
            :icon="Delete"
            :loading="removeMutation.isPending.value"
            @click="removeGrant(row)"
            >移除</el-button
          >
        </article>
      </div>
    </section>

    <el-dialog v-model="dialogVisible" title="添加共享授权" width="min(560px, 92vw)">
      <el-form label-position="top" @submit.prevent="saveGrant">
        <el-form-item label="授权对象类型">
          <el-radio-group v-model="form.targetType">
            <el-radio-button value="USER">企业成员</el-radio-button>
            <el-radio-button value="DEPARTMENT">部门</el-radio-button>
            <el-radio-button value="GROUP">用户组</el-radio-button>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="授权对象" required>
          <el-select
            v-model="form.targetId"
            class="form-full-width"
            filterable
            :loading="organizationQuery.isLoading.value"
            :placeholder="targetOptions.length ? '请选择授权对象' : '没有可添加的授权对象'"
          >
            <el-option
              v-for="option in targetOptions"
              :key="option.id"
              :label="option.label"
              :value="option.id"
            >
              <div class="grant-option">
                <span>{{ option.label }}</span
                ><small>{{ option.detail }}</small>
              </div>
            </el-option>
          </el-select>
        </el-form-item>
        <el-form-item label="权限等级">
          <el-radio-group v-model="form.permission" class="permission-radio-group">
            <el-radio value="READ"><strong>只读</strong><span>查看与问答</span></el-radio>
            <el-radio value="EDIT"><strong>可编辑</strong><span>维护知识内容</span></el-radio>
            <el-radio value="MANAGE"><strong>可管理</strong><span>包含权限分配</span></el-radio>
          </el-radio-group>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="saveMutation.isPending.value" @click="saveGrant"
          >确认添加</el-button
        >
      </template>
    </el-dialog>
  </div>
</template>
