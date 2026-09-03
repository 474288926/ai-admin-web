<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { useQuery } from '@tanstack/vue-query'
import { Refresh, Search, Tickets } from '@element-plus/icons-vue'

import { ApiError } from '@/services/api/client'
import { listOrganizationAuditLogs } from '@/services/api/organization-audit'
import { getOrganization, listOrganizations } from '@/services/api/organizations'
import type { OrganizationAuditEntityType, OrganizationAuditLog } from '@/types/organization-audit'
import type { OrganizationRole } from '@/types/organization'

const PAGE_SIZE = 20
const ADMIN_ROLES: OrganizationRole[] = ['OWNER', 'ADMIN']

const actionOptions = [
  { value: 'organization.created', label: '创建企业' },
  { value: 'organization.member_upserted', label: '添加或启用成员' },
  { value: 'organization.member_updated', label: '调整成员角色或状态' },
  { value: 'organization.member_removed', label: '移除企业成员' },
  { value: 'organization.member_left', label: '成员退出企业' },
  { value: 'organization.ownership_transferred', label: '转移企业所有权' },
  { value: 'organization.invitation_created', label: '创建企业邀请' },
  { value: 'organization.invitation_revoked', label: '撤销企业邀请' },
  { value: 'organization.invitation_accepted', label: '接受企业邀请' },
  { value: 'organization.department_created', label: '创建部门' },
  { value: 'organization.department_updated', label: '更新部门' },
  { value: 'organization.department_deleted', label: '删除部门' },
  { value: 'organization.department_member_added', label: '添加部门成员' },
  { value: 'organization.department_member_removed', label: '移除部门成员' },
  { value: 'organization.group_created', label: '创建用户组' },
  { value: 'organization.group_updated', label: '更新用户组' },
  { value: 'organization.group_deleted', label: '删除用户组' },
  { value: 'organization.group_member_added', label: '添加用户组成员' },
  { value: 'organization.group_member_removed', label: '移除用户组成员' },
  { value: 'organization.directory_synchronized', label: '同步企业目录' },
  { value: 'knowledge_base.created', label: '创建知识库' },
  { value: 'knowledge_base.updated', label: '更新知识库' },
  { value: 'knowledge_base.deleted', label: '删除知识库' },
  { value: 'knowledge_base.grant_upserted', label: '配置知识库授权' },
  { value: 'knowledge_base.grant_removed', label: '移除知识库授权' },
  { value: 'document.metadata_updated', label: '更新文档元数据' },
  { value: 'document.version_created', label: '创建文档版本' },
  { value: 'document.business_evidence_created', label: '创建文档业务证据' },
  { value: 'document.audience_preparation_assigned', label: '分派或改派资料准备' },
  { value: 'document.audience_approval_created', label: '发起文档受众审批' },
  { value: 'document.audience_approval_assigned', label: '委托或改派文档受众审批' },
  { value: 'document.audience_approval_decided', label: '决定文档受众审批' },
  { value: 'document.audience_evidence_updated', label: '保存文档受众结论' },
  { value: 'knowledge_backlog.created', label: '创建知识缺口待办' },
  { value: 'knowledge_backlog.refreshed', label: '刷新知识缺口证据' },
  { value: 'knowledge_backlog.reopened', label: '重开知识缺口待办' },
  { value: 'knowledge_backlog.updated', label: '更新知识缺口待办' },
  { value: 'knowledge_backlog.verification_started', label: '启动知识缺口验证' },
  { value: 'knowledge_approval.created', label: '发起知识审批' },
  { value: 'knowledge_approval.decision_recorded', label: '记录知识审批决定' },
  { value: 'knowledge_approval.cancelled', label: '撤销知识审批' },
  { value: 'knowledge_approval.invalidated', label: '知识审批快照失效' },
  { value: 'knowledge_approval.roles_assigned', label: '设置知识审批分工' },
] as const

const actionLabelByValue = new Map<string, string>(
  actionOptions.map((item) => [item.value, item.label]),
)
const selectedOrganizationId = ref('')
const page = ref(1)
const dateRange = ref<[Date, Date] | null>(null)
const filters = reactive({
  entityType: '' as OrganizationAuditEntityType | '',
  action: '',
  actorUserId: '',
})
const appliedFilters = reactive({
  entityType: '' as OrganizationAuditEntityType | '',
  action: '',
  actorUserId: '',
  from: '',
  to: '',
})

const organizationsQuery = useQuery({
  queryKey: ['organizations'],
  queryFn: listOrganizations,
})
const adminOrganizations = computed(() =>
  (organizationsQuery.data.value ?? []).filter((organization) =>
    ADMIN_ROLES.includes(organization.currentRole),
  ),
)

watch(
  adminOrganizations,
  (organizations) => {
    if (!organizations.some((item) => item.id === selectedOrganizationId.value)) {
      selectedOrganizationId.value = organizations[0]?.id ?? ''
    }
  },
  { immediate: true },
)

watch(selectedOrganizationId, () => {
  page.value = 1
  filters.actorUserId = ''
  appliedFilters.actorUserId = ''
})

const organizationQuery = useQuery({
  queryKey: computed(() => ['organization', selectedOrganizationId.value]),
  queryFn: () => getOrganization(selectedOrganizationId.value),
  enabled: computed(() => Boolean(selectedOrganizationId.value)),
})

const actorOptions = computed(() => {
  const seen = new Set<string>()
  return (organizationQuery.data.value?.memberships ?? [])
    .filter((membership) => {
      if (seen.has(membership.userId)) return false
      seen.add(membership.userId)
      return true
    })
    .map((membership) => ({
      value: membership.userId,
      label: membership.user.name || membership.user.email,
      email: membership.user.name ? membership.user.email : '',
    }))
})

const auditQuery = useQuery({
  queryKey: computed(() => [
    'organization-audit',
    selectedOrganizationId.value,
    page.value,
    appliedFilters.entityType,
    appliedFilters.action,
    appliedFilters.actorUserId,
    appliedFilters.from,
    appliedFilters.to,
  ]),
  queryFn: () =>
    listOrganizationAuditLogs(selectedOrganizationId.value, {
      page: page.value,
      pageSize: PAGE_SIZE,
      entityType: appliedFilters.entityType || undefined,
      action: appliedFilters.action || undefined,
      actorUserId: appliedFilters.actorUserId || undefined,
      from: appliedFilters.from || undefined,
      to: appliedFilters.to || undefined,
    }),
  enabled: computed(() => Boolean(selectedOrganizationId.value)),
})

const records = computed(() => auditQuery.data.value?.items ?? [])
const meta = computed(() => auditQuery.data.value?.meta)

function applyFilters(): void {
  page.value = 1
  appliedFilters.entityType = filters.entityType
  appliedFilters.action = filters.action
  appliedFilters.actorUserId = filters.actorUserId
  appliedFilters.from = dateRange.value?.[0].toISOString() ?? ''
  appliedFilters.to = dateRange.value?.[1].toISOString() ?? ''
}

function resetFilters(): void {
  filters.entityType = ''
  filters.action = ''
  filters.actorUserId = ''
  dateRange.value = null
  applyFilters()
}

function actionLabel(action: string): string {
  return actionLabelByValue.get(action) ?? '其他受控操作'
}

function entityLabel(entityType: OrganizationAuditEntityType): string {
  return {
    ORGANIZATION: '企业',
    KNOWLEDGE_BASE: '知识库',
    DOCUMENT: '文档',
    KNOWLEDGE_BACKLOG: '知识缺口待办',
    KNOWLEDGE_APPROVAL: '知识审批',
  }[entityType]
}

function entityTagType(
  entityType: OrganizationAuditEntityType,
): 'primary' | 'success' | 'warning' | 'info' {
  if (entityType === 'KNOWLEDGE_BASE') return 'success'
  if (entityType === 'DOCUMENT') return 'warning'
  if (entityType === 'KNOWLEDGE_APPROVAL') return 'primary'
  return entityType === 'KNOWLEDGE_BACKLOG' ? 'info' : 'primary'
}

function actorName(value: unknown): string {
  const record = value as OrganizationAuditLog
  return record.actor?.name || record.actor?.email || '已删除账号'
}

function actorDetail(value: unknown): string {
  const record = value as OrganizationAuditLog
  return record.actor?.name ? record.actor.email : ''
}

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(new Date(value))
}

function changeValue(record: OrganizationAuditLog, key: string): string | number | boolean | null {
  return record.changes?.[key] ?? null
}

function roleLabel(value: unknown): string {
  return (
    {
      OWNER: '企业所有者',
      ADMIN: '企业管理员',
      KNOWLEDGE_ADMIN: '知识管理员',
      SUPPORT: '客服成员',
      MEMBER: '企业成员',
    }[String(value)] ?? String(value)
  )
}

function statusLabel(value: unknown): string {
  return { ACTIVE: '正常', SUSPENDED: '已停用', INVITED: '待加入' }[String(value)] ?? String(value)
}

function recordSummary(value: unknown): string {
  const record = value as OrganizationAuditLog
  const changes = record.changes
  if (
    record.action === 'organization.member_upserted' ||
    record.action === 'organization.member_updated'
  ) {
    const parts = []
    if (changes?.role) parts.push(`角色：${roleLabel(changes.role)}`)
    if (changes?.status) parts.push(`状态：${statusLabel(changes.status)}`)
    return parts.join('，') || '成员配置已更新'
  }
  if (
    record.action === 'organization.member_removed' ||
    record.action === 'organization.member_left'
  ) {
    return `角色：${roleLabel(changeValue(record, 'role') ?? 'MEMBER')}，关联授权已清理`
  }
  if (record.action === 'organization.ownership_transferred') return '企业所有权已转移给活跃成员'
  if (
    record.action === 'organization.invitation_created' ||
    record.action === 'organization.invitation_accepted'
  ) {
    return `邀请角色：${roleLabel(changeValue(record, 'role') ?? 'MEMBER')}`
  }
  if (record.action === 'organization.directory_synchronized') {
    const departments = Number(changeValue(record, 'departmentCreated') ?? 0)
    const members = Number(changeValue(record, 'memberCreated') ?? 0)
    const updated = Number(changeValue(record, 'memberUpdated') ?? 0)
    const suspended = Number(changeValue(record, 'memberSuspended') ?? 0)
    return `部门新增 ${departments}，成员新增 ${members}、更新 ${updated}、停用 ${suspended}`
  }
  if (record.action === 'knowledge_base.grant_upserted') {
    return `权限级别：${String(changeValue(record, 'permission') ?? '已更新')}`
  }
  if (record.action === 'knowledge_base.created' || record.action === 'knowledge_base.updated') {
    const visibility = changeValue(record, 'visibility')
    return visibility ? `可见范围：${String(visibility)}` : '知识库配置已更新'
  }
  if (record.action === 'document.version_created') {
    return `创建版本 V${String(changeValue(record, 'version') ?? '')}`.trim()
  }
  if (record.action === 'document.metadata_updated') return '文档受控元数据已更新'
  if (record.action === 'document.business_evidence_created') {
    return `业务证据编号：${String(changeValue(record, 'reference') ?? '-')}`
  }
  if (record.action === 'document.audience_approval_created') {
    return `文档审批编号：${String(changeValue(record, 'reference') ?? '-')}`
  }
  if (record.action === 'document.audience_approval_assigned') {
    return `委托或改派文档审批：${String(changeValue(record, 'reference') ?? '-')}`
  }
  if (record.action === 'document.audience_approval_decided') {
    const decision = changeValue(record, 'decision') === 'APPROVED' ? '批准' : '驳回'
    return `${decision}文档审批：${String(changeValue(record, 'reference') ?? '-')}`
  }
  if (record.action === 'document.audience_evidence_updated') {
    const audience =
      changeValue(record, 'proposedAudienceTag') === 'audience:customer-citable'
        ? '客服可引用'
        : '仅内部使用'
    return `正式受众结论：${audience}`
  }
  if (
    record.action === 'knowledge_backlog.created' ||
    record.action === 'knowledge_backlog.refreshed'
  ) {
    return `无答案 ${Number(changeValue(record, 'noAnswerCount') ?? 0)} 次，负反馈 ${Number(changeValue(record, 'unhelpfulCount') ?? 0)} 次`
  }
  if (record.action === 'knowledge_backlog.reopened') return '问题复发，待办已恢复为待处理'
  if (record.action === 'knowledge_backlog.verification_started') return '已创建并关联完整验证运行'
  if (record.action === 'knowledge_approval.created') {
    return `审批编号：${String(changeValue(record, 'reference') ?? '-')}`
  }
  if (record.action === 'knowledge_approval.decision_recorded') {
    const decision = changeValue(record, 'decision') === 'APPROVED' ? '批准' : '驳回'
    return `${decision} ${String(changeValue(record, 'role') ?? '')}，审批状态：${String(changeValue(record, 'statusTo') ?? '')}`
  }
  if (record.action === 'knowledge_approval.cancelled') return '待处理审批已撤销'
  if (record.action === 'knowledge_approval.invalidated') return '契约或知识范围变化，旧审批已失效'
  if (record.action === 'knowledge_approval.roles_assigned') return '已为三个职责指定独立审批人'
  if (record.action === 'knowledge_backlog.updated') {
    const parts: string[] = []
    const statusTo = changeValue(record, 'statusTo')
    if (statusTo) parts.push(`状态：${String(statusTo)}`)
    if (changeValue(record, 'titleChanged')) parts.push('标题已修改')
    if (changeValue(record, 'noteChanged')) parts.push('备注已修改')
    if ('dueAtTo' in (record.changes ?? {})) {
      parts.push(changeValue(record, 'dueAtTo') ? '处理期限已设置' : '处理期限已清除')
    }
    if ('linkedDocumentIdTo' in (record.changes ?? {})) parts.push('文档关联已变更')
    if ('verificationRunIdTo' in (record.changes ?? {})) parts.push('验证关联已变更')
    return parts.join('，') || '待办版本已更新'
  }
  if (record.action.includes('department_member') || record.action.includes('group_member')) {
    return '组织单元成员关系已更新'
  }
  if (record.action.includes('department') || record.action.includes('group')) {
    return '企业组织结构已更新'
  }
  return changes ? '记录了受控配置变更' : '无附加变更信息'
}

function getErrorMessage(error: unknown): string {
  return error instanceof ApiError ? error.message : '审计记录加载失败，请稍后重试'
}
</script>

<template>
  <div class="audit-page">
    <section class="audit-heading">
      <div>
        <span class="eyebrow">ORGANIZATION GOVERNANCE</span>
        <h2>企业操作审计</h2>
        <p>按企业、操作类型、操作者和时间范围追踪关键管理动作。</p>
      </div>
      <el-button
        :icon="Refresh"
        circle
        aria-label="刷新审计记录"
        :loading="auditQuery.isFetching.value"
        :disabled="!selectedOrganizationId"
        @click="auditQuery.refetch()"
      />
    </section>

    <section class="audit-filters" aria-label="审计筛选">
      <div class="audit-filter-grid">
        <el-form-item label="企业">
          <el-select
            v-model="selectedOrganizationId"
            placeholder="选择企业"
            :loading="organizationsQuery.isLoading.value"
          >
            <el-option
              v-for="organization in adminOrganizations"
              :key="organization.id"
              :label="organization.name"
              :value="organization.id"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="对象类型">
          <el-select v-model="filters.entityType" clearable placeholder="全部对象">
            <el-option label="企业" value="ORGANIZATION" />
            <el-option label="知识库" value="KNOWLEDGE_BASE" />
            <el-option label="文档" value="DOCUMENT" />
            <el-option label="知识缺口待办" value="KNOWLEDGE_BACKLOG" />
            <el-option label="知识审批" value="KNOWLEDGE_APPROVAL" />
          </el-select>
        </el-form-item>
        <el-form-item label="操作类型">
          <el-select v-model="filters.action" clearable filterable placeholder="全部操作">
            <el-option
              v-for="option in actionOptions"
              :key="option.value"
              :label="option.label"
              :value="option.value"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="操作人">
          <el-select v-model="filters.actorUserId" clearable filterable placeholder="全部人员">
            <el-option
              v-for="actor in actorOptions"
              :key="actor.value"
              :label="actor.label"
              :value="actor.value"
            >
              <span>{{ actor.label }}</span>
              <small v-if="actor.email">{{ actor.email }}</small>
            </el-option>
          </el-select>
        </el-form-item>
        <el-form-item class="date-filter" label="操作时间">
          <el-date-picker
            v-model="dateRange"
            type="datetimerange"
            start-placeholder="开始时间"
            end-placeholder="结束时间"
            range-separator="至"
          />
        </el-form-item>
      </div>
      <div class="audit-filter-actions">
        <el-button @click="resetFilters">重置</el-button>
        <el-button type="primary" :icon="Search" @click="applyFilters">查询</el-button>
      </div>
    </section>

    <el-alert
      v-if="organizationsQuery.isError.value"
      title="无法读取企业列表"
      :description="getErrorMessage(organizationsQuery.error.value)"
      type="error"
      show-icon
      :closable="false"
    />

    <el-empty
      v-else-if="!organizationsQuery.isLoading.value && adminOrganizations.length === 0"
      description="当前账号没有可查询审计记录的企业"
    />

    <section v-else class="audit-results" aria-labelledby="audit-results-title">
      <header>
        <div class="audit-results-title">
          <span class="audit-results-icon"
            ><el-icon><Tickets /></el-icon
          ></span>
          <div>
            <h3 id="audit-results-title">操作记录</h3>
            <p>共 {{ meta?.total ?? 0 }} 条，变更内容已按安全字段白名单展示</p>
          </div>
        </div>
      </header>

      <el-alert
        v-if="auditQuery.isError.value"
        title="审计记录加载失败"
        :description="getErrorMessage(auditQuery.error.value)"
        type="error"
        show-icon
        :closable="false"
      >
        <template #default>
          <el-button size="small" @click="auditQuery.refetch()">重新加载</el-button>
        </template>
      </el-alert>

      <div v-else v-loading="auditQuery.isLoading.value" class="audit-records">
        <el-empty
          v-if="!auditQuery.isLoading.value && records.length === 0"
          description="当前条件下暂无审计记录"
          :image-size="72"
        />

        <el-table v-else class="audit-table" :data="records">
          <el-table-column label="操作时间" width="184">
            <template #default="scope">
              <time :datetime="scope.row.createdAt">{{ formatDateTime(scope.row.createdAt) }}</time>
            </template>
          </el-table-column>
          <el-table-column label="操作人" min-width="190">
            <template #default="scope">
              <div class="actor-cell">
                <strong>{{ actorName(scope.row) }}</strong>
                <span v-if="actorDetail(scope.row)">{{ actorDetail(scope.row) }}</span>
              </div>
            </template>
          </el-table-column>
          <el-table-column label="对象" width="112">
            <template #default="scope">
              <el-tag :type="entityTagType(scope.row.entityType)" effect="plain">
                {{ entityLabel(scope.row.entityType) }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column label="操作" min-width="190">
            <template #default="scope">
              <strong>{{ actionLabel(scope.row.action) }}</strong>
            </template>
          </el-table-column>
          <el-table-column label="变更摘要" min-width="300">
            <template #default="scope">{{ recordSummary(scope.row) }}</template>
          </el-table-column>
        </el-table>

        <div class="audit-mobile-list">
          <article v-for="record in records" :key="record.id">
            <header>
              <strong>{{ actionLabel(record.action) }}</strong>
              <el-tag :type="entityTagType(record.entityType)" size="small" effect="plain">
                {{ entityLabel(record.entityType) }}
              </el-tag>
            </header>
            <p>{{ recordSummary(record) }}</p>
            <footer>
              <span>{{ actorName(record) }}</span>
              <time :datetime="record.createdAt">{{ formatDateTime(record.createdAt) }}</time>
            </footer>
          </article>
        </div>
      </div>

      <div v-if="(meta?.totalPages ?? 0) > 1" class="audit-pagination">
        <el-pagination
          v-model:current-page="page"
          background
          layout="prev, pager, next"
          :page-size="PAGE_SIZE"
          :total="meta?.total ?? 0"
        />
      </div>
    </section>
  </div>
</template>

<style scoped>
.audit-page {
  display: grid;
  gap: 18px;
}

.audit-heading,
.audit-results > header,
.audit-results-title,
.audit-filter-actions,
.audit-mobile-list article header,
.audit-mobile-list article footer {
  display: flex;
  align-items: center;
}

.audit-heading,
.audit-results > header {
  justify-content: space-between;
}

.audit-heading h2,
.audit-results h3 {
  margin: 4px 0 0;
}

.audit-heading p,
.audit-results p,
.actor-cell span,
.audit-mobile-list article footer {
  color: var(--muted);
}

.audit-heading p,
.audit-results-title p {
  margin: 6px 0 0;
}

.audit-filters,
.audit-results {
  border: 1px solid var(--line);
  border-radius: 8px;
  background: #ffffff;
}

.audit-filters {
  padding: 18px;
}

.audit-filter-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(150px, 1fr));
  gap: 4px 14px;
}

.audit-filter-grid :deep(.el-form-item) {
  margin-bottom: 12px;
}

.audit-filter-grid :deep(.el-select),
.audit-filter-grid :deep(.el-date-editor) {
  width: 100%;
}

.date-filter {
  grid-column: span 2;
}

.audit-filter-actions {
  justify-content: flex-end;
  gap: 8px;
}

.audit-results {
  min-width: 0;
  overflow: hidden;
}

.audit-results > header {
  padding: 18px 20px;
  border-bottom: 1px solid var(--line);
}

.audit-results-title {
  gap: 12px;
}

.audit-results-icon {
  display: grid;
  width: 38px;
  height: 38px;
  place-items: center;
  border-radius: 8px;
  color: #2457c5;
  background: #eaf0ff;
  font-size: 18px;
}

.audit-records {
  min-height: 220px;
}

.audit-table :deep(.el-table__header th) {
  background: #f7f9fc;
}

.actor-cell {
  display: grid;
  min-width: 0;
}

.actor-cell span {
  overflow: hidden;
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.audit-mobile-list {
  display: none;
}

.audit-pagination {
  display: flex;
  justify-content: center;
  padding: 16px;
  border-top: 1px solid var(--line);
}

@media (max-width: 1080px) {
  .audit-filter-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 720px) {
  .audit-heading {
    align-items: flex-start;
  }

  .audit-filter-grid {
    grid-template-columns: minmax(0, 1fr);
  }

  .date-filter {
    grid-column: auto;
  }

  .audit-table {
    display: none;
  }

  .audit-mobile-list {
    display: grid;
  }

  .audit-mobile-list article {
    padding: 16px;
    border-bottom: 1px solid var(--line);
  }

  .audit-mobile-list article:last-child {
    border-bottom: 0;
  }

  .audit-mobile-list article header {
    justify-content: space-between;
    gap: 12px;
  }

  .audit-mobile-list article p {
    margin: 10px 0;
    color: #344054;
    line-height: 1.6;
  }

  .audit-mobile-list article footer {
    justify-content: space-between;
    gap: 12px;
    font-size: 12px;
  }
}
</style>
