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
  UserFilled,
} from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox, type FormInstance, type FormRules } from 'element-plus'
import { useRouter } from 'vue-router'

import { ApiError } from '@/services/api/client'
import * as knowledgeBaseApi from '@/services/api/knowledge-bases'
import type {
  CreateKnowledgeBaseInput,
  KnowledgeBase,
  KnowledgeBaseVisibility,
  UpdateKnowledgeBaseInput,
} from '@/types/knowledge-base'

interface KnowledgeBaseForm {
  name: string
  description: string
  organizationId: string
  visibility: KnowledgeBaseVisibility
}

const PAGE_SIZE = 20
const router = useRouter()
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
const organizationMap = computed(
  () => new Map((organizationsQuery.data.value ?? []).map((item) => [item.id, item.name])),
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

function resetForm(): void {
  editingId.value = null
  form.name = ''
  form.description = ''
  form.organizationId = ''
  form.visibility = 'PRIVATE'
  formRef.value?.clearValidate()
}

function openCreate(): void {
  resetForm()
  dialogVisible.value = true
}

function openEdit(row: Record<string, unknown>): void {
  const item = row as unknown as KnowledgeBase
  editingId.value = item.id
  form.name = item.name
  form.description = item.description ?? ''
  form.organizationId = item.organizationId ?? ''
  form.visibility = item.visibility
  dialogVisible.value = true
}

async function saveKnowledgeBase(): Promise<void> {
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
      <el-button type="primary" :icon="Plus" size="large" @click="openCreate">新建知识库</el-button>
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
          knowledgeBases.length ? '当前筛选条件下没有知识库' : '还没有知识库，创建第一个知识空间吧'
        "
      >
        <el-button v-if="!knowledgeBases.length" type="primary" :icon="Plus" @click="openCreate"
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
              <div class="table-actions">
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
              v-for="organization in organizationsQuery.data.value ?? []"
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
  </div>
</template>
