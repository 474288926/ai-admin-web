<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query'
import {
  Collection,
  Delete,
  Document,
  EditPen,
  Key,
  Lock,
  Plus,
  Refresh,
  Search,
  Setting,
  UserFilled,
} from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox, type FormInstance, type FormRules } from 'element-plus'
import { useRouter } from 'vue-router'

import { canAccessCapability, canManageOrganizationKnowledge } from '@/router/access-control'
import { ApiError } from '@/services/api/client'
import * as knowledgeBaseApi from '@/services/api/knowledge-bases'
import { useAuthStore } from '@/stores/auth'
import type {
  CreateKnowledgeBaseInput,
  KnowledgeBase,
  KnowledgeBaseRuntimeValues,
  KnowledgeBaseRuntimeProfile,
  KnowledgeBaseVisibility,
  UpdateKnowledgeBaseInput,
} from '@/types/knowledge-base'

interface KnowledgeBaseForm {
  name: string
  description: string
  organizationId: string
  visibility: KnowledgeBaseVisibility
}

interface RuntimeProfileForm {
  revision: number
  profileType: string
  aiDefaultModelId: string
  ragPromptVersion: string
  aiMaxOutputTokens: number | null
  aiContextMessageLimit: number | null
  retrievalMinimumSimilarity: number | null
  retrievalKeywordMinimumScore: number | null
  rerankMinimumEvidenceScore: number | null
  rerankStrongEvidenceScore: number | null
}

type RuntimeField = keyof KnowledgeBaseRuntimeValues

const runtimeFields: Array<{ key: RuntimeField; label: string }> = [
  { key: 'aiDefaultModelId', label: '生成模型 ID' },
  { key: 'ragPromptVersion', label: 'Prompt 版本' },
  { key: 'aiMaxOutputTokens', label: '最大输出 Token' },
  { key: 'aiContextMessageLimit', label: '历史上下文消息数' },
  { key: 'retrievalMinimumSimilarity', label: '向量最低相似度' },
  { key: 'retrievalKeywordMinimumScore', label: '关键词最低召回分' },
  { key: 'rerankMinimumEvidenceScore', label: '最低证据分' },
  { key: 'rerankStrongEvidenceScore', label: '强证据分' },
]

const PAGE_SIZE = 20
const router = useRouter()
const authStore = useAuthStore()
const queryClient = useQueryClient()
const page = ref(1)
const search = ref('')
const visibilityFilter = ref<'ALL' | KnowledgeBaseVisibility>('ALL')
const dialogVisible = ref(false)
const editingId = ref<string | null>(null)
const formRef = ref<FormInstance>()
const form = reactive<KnowledgeBaseForm>({
  name: '',
  description: '',
  organizationId: '',
  visibility: 'PRIVATE',
})
const runtimeDialogVisible = ref(false)
const runtimeLoading = ref(false)
const runtimeSaving = ref(false)
const runtimeKnowledgeBase = ref<KnowledgeBase | null>(null)
const runtimeProfile = ref<KnowledgeBaseRuntimeProfile | null>(null)
const runtimeForm = reactive<RuntimeProfileForm>({
  revision: 0,
  profileType: 'general',
  aiDefaultModelId: '',
  ragPromptVersion: '',
  aiMaxOutputTokens: null,
  aiContextMessageLimit: null,
  retrievalMinimumSimilarity: null,
  retrievalKeywordMinimumScore: null,
  rerankMinimumEvidenceScore: null,
  rerankStrongEvidenceScore: null,
})

const rules: FormRules<KnowledgeBaseForm> = {
  name: [
    { required: true, message: '请输入知识库名称', trigger: 'blur' },
    { max: 100, message: '名称不能超过 100 个字符', trigger: 'blur' },
    {
      validator: (_rule, value: string, callback) =>
        value.trim() ? callback() : callback(new Error('名称不能全部为空格')),
      trigger: 'blur',
    },
  ],
  description: [{ max: 500, message: '描述不能超过 500 个字符', trigger: 'blur' }],
}

const knowledgeBasesQuery = useQuery({
  queryKey: computed(() => ['knowledge-bases', page.value, PAGE_SIZE]),
  queryFn: () => knowledgeBaseApi.listKnowledgeBases(page.value, PAGE_SIZE),
})

const organizationsQuery = useQuery({
  queryKey: ['organizations'],
  queryFn: knowledgeBaseApi.listOrganizations,
})

const createMutation = useMutation({
  mutationFn: (input: CreateKnowledgeBaseInput) => knowledgeBaseApi.createKnowledgeBase(input),
})

const updateMutation = useMutation({
  mutationFn: ({ id, input }: { id: string; input: UpdateKnowledgeBaseInput }) =>
    knowledgeBaseApi.updateKnowledgeBase(id, input),
})

const deleteMutation = useMutation({
  mutationFn: knowledgeBaseApi.deleteKnowledgeBase,
})

const knowledgeBases = computed(() => knowledgeBasesQuery.data.value?.items ?? [])
const meta = computed(() => knowledgeBasesQuery.data.value?.meta)
const submitting = computed(() => createMutation.isPending.value || updateMutation.isPending.value)
const dialogTitle = computed(() => (editingId.value ? '编辑知识库' : '新建知识库'))
const canManageKnowledge = computed(() =>
  canAccessCapability('knowledge:manage', authStore.organizationRoles),
)
const organizationMap = computed(
  () => new Map((organizationsQuery.data.value ?? []).map((item) => [item.id, item.name])),
)
const organizationRoleMap = computed(
  () =>
    new Map(
      (organizationsQuery.data.value ?? []).map((item) => [item.id, item.currentRole] as const),
    ),
)
const manageableOrganizations = computed(() =>
  (organizationsQuery.data.value ?? []).filter((item) =>
    canManageOrganizationKnowledge(item.currentRole),
  ),
)
const filteredKnowledgeBases = computed(() => {
  const keyword = search.value.trim().toLocaleLowerCase()
  return knowledgeBases.value.filter((item) => {
    const matchesVisibility =
      visibilityFilter.value === 'ALL' || item.visibility === visibilityFilter.value
    const matchesKeyword =
      !keyword ||
      item.name.toLocaleLowerCase().includes(keyword) ||
      item.description?.toLocaleLowerCase().includes(keyword)
    return matchesVisibility && matchesKeyword
  })
})

watch(
  () => form.organizationId,
  (organizationId) => {
    if (!organizationId) form.visibility = 'PRIVATE'
  },
)

function getErrorMessage(error: unknown): string {
  return error instanceof ApiError ? error.message : '操作失败，请稍后重试'
}

function formatRuntimeValue(value: unknown): string {
  return value === null || value === undefined || value === '' ? '未设置' : String(value)
}

function runtimeFieldState(field: RuntimeField): {
  override: unknown
  inherited: unknown
  effective: unknown
} {
  const profile = runtimeProfile.value
  return {
    override: profile?.overrides[field],
    inherited: profile?.systemDefaults[field],
    effective: profile?.effective[field],
  }
}

function resetForm(): void {
  editingId.value = null
  form.name = ''
  form.description = ''
  form.organizationId = ''
  form.visibility = 'PRIVATE'
  formRef.value?.clearValidate()
}

function openCreate(): void {
  if (!canManageKnowledge.value) {
    ElMessage.warning('当前角色只能查看知识库')
    return
  }
  resetForm()
  dialogVisible.value = true
}

function openEdit(row: Record<string, unknown>): void {
  const item = row as unknown as KnowledgeBase
  if (!canManageKnowledgeBase(item)) {
    ElMessage.warning('你没有管理此知识库的权限')
    return
  }
  editingId.value = item.id
  form.name = item.name
  form.description = item.description ?? ''
  form.organizationId = item.organizationId ?? ''
  form.visibility = item.visibility
  dialogVisible.value = true
}

async function loadRuntimeProfile(): Promise<void> {
  const item = runtimeKnowledgeBase.value
  if (!item) return
  runtimeLoading.value = true
  try {
    const profile = await knowledgeBaseApi.getKnowledgeBaseRuntimeProfile(item.id)
    runtimeProfile.value = profile
    runtimeForm.revision = profile.revision
    runtimeForm.profileType = profile.profileType
    runtimeForm.aiDefaultModelId = profile.overrides.aiDefaultModelId ?? ''
    runtimeForm.ragPromptVersion = profile.overrides.ragPromptVersion ?? ''
    runtimeForm.aiMaxOutputTokens = profile.overrides.aiMaxOutputTokens
    runtimeForm.aiContextMessageLimit = profile.overrides.aiContextMessageLimit
    runtimeForm.retrievalMinimumSimilarity = profile.overrides.retrievalMinimumSimilarity
    runtimeForm.retrievalKeywordMinimumScore = profile.overrides.retrievalKeywordMinimumScore
    runtimeForm.rerankMinimumEvidenceScore = profile.overrides.rerankMinimumEvidenceScore
    runtimeForm.rerankStrongEvidenceScore = profile.overrides.rerankStrongEvidenceScore
  } catch (error) {
    ElMessage.error(getErrorMessage(error))
  } finally {
    runtimeLoading.value = false
  }
}

async function openRuntimeProfile(row: Record<string, unknown>): Promise<void> {
  const item = row as unknown as KnowledgeBase
  if (!canManageKnowledgeBase(item)) {
    ElMessage.warning('你没有管理此知识库的权限')
    return
  }
  runtimeKnowledgeBase.value = item
  runtimeDialogVisible.value = true
  await loadRuntimeProfile()
}

async function restoreRuntimeInheritance(): Promise<void> {
  try {
    await ElMessageBox.confirm(
      '将清除本知识库的全部运行配置覆盖值，恢复继承系统默认配置。',
      '恢复系统继承',
      { type: 'warning', confirmButtonText: '恢复继承', cancelButtonText: '取消' },
    )
  } catch {
    return
  }

  runtimeForm.aiDefaultModelId = ''
  runtimeForm.ragPromptVersion = ''
  runtimeForm.aiMaxOutputTokens = null
  runtimeForm.aiContextMessageLimit = null
  runtimeForm.retrievalMinimumSimilarity = null
  runtimeForm.retrievalKeywordMinimumScore = null
  runtimeForm.rerankMinimumEvidenceScore = null
  runtimeForm.rerankStrongEvidenceScore = null
  await saveRuntimeProfile()
}

async function saveRuntimeProfile(): Promise<void> {
  const knowledgeBase = runtimeKnowledgeBase.value
  if (!knowledgeBase) return
  const minimum =
    runtimeForm.rerankMinimumEvidenceScore ??
    runtimeProfile.value?.effective.rerankMinimumEvidenceScore ??
    0
  const strong =
    runtimeForm.rerankStrongEvidenceScore ??
    runtimeProfile.value?.effective.rerankStrongEvidenceScore ??
    0
  if (strong <= minimum) {
    ElMessage.warning('强证据分必须高于最低证据分')
    return
  }

  runtimeSaving.value = true
  try {
    const profile = await knowledgeBaseApi.updateKnowledgeBaseRuntimeProfile(knowledgeBase.id, {
      revision: runtimeForm.revision,
      profileType: runtimeForm.profileType,
      aiDefaultModelId: runtimeForm.aiDefaultModelId.trim() || null,
      ragPromptVersion: runtimeForm.ragPromptVersion.trim() || null,
      aiMaxOutputTokens: runtimeForm.aiMaxOutputTokens,
      aiContextMessageLimit: runtimeForm.aiContextMessageLimit,
      retrievalMinimumSimilarity: runtimeForm.retrievalMinimumSimilarity,
      retrievalKeywordMinimumScore: runtimeForm.retrievalKeywordMinimumScore,
      rerankMinimumEvidenceScore: runtimeForm.rerankMinimumEvidenceScore,
      rerankStrongEvidenceScore: runtimeForm.rerankStrongEvidenceScore,
    })
    runtimeProfile.value = profile
    runtimeForm.revision = profile.revision
    ElMessage.success('知识库运行配置已更新')
    runtimeDialogVisible.value = false
  } catch (error) {
    if (
      error instanceof ApiError &&
      error.code === 'KNOWLEDGE_BASE_RUNTIME_PROFILE_REVISION_CONFLICT'
    ) {
      try {
        await ElMessageBox.confirm(
          '配置已被其他管理员更新，请重新加载最新配置后再保存。',
          '配置冲突',
          { type: 'warning', confirmButtonText: '重新加载', cancelButtonText: '关闭' },
        )
        await loadRuntimeProfile()
      } catch {
        // 用户关闭提示时保留当前编辑内容，避免无提示丢失输入。
      }
    } else {
      ElMessage.error(getErrorMessage(error))
    }
  } finally {
    runtimeSaving.value = false
  }
}

async function saveKnowledgeBase(): Promise<void> {
  const editingKnowledgeBase = editingId.value
    ? knowledgeBases.value.find((item) => item.id === editingId.value)
    : null
  if (
    (editingKnowledgeBase && !canManageKnowledgeBase(editingKnowledgeBase)) ||
    (!editingKnowledgeBase && !canManageSelectedOrganization())
  ) {
    ElMessage.warning('你没有在当前范围管理知识库的权限')
    return
  }
  if (!(await formRef.value?.validate().catch(() => false))) return

  const description = form.description.trim()
  try {
    if (editingId.value) {
      await updateMutation.mutateAsync({
        id: editingId.value,
        input: {
          name: form.name.trim(),
          description: description || null,
          visibility: form.organizationId ? form.visibility : 'PRIVATE',
        },
      })
      ElMessage.success('知识库已更新')
    } else {
      await createMutation.mutateAsync({
        name: form.name.trim(),
        ...(description ? { description } : {}),
        ...(form.organizationId ? { organizationId: form.organizationId } : {}),
        visibility: form.organizationId ? form.visibility : 'PRIVATE',
      })
      ElMessage.success('知识库已创建')
    }
    dialogVisible.value = false
    await queryClient.invalidateQueries({ queryKey: ['knowledge-bases'] })
  } catch (error) {
    ElMessage.error(getErrorMessage(error))
  }
}

async function removeKnowledgeBase(row: Record<string, unknown>): Promise<void> {
  const item = row as unknown as KnowledgeBase
  if (!canManageKnowledgeBase(item)) {
    ElMessage.warning('你没有管理此知识库的权限')
    return
  }
  try {
    await ElMessageBox.confirm(
      `删除后“${item.name}”将不再出现在管理端，现有数据会被软删除。`,
      '确认删除知识库',
      { confirmButtonText: '确认删除', cancelButtonText: '取消', type: 'warning' },
    )
    await deleteMutation.mutateAsync(item.id)
    ElMessage.success('知识库已删除')
    if (knowledgeBases.value.length === 1 && page.value > 1) page.value -= 1
    await queryClient.invalidateQueries({ queryKey: ['knowledge-bases'] })
  } catch (error) {
    if (error === 'cancel' || error === 'close') return
    ElMessage.error(getErrorMessage(error))
  }
}

function canManageSelectedOrganization(): boolean {
  if (!canManageKnowledge.value) return false
  if (!form.organizationId) return true
  return canManageOrganizationKnowledge(organizationRoleMap.value.get(form.organizationId))
}

function canManageKnowledgeBase(row: unknown): boolean {
  const item = row as KnowledgeBase
  if (!canManageKnowledge.value) return false
  if (item.organizationId === null) return true
  return canManageOrganizationKnowledge(organizationRoleMap.value.get(item.organizationId))
}

function visibilityLabel(value: KnowledgeBaseVisibility): string {
  return { PRIVATE: '仅自己', ORGANIZATION: '企业可见', RESTRICTED: '受限共享' }[value]
}

function visibilityType(value: KnowledgeBaseVisibility): 'info' | 'primary' | 'warning' {
  return { PRIVATE: 'info', ORGANIZATION: 'primary', RESTRICTED: 'warning' }[value] as
    | 'info'
    | 'primary'
    | 'warning'
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
</script>

<template>
  <div class="knowledge-page">
    <section class="knowledge-hero">
      <div>
        <span class="eyebrow">KNOWLEDGE SPACES</span>
        <h2>知识库</h2>
        <p>集中管理内部制度、产品文档、操作手册和客服知识，为每类内容设置明确的归属与访问范围。</p>
      </div>
      <el-button
        v-if="canManageKnowledge"
        type="primary"
        :icon="Plus"
        size="large"
        @click="openCreate"
        >新建知识库</el-button
      >
    </section>

    <section class="knowledge-toolbar">
      <div class="knowledge-search">
        <el-input
          v-model="search"
          :prefix-icon="Search"
          clearable
          placeholder="搜索当前页的名称或描述"
        />
        <el-select v-model="visibilityFilter" class="visibility-filter" aria-label="访问范围筛选">
          <el-option label="全部范围" value="ALL" />
          <el-option label="仅自己" value="PRIVATE" />
          <el-option label="企业可见" value="ORGANIZATION" />
          <el-option label="受限共享" value="RESTRICTED" />
        </el-select>
      </div>
      <div class="toolbar-meta">
        <span>共 {{ meta?.total ?? 0 }} 个知识库</span>
        <el-button
          :icon="Refresh"
          circle
          aria-label="刷新"
          :loading="knowledgeBasesQuery.isFetching.value"
          @click="knowledgeBasesQuery.refetch()"
        />
      </div>
    </section>

    <section v-loading="knowledgeBasesQuery.isLoading.value" class="knowledge-panel">
      <el-alert
        v-if="knowledgeBasesQuery.isError.value"
        title="知识库加载失败"
        :description="getErrorMessage(knowledgeBasesQuery.error.value)"
        type="error"
        show-icon
        :closable="false"
      >
        <template #default
          ><el-button size="small" @click="knowledgeBasesQuery.refetch()"
            >重新加载</el-button
          ></template
        >
      </el-alert>

      <el-empty
        v-else-if="!knowledgeBasesQuery.isLoading.value && filteredKnowledgeBases.length === 0"
        :description="
          knowledgeBases.length
            ? '当前筛选条件下没有知识库'
            : canManageKnowledge
              ? '还没有知识库，创建第一个知识空间吧'
              : '暂无可访问的知识库'
        "
      >
        <el-button
          v-if="!knowledgeBases.length && canManageKnowledge"
          type="primary"
          :icon="Plus"
          @click="openCreate"
          >新建知识库</el-button
        >
      </el-empty>

      <div v-else class="knowledge-table-wrap">
        <el-table :data="filteredKnowledgeBases" row-key="id">
          <el-table-column label="知识库" min-width="270">
            <template #default="{ row }">
              <div class="knowledge-name-cell">
                <div class="knowledge-symbol">
                  <el-icon><Collection /></el-icon>
                </div>
                <div>
                  <strong>{{ row.name }}</strong
                  ><span>{{ row.description || '暂无描述' }}</span>
                </div>
              </div>
            </template>
          </el-table-column>
          <el-table-column label="归属" min-width="150">
            <template #default="{ row }">
              <div class="ownership-cell">
                <el-icon><component :is="row.organizationId ? UserFilled : Lock" /></el-icon>
                <span>{{
                  row.organizationId
                    ? organizationMap.get(row.organizationId) || '所属企业'
                    : '个人知识库'
                }}</span>
              </div>
            </template>
          </el-table-column>
          <el-table-column label="访问范围" width="120">
            <template #default="{ row }"
              ><el-tag :type="visibilityType(row.visibility)" effect="light">{{
                visibilityLabel(row.visibility)
              }}</el-tag></template
            >
          </el-table-column>
          <el-table-column label="最后更新" width="175">
            <template #default="{ row }"
              ><span class="updated-at">{{ formatDate(row.updatedAt) }}</span></template
            >
          </el-table-column>
          <el-table-column label="操作" width="250" fixed="right">
            <template #default="{ row }">
              <div v-if="canManageKnowledgeBase(row)" class="table-actions">
                <el-button
                  link
                  type="primary"
                  :icon="Document"
                  @click="router.push({ name: 'documents', query: { knowledgeBaseId: row.id } })"
                  >文档</el-button
                >
                <el-button
                  link
                  :icon="Key"
                  @click="
                    router.push({
                      name: 'knowledge-base-grants',
                      params: { knowledgeBaseId: row.id },
                    })
                  "
                  >权限</el-button
                >
                <el-dropdown trigger="click">
                  <el-button link>更多</el-button>
                  <template #dropdown>
                    <el-dropdown-menu>
                      <el-dropdown-item :icon="EditPen" @click="openEdit(row)"
                        >编辑</el-dropdown-item
                      >
                      <el-dropdown-item :icon="Setting" @click="openRuntimeProfile(row)"
                        >运行配置</el-dropdown-item
                      >
                      <el-dropdown-item
                        :icon="Delete"
                        divided
                        class="danger-item"
                        @click="removeKnowledgeBase(row)"
                        >删除</el-dropdown-item
                      >
                    </el-dropdown-menu>
                  </template>
                </el-dropdown>
              </div>
              <el-tag v-else type="info" effect="plain">只读</el-tag>
            </template>
          </el-table-column>
        </el-table>
      </div>

      <div v-if="(meta?.totalPages ?? 0) > 1" class="knowledge-pagination">
        <el-pagination
          v-model:current-page="page"
          background
          layout="prev, pager, next"
          :page-size="PAGE_SIZE"
          :total="meta?.total ?? 0"
        />
      </div>
    </section>

    <el-dialog
      v-model="dialogVisible"
      :title="dialogTitle"
      width="min(560px, 92vw)"
      destroy-on-close
      @closed="resetForm"
    >
      <el-form
        ref="formRef"
        :model="form"
        :rules="rules"
        label-position="top"
        @submit.prevent="saveKnowledgeBase"
      >
        <el-form-item label="知识库名称" prop="name"
          ><el-input
            v-model="form.name"
            maxlength="100"
            show-word-limit
            placeholder="例如：客服产品知识库"
        /></el-form-item>
        <el-form-item label="归属范围">
          <el-select
            v-model="form.organizationId"
            class="form-full-width"
            :disabled="Boolean(editingId)"
            placeholder="个人知识库"
          >
            <el-option label="个人知识库" value="" />
            <el-option
              v-for="organization in manageableOrganizations"
              :key="organization.id"
              :label="organization.name"
              :value="organization.id"
            />
          </el-select>
          <span v-if="editingId" class="form-hint">知识库创建后不可变更归属企业。</span>
        </el-form-item>
        <el-form-item label="访问范围">
          <el-radio-group v-model="form.visibility">
            <el-radio-button value="PRIVATE">仅自己</el-radio-button>
            <el-radio-button value="ORGANIZATION" :disabled="!form.organizationId"
              >企业可见</el-radio-button
            >
            <el-radio-button value="RESTRICTED" :disabled="!form.organizationId"
              >受限共享</el-radio-button
            >
          </el-radio-group>
        </el-form-item>
        <el-form-item label="描述" prop="description"
          ><el-input
            v-model="form.description"
            type="textarea"
            :rows="4"
            maxlength="500"
            show-word-limit
            placeholder="说明知识范围、适用对象和维护责任。"
        /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="submitting" @click="saveKnowledgeBase">{{
          editingId ? '保存修改' : '创建知识库'
        }}</el-button>
      </template>
    </el-dialog>

    <el-dialog
      v-model="runtimeDialogVisible"
      class="runtime-profile-dialog"
      title="知识库运行配置"
      top="12px"
      width="min(720px, 94vw)"
      destroy-on-close
    >
      <div v-loading="runtimeLoading" class="runtime-profile-form">
        <el-alert
          v-if="runtimeProfile"
          :title="
            runtimeProfile.hasKnowledgeBaseOverrides
              ? `当前使用知识库专属策略 · ${runtimeProfile.profileType}`
              : '当前继承系统默认策略'
          "
          :description="
            runtimeProfile.hasKnowledgeBaseOverrides
              ? '本知识库的调整只会影响本知识库的问答和评测。'
              : '只填写需要差异化的字段，留空即可继续继承系统默认值。'
          "
          :type="runtimeProfile.hasKnowledgeBaseOverrides ? 'success' : 'info'"
          :closable="false"
          show-icon
        />
        <el-form v-if="runtimeProfile" label-position="top">
          <div class="runtime-profile-grid">
            <el-form-item label="知识库类型">
              <el-select v-model="runtimeForm.profileType" class="form-full-width">
                <el-option label="通用知识库" value="general" />
                <el-option label="产品文档" value="product" />
                <el-option label="客服辅助" value="customer_service" />
                <el-option label="制度政策" value="internal_policy" />
                <el-option label="操作手册" value="operation_manual" />
              </el-select>
            </el-form-item>
            <el-form-item label="生成模型 ID">
              <el-input
                v-model="runtimeForm.aiDefaultModelId"
                clearable
                placeholder="继承系统默认模型"
              />
            </el-form-item>
            <el-form-item label="Prompt 版本">
              <el-select
                v-model="runtimeForm.ragPromptVersion"
                clearable
                class="form-full-width"
                placeholder="继承系统默认 Prompt"
              >
                <el-option
                  v-for="prompt in runtimeProfile.availablePromptVersions"
                  :key="prompt.id"
                  :label="prompt.label"
                  :value="prompt.id"
                >
                  <span>{{ prompt.label }}</span>
                  <small class="prompt-option-description">{{ prompt.description }}</small>
                </el-option>
              </el-select>
            </el-form-item>
            <el-form-item label="最大输出 Token">
              <el-input-number
                v-model="runtimeForm.aiMaxOutputTokens"
                :min="1"
                :max="32768"
                controls-position="right"
                class="form-full-width"
                placeholder="继承默认值"
              />
            </el-form-item>
            <el-form-item label="历史上下文消息数">
              <el-input-number
                v-model="runtimeForm.aiContextMessageLimit"
                :min="1"
                :max="200"
                controls-position="right"
                class="form-full-width"
                placeholder="继承默认值"
              />
            </el-form-item>
            <el-form-item label="关键词最低召回分">
              <el-input-number
                v-model="runtimeForm.retrievalKeywordMinimumScore"
                :min="0"
                :max="1"
                :step="0.05"
                :precision="3"
                controls-position="right"
                class="form-full-width"
                placeholder="继承默认值"
              />
            </el-form-item>
            <el-form-item label="向量最低相似度">
              <el-input-number
                v-model="runtimeForm.retrievalMinimumSimilarity"
                :min="-1"
                :max="1"
                :step="0.05"
                :precision="3"
                controls-position="right"
                class="form-full-width"
                placeholder="继承默认值"
              />
            </el-form-item>
            <el-form-item label="最低证据分">
              <el-input-number
                v-model="runtimeForm.rerankMinimumEvidenceScore"
                :min="0"
                :max="1"
                :step="0.05"
                :precision="3"
                controls-position="right"
                class="form-full-width"
                placeholder="继承默认值"
              />
            </el-form-item>
            <el-form-item label="强证据分">
              <el-input-number
                v-model="runtimeForm.rerankStrongEvidenceScore"
                :min="0"
                :max="1"
                :step="0.05"
                :precision="3"
                controls-position="right"
                class="form-full-width"
                placeholder="继承默认值"
              />
            </el-form-item>
          </div>
          <div class="runtime-effective-values" aria-label="当前有效运行配置">
            <span class="runtime-effective-title">当前有效值</span>
            <span class="runtime-effective-item">
              <span>模型</span>
              <strong>{{ runtimeProfile.effective.aiDefaultModelId }}</strong>
            </span>
            <span class="runtime-effective-item">
              <span>Prompt</span>
              <strong>{{ runtimeProfile.effective.ragPromptVersion }}</strong>
            </span>
            <span class="runtime-effective-item">
              <span>最低证据分</span>
              <strong>{{ runtimeProfile.effective.rerankMinimumEvidenceScore }}</strong>
            </span>
            <span class="runtime-effective-item">
              <span>强证据分</span>
              <strong>{{ runtimeProfile.effective.rerankStrongEvidenceScore }}</strong>
            </span>
            <span class="runtime-effective-item">
              <span>向量阈值</span>
              <strong>{{ runtimeProfile.effective.retrievalMinimumSimilarity }}</strong>
            </span>
          </div>
          <div class="runtime-values-table" aria-label="运行配置来源对照">
            <div class="runtime-values-row runtime-values-header">
              <span>配置项</span>
              <span>知识库覆盖值</span>
              <span>系统继承值</span>
              <span>当前有效值</span>
            </div>
            <div v-for="field in runtimeFields" :key="field.key" class="runtime-values-row">
              <span class="runtime-values-label">{{ field.label }}</span>
              <span>{{ formatRuntimeValue(runtimeFieldState(field.key).override) }}</span>
              <span>{{ formatRuntimeValue(runtimeFieldState(field.key).inherited) }}</span>
              <strong>{{ formatRuntimeValue(runtimeFieldState(field.key).effective) }}</strong>
            </div>
          </div>
        </el-form>
      </div>
      <template #footer>
        <div class="runtime-dialog-actions">
          <el-button @click="runtimeDialogVisible = false">取消</el-button>
          <el-button :icon="Refresh" :disabled="runtimeSaving" @click="restoreRuntimeInheritance">
            恢复系统继承
          </el-button>
          <el-button type="primary" :loading="runtimeSaving" @click="saveRuntimeProfile">
            保存运行配置
          </el-button>
        </div>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.runtime-profile-form {
  min-height: 180px;
}

.prompt-option-description {
  display: block;
  color: var(--el-text-color-secondary);
  font-size: 12px;
  line-height: 1.4;
}

.runtime-profile-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0 18px;
  margin-top: 18px;
}

.runtime-effective-values {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px 18px;
  padding: 12px 14px;
  border: 1px solid var(--el-border-color-lighter);
  background: var(--el-fill-color-light);
  color: var(--el-text-color-secondary);
  font-size: 13px;
  line-height: 1.6;
}

.runtime-effective-title {
  grid-column: 1 / -1;
  color: var(--el-text-color-primary);
  font-weight: 600;
}

.runtime-effective-item {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 8px;
  min-width: 0;
}

.runtime-effective-item > span {
  color: var(--el-text-color-secondary);
  white-space: nowrap;
}

.runtime-effective-item strong {
  min-width: 0;
  overflow: hidden;
  color: var(--el-text-color-primary);
  font-weight: 500;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.runtime-dialog-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 8px;
}

.runtime-dialog-actions .el-button + .el-button {
  margin-left: 0;
}

.runtime-values-table {
  margin-top: 16px;
  overflow-x: auto;
  border: 1px solid var(--el-border-color-lighter);
}

.runtime-values-row {
  display: grid;
  grid-template-columns: minmax(140px, 1.2fr) repeat(3, minmax(120px, 1fr));
  min-width: 620px;
  gap: 12px;
  align-items: center;
  padding: 9px 12px;
  border-top: 1px solid var(--el-border-color-lighter);
  color: var(--el-text-color-regular);
  font-size: 12px;
}

.runtime-values-row:first-child {
  border-top: 0;
}

.runtime-values-header {
  background: var(--el-fill-color-light);
  color: var(--el-text-color-secondary);
  font-weight: 600;
}

.runtime-values-label {
  color: var(--el-text-color-primary);
  font-weight: 500;
}

@media (max-width: 640px) {
  .runtime-profile-grid {
    grid-template-columns: 1fr;
  }

  .runtime-effective-values {
    grid-template-columns: 1fr;
  }

  .runtime-effective-title {
    grid-column: auto;
  }

  .runtime-dialog-actions {
    display: grid;
    grid-template-columns: 1fr;
  }

  .runtime-dialog-actions .el-button {
    width: 100%;
    margin-left: 0;
  }
}
</style>
