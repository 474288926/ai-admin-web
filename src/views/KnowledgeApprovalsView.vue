<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query'
import {
  Check,
  Close,
  Download,
  InfoFilled,
  Plus,
  Refresh,
  Stamp,
  UserFilled,
} from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox } from 'element-plus'

import { ApiError } from '@/services/api/client'
import * as approvalApi from '@/services/api/knowledge-approvals'
import { listOrganizations } from '@/services/api/organizations'
import type {
  KnowledgeApproval,
  KnowledgeApprovalDecision,
  KnowledgeApprovalRole,
  KnowledgeApprovalStatus,
  KnowledgeApprovalStep,
} from '@/types/knowledge-approval'

const PAGE_SIZE = 20
const selectedOrganizationId = ref('')
const selectedStatus = ref<KnowledgeApprovalStatus | ''>('PENDING')
const page = ref(1)
const drawerOpen = ref(false)
const selectedApprovalId = ref('')
const decisionDialogOpen = ref(false)
const assignmentDialogOpen = ref(false)
const decisionForm = reactive({
  role: 'BUSINESS_OWNER' as KnowledgeApprovalRole,
  decision: 'APPROVED' as KnowledgeApprovalDecision,
  comment: '',
})
const assignmentForm = reactive<Record<KnowledgeApprovalRole, string>>({
  BUSINESS_OWNER: '',
  KNOWLEDGE_OPERATIONS: '',
  RETRIEVAL_MAINTAINER: '',
})
const queryClient = useQueryClient()

const organizationsQuery = useQuery({ queryKey: ['organizations'], queryFn: listOrganizations })
const manageableOrganizations = computed(() =>
  (organizationsQuery.data.value ?? []).filter((item) =>
    ['OWNER', 'ADMIN', 'KNOWLEDGE_ADMIN'].includes(item.currentRole),
  ),
)

watch(
  manageableOrganizations,
  (organizations) => {
    if (!organizations.some((item) => item.id === selectedOrganizationId.value)) {
      selectedOrganizationId.value = organizations[0]?.id ?? ''
    }
  },
  { immediate: true },
)
watch([selectedOrganizationId, selectedStatus], () => {
  page.value = 1
  drawerOpen.value = false
  selectedApprovalId.value = ''
})

const approvalsQuery = useQuery({
  queryKey: computed(() => [
    'knowledge-approvals',
    selectedOrganizationId.value,
    selectedStatus.value,
    page.value,
  ]),
  queryFn: () =>
    approvalApi.listKnowledgeApprovals({
      organizationId: selectedOrganizationId.value,
      status: selectedStatus.value || undefined,
      page: page.value,
      pageSize: PAGE_SIZE,
    }),
  enabled: computed(() => Boolean(selectedOrganizationId.value)),
})
const capabilitiesQuery = useQuery({
  queryKey: computed(() => ['knowledge-approval-capabilities', selectedOrganizationId.value]),
  queryFn: () => approvalApi.getKnowledgeApprovalCapabilities(selectedOrganizationId.value),
  enabled: computed(() => Boolean(selectedOrganizationId.value)),
})
const detailQuery = useQuery({
  queryKey: computed(() => ['knowledge-approval', selectedApprovalId.value]),
  queryFn: () => approvalApi.getKnowledgeApproval(selectedApprovalId.value),
  enabled: computed(() => Boolean(selectedApprovalId.value) && drawerOpen.value),
})

const refreshQueries = async (): Promise<void> => {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: ['knowledge-approvals'] }),
    queryClient.invalidateQueries({ queryKey: ['knowledge-approval'] }),
    queryClient.invalidateQueries({ queryKey: ['knowledge-approval-capabilities'] }),
  ])
}
const createMutation = useMutation({
  mutationFn: () => approvalApi.createDocumentAudienceApproval(selectedOrganizationId.value),
  onSuccess: async (approval) => {
    ElMessage.success(`审批 ${approval.reference} 已发起`)
    await refreshQueries()
    openDetail(approval)
  },
  onError: (error) => ElMessage.error(errorMessage(error)),
})
const decisionMutation = useMutation({
  mutationFn: () => {
    const approval = detailQuery.data.value
    if (!approval) throw new Error('审批详情尚未加载')
    return approvalApi.decideKnowledgeApproval(approval.id, {
      role: decisionForm.role,
      decision: decisionForm.decision,
      comment: decisionForm.comment.trim() || undefined,
      revision: approval.revision,
    })
  },
  onSuccess: async () => {
    ElMessage.success(decisionForm.decision === 'APPROVED' ? '审批已通过' : '审批已驳回')
    decisionDialogOpen.value = false
    await refreshQueries()
  },
  onError: (error) => ElMessage.error(errorMessage(error)),
})
const assignmentMutation = useMutation({
  mutationFn: () => {
    const approval = detailQuery.data.value
    if (!approval) throw new Error('审批详情尚未加载')
    return approvalApi.assignKnowledgeApprovalRoles(approval.id, {
      revision: approval.revision,
      assignments: requiredRoles.map((role) => ({ role, userId: assignmentForm[role] })),
    })
  },
  onSuccess: async () => {
    ElMessage.success('审批职责分工已保存')
    assignmentDialogOpen.value = false
    await refreshQueries()
  },
  onError: (error) => ElMessage.error(errorMessage(error)),
})
const cancelMutation = useMutation({
  mutationFn: async () => {
    const approval = detailQuery.data.value
    if (!approval) throw new Error('审批详情尚未加载')
    const result = await ElMessageBox.prompt('请填写撤销原因，便于后续审计追踪。', '撤销审批', {
      confirmButtonText: '确认撤销',
      cancelButtonText: '取消',
      inputPlaceholder: '例如：契约内容需要修订后重新发起',
      inputValidator: (value) => (value.trim() ? true : '请填写撤销原因'),
    })
    return approvalApi.cancelKnowledgeApproval(approval.id, approval.revision, result.value)
  },
  onSuccess: async () => {
    ElMessage.success('审批已撤销')
    await refreshQueries()
  },
  onError: showMutationError,
})
const reissueMutation = useMutation({
  mutationFn: async () => {
    const approval = detailQuery.data.value
    if (!approval) throw new Error('审批详情尚未加载')
    await ElMessageBox.confirm(
      '系统将读取当前契约和实时知识库数据，生成新的影响快照与审批编号。',
      '重新发起审批',
      { confirmButtonText: '重新发起', cancelButtonText: '取消', type: 'warning' },
    )
    return approvalApi.reissueKnowledgeApproval(approval.id, approval.revision)
  },
  onSuccess: async (approval) => {
    ElMessage.success(`新审批 ${approval.reference} 已发起`)
    await refreshQueries()
    openDetail(approval)
  },
  onError: showMutationError,
})

const approvals = computed(() => approvalsQuery.data.value?.items ?? [])
const meta = computed(() => approvalsQuery.data.value?.meta)
const detail = computed(() => detailQuery.data.value)
const impact = computed(() => detail.value?.impactSnapshot?.summary)
const requiredRoles: KnowledgeApprovalRole[] = [
  'BUSINESS_OWNER',
  'KNOWLEDGE_OPERATIONS',
  'RETRIEVAL_MAINTAINER',
]

function openDetail(approval: KnowledgeApproval): void {
  selectedApprovalId.value = approval.id
  drawerOpen.value = true
}

function openDetailRow(row: unknown): void {
  openDetail(row as KnowledgeApproval)
}

function openDecision(step: KnowledgeApprovalStep, decision: KnowledgeApprovalDecision): void {
  decisionForm.role = step.role
  decisionForm.decision = decision
  decisionForm.comment = ''
  decisionDialogOpen.value = true
}

function openAssignments(): void {
  const approval = detail.value
  if (!approval) return
  for (const role of requiredRoles) {
    const step = approval.steps.find((item) => item.role === role)
    assignmentForm[role] = step?.assignedToUserId ?? step?.decidedByUserId ?? ''
  }
  assignmentDialogOpen.value = true
}

function candidateUsers(role: KnowledgeApprovalRole) {
  return capabilitiesQuery.data.value?.roles.find((item) => item.role === role)?.users ?? []
}

function assignmentOptionDisabled(role: KnowledgeApprovalRole, userId: string): boolean {
  return requiredRoles.some(
    (otherRole) => otherRole !== role && assignmentForm[otherRole] === userId,
  )
}

async function submitAssignments(): Promise<void> {
  const userIds = requiredRoles.map((role) => assignmentForm[role])
  if (userIds.some((userId) => !userId)) {
    ElMessage.warning('请为三个职责都指定审批人')
    return
  }
  if (new Set(userIds).size !== requiredRoles.length) {
    ElMessage.warning('三个职责必须分配给三个不同账号')
    return
  }
  await assignmentMutation.mutateAsync()
}

async function submitDecision(): Promise<void> {
  if (decisionForm.decision === 'REJECTED' && !decisionForm.comment.trim()) {
    ElMessage.warning('驳回时必须填写原因')
    return
  }
  await decisionMutation.mutateAsync()
}

async function downloadCredential(approval: KnowledgeApproval): Promise<void> {
  try {
    const credential = await approvalApi.exportKnowledgeApproval(approval.id)
    const blob = new Blob([`${JSON.stringify(credential, null, 2)}\n`], {
      type: 'application/json;charset=utf-8',
    })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `${approval.reference}.json`
    anchor.click()
    URL.revokeObjectURL(url)
  } catch (error) {
    ElMessage.error(errorMessage(error))
  }
}

function roleLabel(role: KnowledgeApprovalRole): string {
  return {
    BUSINESS_OWNER: '业务负责人',
    KNOWLEDGE_OPERATIONS: '知识运营负责人',
    RETRIEVAL_MAINTAINER: '检索维护负责人',
  }[role]
}
function roleDescription(role: KnowledgeApprovalRole): string {
  return {
    BUSINESS_OWNER: '确认规则符合业务口径并承担对外回答边界责任。',
    KNOWLEDGE_OPERATIONS: '确认知识分类、维护流程和文档治理要求可执行。',
    RETRIEVAL_MAINTAINER: '确认检索路由、受影响套件和回退方案具备技术可行性。',
  }[role]
}
function statusLabel(status: KnowledgeApprovalStatus): string {
  return {
    PENDING: '待审批',
    APPROVED: '已通过',
    REJECTED: '已驳回',
    CANCELLED: '已撤销',
    INVALIDATED: '已失效',
  }[status]
}
function statusType(status: KnowledgeApprovalStatus): 'success' | 'warning' | 'danger' | 'info' {
  if (status === 'APPROVED') return 'success'
  if (status === 'PENDING') return 'warning'
  return status === 'REJECTED' ? 'danger' : 'info'
}
function decisionLabel(decision: KnowledgeApprovalDecision | null): string {
  if (decision === 'APPROVED') return '已批准'
  if (decision === 'REJECTED') return '已驳回'
  return '待签署'
}
function formatDateTime(value: string | null): string {
  if (!value) return '-'
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(value))
}
function errorMessage(error: unknown): string {
  return error instanceof ApiError
    ? error.message
    : error instanceof Error
      ? error.message
      : '操作失败'
}

function showMutationError(error: unknown): void {
  if (error === 'cancel' || error === 'close') return
  ElMessage.error(errorMessage(error))
}
</script>

<template>
  <div class="approval-page">
    <section class="approval-heading">
      <div>
        <span class="eyebrow">KNOWLEDGE GOVERNANCE</span>
        <h2>知识审批中心</h2>
        <p>在系统内完成独立签署、状态流转与审计留痕，无需手工填写审批 JSON。</p>
      </div>
      <div class="approval-heading-actions">
        <el-tooltip content="刷新审批列表、成员资格和当前进度" placement="bottom">
          <el-button
            :icon="Refresh"
            circle
            aria-label="刷新审批中心"
            :loading="approvalsQuery.isFetching.value || capabilitiesQuery.isFetching.value"
            @click="refreshQueries"
          />
        </el-tooltip>
        <el-tooltip
          content="读取仓库中的当前受众规则契约，并冻结知识库、文档和评测套件影响快照"
          placement="bottom"
        >
          <el-button
            type="primary"
            :icon="Plus"
            :loading="createMutation.isPending.value"
            :disabled="!capabilitiesQuery.data.value?.canCreate"
            @click="createMutation.mutate()"
            >发起受众规则审批</el-button
          >
        </el-tooltip>
      </div>
    </section>

    <section class="approval-controls" aria-label="审批筛选">
      <el-form-item label="企业">
        <el-select
          v-model="selectedOrganizationId"
          placeholder="选择企业"
          :loading="organizationsQuery.isLoading.value"
        >
          <el-option
            v-for="organization in manageableOrganizations"
            :key="organization.id"
            :label="organization.name"
            :value="organization.id"
          />
        </el-select>
      </el-form-item>
      <el-form-item label="状态">
        <el-segmented
          v-model="selectedStatus"
          :options="[
            { label: '待审批', value: 'PENDING' },
            { label: '已通过', value: 'APPROVED' },
            { label: '全部', value: '' },
          ]"
        />
      </el-form-item>
    </section>

    <el-alert
      v-if="capabilitiesQuery.data.value && !capabilitiesQuery.data.value.readyToComplete"
      type="warning"
      show-icon
      :closable="false"
    >
      <template #title>
        独立审批人员不足：当前最多覆盖
        {{ capabilitiesQuery.data.value.maximumDistinctApprovers }}/{{
          capabilitiesQuery.data.value.requiredDistinctApprovers
        }}
        个角色
      </template>
      <template #default>
        {{ capabilitiesQuery.data.value.blocker }}
        已发起审批可以继续保留，但无法在满足独立性规则前变为“已通过”。
      </template>
    </el-alert>

    <section class="approval-results">
      <header>
        <div class="approval-title">
          <span
            ><el-icon><Stamp /></el-icon
          ></span>
          <div>
            <h3>审批记录</h3>
            <p>共 {{ meta?.total ?? 0 }} 条；同一账号不能签署两个职责角色</p>
          </div>
        </div>
      </header>

      <el-alert
        v-if="approvalsQuery.isError.value"
        title="审批记录加载失败"
        :description="errorMessage(approvalsQuery.error.value)"
        type="error"
        show-icon
        :closable="false"
      />
      <div v-else v-loading="approvalsQuery.isLoading.value" class="approval-table-wrap">
        <el-empty
          v-if="!approvalsQuery.isLoading.value && approvals.length === 0"
          description="当前条件下暂无审批记录"
        />
        <el-table
          v-else
          class="approval-desktop-table"
          :data="approvals"
          @row-click="openDetailRow"
        >
          <el-table-column label="审批编号" min-width="185">
            <template #default="scope">
              <div class="approval-reference">
                <strong>{{ scope.row.reference }}</strong>
                <span>{{ scope.row.subjectVersion }}</span>
              </div>
            </template>
          </el-table-column>
          <el-table-column label="审批对象" min-width="210">
            文档受众与客户引用规则
          </el-table-column>
          <el-table-column label="进度" width="150">
            <template #default="scope">
              <div class="approval-progress">
                <el-progress
                  :percentage="
                    Math.round((scope.row.progress.approved / scope.row.progress.required) * 100)
                  "
                  :stroke-width="7"
                  :show-text="false"
                />
                <span
                  >{{ scope.row.progress.approved }}/{{ scope.row.progress.required }} 已批准</span
                >
              </div>
            </template>
          </el-table-column>
          <el-table-column label="状态" width="105">
            <template #default="scope">
              <el-tag :type="statusType(scope.row.status)" effect="plain">
                {{ statusLabel(scope.row.status) }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column label="发起人" min-width="170">
            <template #default="scope">
              {{ scope.row.createdBy.name || scope.row.createdBy.email }}
            </template>
          </el-table-column>
          <el-table-column label="发起时间" width="165">
            <template #default="scope">{{ formatDateTime(scope.row.createdAt) }}</template>
          </el-table-column>
          <el-table-column label="操作" width="100" fixed="right">
            <template #default="scope">
              <el-button link type="primary" @click.stop="openDetailRow(scope.row)">查看</el-button>
            </template>
          </el-table-column>
        </el-table>
        <div v-if="approvals.length > 0" class="approval-mobile-list">
          <button
            v-for="approval in approvals"
            :key="approval.id"
            class="approval-mobile-row"
            type="button"
            @click="openDetailRow(approval)"
          >
            <span class="approval-mobile-main">
              <span class="approval-reference">
                <strong>{{ approval.reference }}</strong>
                <span>{{ approval.subjectVersion }}</span>
              </span>
              <span class="approval-mobile-subject">文档受众与客户引用规则</span>
            </span>
            <span class="approval-mobile-meta">
              <span class="approval-progress">
                <el-progress
                  :percentage="
                    Math.round((approval.progress.approved / approval.progress.required) * 100)
                  "
                  :stroke-width="7"
                  :show-text="false"
                />
                <span
                  >{{ approval.progress.approved }}/{{ approval.progress.required }} 已批准</span
                >
              </span>
              <el-tag :type="statusType(approval.status)" effect="plain">
                {{ statusLabel(approval.status) }}
              </el-tag>
              <span class="approval-mobile-open">查看</span>
            </span>
          </button>
        </div>
      </div>
      <div v-if="(meta?.totalPages ?? 0) > 1" class="approval-pagination">
        <el-pagination
          v-model:current-page="page"
          background
          layout="prev, pager, next"
          :page-size="PAGE_SIZE"
          :total="meta?.total ?? 0"
        />
      </div>
    </section>

    <el-drawer v-model="drawerOpen" size="min(760px, 96vw)" destroy-on-close>
      <template #header>
        <div v-if="detail" class="drawer-title">
          <div>
            <strong>{{ detail.reference }}</strong>
            <span>文档受众与客户引用规则审批</span>
          </div>
          <el-tag :type="statusType(detail.status)" effect="plain">
            {{ statusLabel(detail.status) }}
          </el-tag>
        </div>
      </template>

      <div v-loading="detailQuery.isLoading.value" class="approval-detail">
        <el-alert
          v-if="detailQuery.isError.value"
          title="审批详情加载失败"
          :description="errorMessage(detailQuery.error.value)"
          type="error"
          show-icon
          :closable="false"
        />
        <template v-else-if="detail">
          <el-alert
            v-if="!detail.snapshotCurrent"
            title="审批快照已过期"
            description="契约或知识库范围已经变化，不能继续签署。请撤销或重新发起，系统会生成新的影响快照。"
            type="error"
            show-icon
            :closable="false"
          />
          <section class="detail-facts">
            <div>
              <span>契约版本</span>
              <strong>{{ detail.subjectVersion }}</strong>
            </div>
            <div>
              <span>
                契约 SHA-256
                <el-tooltip content="锁定本次审批的原始契约内容，文件变化后哈希会不同">
                  <el-icon><InfoFilled /></el-icon>
                </el-tooltip>
              </span>
              <code>{{ detail.subjectSha256.slice(0, 12) }}…</code>
            </div>
            <div>
              <span>发起时间</span>
              <strong>{{ formatDateTime(detail.createdAt) }}</strong>
            </div>
          </section>

          <section v-if="impact" class="impact-section">
            <header>
              <h3>影响快照</h3>
              <p>发起审批时冻结，后续数据变化不会改写历史记录</p>
            </header>
            <div class="impact-grid">
              <div>
                <span>发布文档</span><strong>{{ impact.currentPublishedDocumentCount }}</strong>
              </div>
              <div class="warning">
                <span>未分类文档</span><strong>{{ impact.unclassifiedDocumentCount }}</strong>
              </div>
              <div>
                <span>受影响套件</span><strong>{{ impact.potentialAffectedSuiteCount }}</strong>
              </div>
              <div>
                <span>受影响客服题</span
                ><strong>{{ impact.potentialAffectedCustomerServiceCaseCount }}</strong>
              </div>
            </div>
          </section>

          <section class="steps-section">
            <header>
              <div>
                <h3>独立签署</h3>
                <p>先由管理员将三个职责分配给三个不同账号，再由被分配人员签署</p>
              </div>
              <el-tooltip content="从合格成员中为每个职责指定一名审批人">
                <el-button
                  v-if="detail.capabilities.canAssign"
                  :icon="UserFilled"
                  type="primary"
                  plain
                  @click="openAssignments"
                  >设置分工</el-button
                >
              </el-tooltip>
            </header>
            <article v-for="step in detail.steps" :key="step.id" class="approval-step">
              <div class="step-main">
                <span class="step-icon" :class="step.decision?.toLowerCase() || 'pending'">
                  <el-icon
                    ><Check v-if="step.decision === 'APPROVED'" /><Close
                      v-else-if="step.decision === 'REJECTED'" /><Stamp v-else
                  /></el-icon>
                </span>
                <div>
                  <div class="step-title">
                    <strong>{{ roleLabel(step.role) }}</strong>
                    <el-tooltip :content="roleDescription(step.role)">
                      <el-icon><InfoFilled /></el-icon>
                    </el-tooltip>
                    <el-tag
                      size="small"
                      :type="
                        step.decision === 'APPROVED'
                          ? 'success'
                          : step.decision === 'REJECTED'
                            ? 'danger'
                            : 'info'
                      "
                      effect="plain"
                    >
                      {{ decisionLabel(step.decision) }}
                    </el-tag>
                  </div>
                  <p v-if="step.decidedByUser">
                    {{ step.decidedByUser.name || step.decidedByUser.email }} ·
                    {{ formatDateTime(step.decidedAt) }}
                  </p>
                  <p v-else-if="step.assignedToUser" class="assignment-person">
                    已分配：{{ step.assignedToUser.name || step.assignedToUser.email }}
                    <span v-if="step.assignedToUser.name">{{ step.assignedToUser.email }}</span>
                  </p>
                  <p v-else>尚未分配该职责的审批人</p>
                  <p v-if="!step.decidedByUser && step.ineligibleReason" class="step-reason">
                    {{ step.ineligibleReason }}
                  </p>
                  <blockquote v-if="step.comment">{{ step.comment }}</blockquote>
                </div>
              </div>
              <div v-if="step.canDecide" class="step-actions">
                <el-button
                  size="small"
                  type="success"
                  :icon="Check"
                  @click="openDecision(step, 'APPROVED')"
                  >批准</el-button
                >
                <el-button
                  size="small"
                  type="danger"
                  plain
                  :icon="Close"
                  @click="openDecision(step, 'REJECTED')"
                  >驳回</el-button
                >
              </div>
            </article>
          </section>

          <section class="detail-actions">
            <el-tooltip content="下载包含审批编号、哈希、签署人和事件时间线的只读 JSON 凭证">
              <el-button :icon="Download" @click="downloadCredential(detail)"
                >下载审批凭证</el-button
              >
            </el-tooltip>
            <el-button
              v-if="detail.capabilities.canReissue"
              type="primary"
              plain
              :loading="reissueMutation.isPending.value"
              @click="reissueMutation.mutate()"
              >重新发起</el-button
            >
            <el-button
              v-if="detail.capabilities.canCancel"
              type="danger"
              plain
              :loading="cancelMutation.isPending.value"
              @click="cancelMutation.mutate()"
              >撤销审批</el-button
            >
          </section>
        </template>
      </div>
    </el-drawer>

    <el-dialog
      v-model="decisionDialogOpen"
      :title="decisionForm.decision === 'APPROVED' ? '批准审批' : '驳回审批'"
      width="min(520px, 94vw)"
    >
      <el-alert
        :title="`当前以“${roleLabel(decisionForm.role)}”身份签署`"
        :description="roleDescription(decisionForm.role)"
        type="info"
        show-icon
        :closable="false"
      />
      <el-form label-position="top" class="decision-form">
        <el-form-item
          :label="decisionForm.decision === 'REJECTED' ? '驳回原因（必填）' : '审批说明（选填）'"
        >
          <el-input
            v-model="decisionForm.comment"
            type="textarea"
            :rows="4"
            maxlength="1000"
            show-word-limit
            :placeholder="
              decisionForm.decision === 'REJECTED'
                ? '说明需要修订的内容和重新提交条件'
                : '记录确认依据或注意事项'
            "
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="decisionDialogOpen = false">取消</el-button>
        <el-button
          :type="decisionForm.decision === 'APPROVED' ? 'success' : 'danger'"
          :loading="decisionMutation.isPending.value"
          @click="submitDecision"
          >确认{{ decisionForm.decision === 'APPROVED' ? '批准' : '驳回' }}</el-button
        >
      </template>
    </el-dialog>

    <el-dialog v-model="assignmentDialogOpen" title="设置审批分工" width="min(560px, 94vw)">
      <el-alert
        title="三个职责必须分配给三个不同账号"
        description="保存后，只有被分配的成员可以签署对应职责；已完成签署的职责不能改派。"
        type="info"
        show-icon
        :closable="false"
      />
      <el-form label-position="top" class="assignment-form">
        <el-form-item v-for="role in requiredRoles" :key="role" :label="roleLabel(role)">
          <el-select
            v-model="assignmentForm[role]"
            :placeholder="`选择${roleLabel(role)}`"
            :disabled="Boolean(detail?.steps.find((step) => step.role === role)?.decision)"
          >
            <el-option
              v-for="user in candidateUsers(role)"
              :key="user.id"
              :label="user.name ? `${user.name} (${user.email})` : user.email"
              :value="user.id"
              :disabled="assignmentOptionDisabled(role, user.id)"
            />
          </el-select>
          <p class="assignment-help">{{ roleDescription(role) }}</p>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="assignmentDialogOpen = false">取消</el-button>
        <el-button
          type="primary"
          :loading="assignmentMutation.isPending.value"
          @click="submitAssignments"
          >保存分工</el-button
        >
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.approval-page {
  display: grid;
  gap: 18px;
}
.approval-heading,
.approval-heading-actions,
.approval-controls,
.approval-results > header,
.approval-title,
.drawer-title,
.step-title,
.step-main,
.step-actions,
.detail-actions {
  display: flex;
  align-items: center;
}
.approval-heading,
.approval-results > header,
.drawer-title {
  justify-content: space-between;
}
.approval-heading {
  gap: 20px;
}
.approval-heading h2,
.approval-results h3,
.impact-section h3,
.steps-section h3 {
  margin: 4px 0 0;
}
.approval-heading p,
.approval-results p,
.impact-section header p,
.steps-section header p {
  margin: 6px 0 0;
  color: var(--muted);
  font-size: 12px;
}
.approval-heading-actions {
  gap: 9px;
}
.approval-controls,
.approval-results {
  border: 1px solid var(--line);
  border-radius: 8px;
  background: #fff;
}
.approval-controls {
  gap: 22px;
  padding: 16px 18px 4px;
}
.approval-controls :deep(.el-form-item) {
  min-width: 260px;
}
.approval-controls :deep(.el-select) {
  width: 100%;
}
.approval-results {
  overflow: hidden;
}
.approval-results > header {
  padding: 16px 18px;
  border-bottom: 1px solid var(--line);
}
.approval-title {
  gap: 11px;
}
.approval-title > span {
  display: grid;
  width: 36px;
  height: 36px;
  color: #3568bc;
  background: #edf3fc;
  border-radius: 7px;
  place-items: center;
}
.approval-table-wrap {
  min-height: 300px;
  overflow-x: auto;
}
.approval-table-wrap :deep(.el-table__row) {
  cursor: pointer;
}
.approval-mobile-list {
  display: none;
}
.approval-reference {
  display: grid;
  gap: 4px;
}
.approval-reference span,
.approval-progress span {
  color: var(--muted);
  font-size: 11px;
}
.approval-progress {
  display: grid;
  gap: 6px;
  min-width: 112px;
}
.approval-pagination {
  display: flex;
  justify-content: flex-end;
  padding: 14px 18px;
  border-top: 1px solid var(--line);
}
.drawer-title {
  width: 100%;
  gap: 14px;
  padding-right: 18px;
}
.drawer-title > div {
  display: grid;
  gap: 4px;
}
.drawer-title strong {
  font-size: 16px;
}
.drawer-title span {
  color: var(--muted);
  font-size: 12px;
}
.approval-detail {
  display: grid;
  gap: 24px;
  min-height: 260px;
}
.detail-facts {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  border: 1px solid var(--line);
  border-radius: 7px;
}
.detail-facts > div {
  display: grid;
  gap: 7px;
  min-width: 0;
  padding: 14px;
  border-right: 1px solid var(--line);
}
.detail-facts > div:last-child {
  border-right: 0;
}
.detail-facts span {
  color: var(--muted);
  font-size: 11px;
}
.detail-facts code {
  overflow: hidden;
  color: #3d5271;
  text-overflow: ellipsis;
}
.impact-section,
.steps-section {
  display: grid;
  gap: 12px;
}
.steps-section > header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}
.impact-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  border-top: 1px solid var(--line);
  border-bottom: 1px solid var(--line);
}
.impact-grid > div {
  display: grid;
  gap: 4px;
  padding: 15px 12px;
  border-right: 1px solid var(--line);
}
.impact-grid > div:last-child {
  border-right: 0;
}
.impact-grid span {
  color: var(--muted);
  font-size: 11px;
}
.impact-grid strong {
  font-size: 21px;
}
.impact-grid .warning strong {
  color: #b66b1e;
}
.approval-step {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 14px;
  padding: 16px 0;
  border-top: 1px solid var(--line);
}
.step-main {
  align-items: flex-start;
  gap: 12px;
  min-width: 0;
}
.step-icon {
  display: grid;
  flex: 0 0 34px;
  width: 34px;
  height: 34px;
  border-radius: 50%;
  color: #65758e;
  background: #f0f3f7;
  place-items: center;
}
.step-icon.approved {
  color: #23805c;
  background: #e5f6ef;
}
.step-icon.rejected {
  color: #bd4e58;
  background: #ffebed;
}
.step-title {
  gap: 7px;
  flex-wrap: wrap;
}
.step-main p {
  margin: 6px 0 0;
  color: var(--muted);
  font-size: 11px;
}
.step-main .assignment-person {
  color: #344b70;
  font-weight: 600;
}
.assignment-person span {
  margin-left: 6px;
  color: var(--muted);
  font-weight: 400;
}
.step-main .step-reason {
  color: #8a6a38;
}
.step-main blockquote {
  margin: 9px 0 0;
  padding-left: 10px;
  border-left: 2px solid #cdd7e7;
  color: #52617a;
  font-size: 12px;
}
.step-actions,
.detail-actions {
  gap: 8px;
}
.detail-actions {
  justify-content: flex-end;
  padding-top: 18px;
  border-top: 1px solid var(--line);
}
.decision-form {
  margin-top: 18px;
}
.assignment-form {
  margin-top: 18px;
}
.assignment-form :deep(.el-select) {
  width: 100%;
}
.assignment-help {
  margin: 5px 0 0;
  color: var(--muted);
  font-size: 11px;
  line-height: 1.5;
}
@media (max-width: 760px) {
  .approval-heading {
    align-items: flex-start;
    flex-direction: column;
  }
  .approval-heading-actions {
    width: 100%;
  }
  .approval-heading-actions .el-button:last-child {
    flex: 1;
  }
  .approval-controls {
    align-items: stretch;
    flex-direction: column;
    gap: 0;
  }
  .approval-controls :deep(.el-form-item) {
    min-width: 0;
  }
  .approval-table-wrap {
    min-height: 260px;
    overflow-x: hidden;
  }
  .approval-desktop-table {
    display: none;
  }
  .approval-mobile-list {
    display: grid;
  }
  .approval-mobile-row {
    display: grid;
    gap: 14px;
    width: 100%;
    padding: 16px 14px;
    border: 0;
    border-bottom: 1px solid var(--line);
    border-radius: 0;
    color: inherit;
    background: #fff;
    text-align: left;
    cursor: pointer;
  }
  .approval-mobile-row:last-child {
    border-bottom: 0;
  }
  .approval-mobile-row:focus-visible {
    outline: 2px solid #409eff;
    outline-offset: -2px;
  }
  .approval-mobile-main,
  .approval-mobile-meta {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    min-width: 0;
  }
  .approval-mobile-main {
    align-items: flex-start;
  }
  .approval-mobile-subject {
    max-width: 46%;
    color: #52617a;
    font-size: 12px;
    line-height: 1.5;
    text-align: right;
  }
  .approval-mobile-meta .approval-progress {
    flex: 1;
    min-width: 0;
    max-width: 130px;
  }
  .approval-mobile-open {
    color: #337ecc;
    font-size: 12px;
    font-weight: 600;
  }
  .detail-facts,
  .impact-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .detail-facts > div:nth-child(2) {
    border-right: 0;
  }
  .detail-facts > div:last-child {
    border-top: 1px solid var(--line);
  }
  .impact-grid > div:nth-child(2) {
    border-right: 0;
  }
  .impact-grid > div:nth-child(n + 3) {
    border-top: 1px solid var(--line);
  }
  .approval-step {
    flex-direction: column;
  }
  .steps-section > header {
    align-items: stretch;
    flex-direction: column;
  }
  .step-actions {
    width: 100%;
    padding-left: 46px;
  }
}
</style>
