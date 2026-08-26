<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query'
import {
  ArrowDown,
  CopyDocument,
  Delete,
  Edit,
  Message,
  OfficeBuilding,
  Plus,
  Refresh,
  Search,
  SwitchButton,
  User,
  UserFilled,
} from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox, type FormInstance, type FormRules } from 'element-plus'

import { ApiError } from '@/services/api/client'
import * as organizationApi from '@/services/api/organizations'
import { useAuthStore } from '@/stores/auth'
import type {
  AddOrganizationMemberByEmailInput,
  CreateOrganizationInput,
  CreateOrganizationInvitationInput,
  DepartmentInput,
  OrganizationDepartment,
  OrganizationGroup,
  OrganizationInvitation,
  OrganizationMember,
  OrganizationMemberStatus,
  OrganizationRole,
  UserGroupInput,
} from '@/types/organization'

type OrganizationUnitKind = 'department' | 'group'
type EditableOrganizationUnit = {
  kind: OrganizationUnitKind
  id: string
  name: string
  memberIds: string[]
}

const ASSIGNABLE_ROLES: Array<Exclude<OrganizationRole, 'OWNER'>> = [
  'ADMIN',
  'KNOWLEDGE_ADMIN',
  'SUPPORT',
  'MEMBER',
]

const authStore = useAuthStore()
const queryClient = useQueryClient()
const selectedOrganizationId = ref('')
const search = ref('')
const createOrganizationDialogVisible = ref(false)
const addDialogVisible = ref(false)
const inviteDialogVisible = ref(false)
const departmentDialogVisible = ref(false)
const groupDialogVisible = ref(false)
const unitMembersDialogVisible = ref(false)
const generatedInvitationLink = ref('')
const editingMemberId = ref<string | null>(null)
const lifecycleMemberId = ref<string | null>(null)
const editingDepartmentId = ref<string | null>(null)
const editingGroupId = ref<string | null>(null)
const activeUnit = ref<EditableOrganizationUnit | null>(null)
const selectedUnitMemberIds = ref<string[]>([])
const createOrganizationFormRef = ref<FormInstance>()
const addFormRef = ref<FormInstance>()
const inviteFormRef = ref<FormInstance>()
const departmentFormRef = ref<FormInstance>()
const groupFormRef = ref<FormInstance>()
const createOrganizationForm = reactive<CreateOrganizationInput>({
  name: '',
  slug: '',
})
const addForm = reactive<AddOrganizationMemberByEmailInput>({
  email: '',
  role: 'MEMBER',
})
const inviteForm = reactive<CreateOrganizationInvitationInput>({
  email: '',
  role: 'MEMBER',
})
const departmentForm = reactive<DepartmentInput>({
  name: '',
  parentId: null,
})
const groupForm = reactive<UserGroupInput>({
  name: '',
  description: null,
})

const addRules: FormRules<AddOrganizationMemberByEmailInput> = {
  email: [
    { required: true, message: '请输入成员邮箱', trigger: 'blur' },
    { type: 'email', message: '请输入有效的邮箱地址', trigger: ['blur', 'change'] },
  ],
  role: [{ required: true, message: '请选择企业角色', trigger: 'change' }],
}
const inviteRules: FormRules<CreateOrganizationInvitationInput> = addRules
const departmentRules: FormRules<DepartmentInput> = {
  name: [{ required: true, message: '请输入部门名称', trigger: 'blur' }],
}
const groupRules: FormRules<UserGroupInput> = {
  name: [{ required: true, message: '请输入用户组名称', trigger: 'blur' }],
}
const createOrganizationRules: FormRules<CreateOrganizationInput> = {
  name: [
    { required: true, message: '请输入企业名称', trigger: 'blur' },
    { max: 150, message: '企业名称不能超过 150 个字符', trigger: 'blur' },
  ],
  slug: [
    { required: true, message: '请输入企业标识', trigger: 'blur' },
    {
      pattern: /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
      message: '只能使用小写字母、数字和单个连字符',
      trigger: ['blur', 'change'],
    },
  ],
}

const organizationsQuery = useQuery({
  queryKey: ['organizations'],
  queryFn: organizationApi.listOrganizations,
})
const organizations = computed(() => organizationsQuery.data.value ?? [])
const organizationCapabilitiesQuery = useQuery({
  queryKey: ['organization-capabilities'],
  queryFn: organizationApi.getOrganizationCapabilities,
})
const organizationCapabilities = computed(() => organizationCapabilitiesQuery.data.value)

watch(
  organizations,
  (items) => {
    if (!selectedOrganizationId.value && items[0]) selectedOrganizationId.value = items[0].id
  },
  { immediate: true },
)

const organizationQuery = useQuery({
  queryKey: computed(() => ['organization', selectedOrganizationId.value]),
  queryFn: () => organizationApi.getOrganization(selectedOrganizationId.value),
  enabled: computed(() => Boolean(selectedOrganizationId.value)),
})

const createOrganizationMutation = useMutation({
  mutationFn: organizationApi.createOrganization,
})

const addMemberMutation = useMutation({
  mutationFn: (input: AddOrganizationMemberByEmailInput) =>
    organizationApi.addMemberByEmail(selectedOrganizationId.value, input),
})
const updateMemberMutation = useMutation({
  mutationFn: ({
    memberId,
    input,
  }: {
    memberId: string
    input: { role?: Exclude<OrganizationRole, 'OWNER'>; status?: OrganizationMemberStatus }
  }) => organizationApi.updateMember(selectedOrganizationId.value, memberId, input),
})
const transferOwnershipMutation = useMutation({
  mutationFn: (memberId: string) =>
    organizationApi.transferOwnership(selectedOrganizationId.value, memberId),
})
const removeMemberMutation = useMutation({
  mutationFn: (memberId: string) =>
    organizationApi.removeMember(selectedOrganizationId.value, memberId),
})
const leaveOrganizationMutation = useMutation({
  mutationFn: () => organizationApi.leaveOrganization(selectedOrganizationId.value),
})
const createInvitationMutation = useMutation({
  mutationFn: (input: CreateOrganizationInvitationInput) =>
    organizationApi.createInvitation(selectedOrganizationId.value, input),
})
const revokeInvitationMutation = useMutation({
  mutationFn: (invitationId: string) =>
    organizationApi.revokeInvitation(selectedOrganizationId.value, invitationId),
})
const saveDepartmentMutation = useMutation({
  mutationFn: ({ id, input }: { id: string | null; input: DepartmentInput }) =>
    id
      ? organizationApi.updateDepartment(selectedOrganizationId.value, id, input)
      : organizationApi.createDepartment(selectedOrganizationId.value, input),
})
const saveGroupMutation = useMutation({
  mutationFn: ({ id, input }: { id: string | null; input: UserGroupInput }) =>
    id
      ? organizationApi.updateGroup(selectedOrganizationId.value, id, input)
      : organizationApi.createGroup(selectedOrganizationId.value, input),
})
const deleteUnitMutation = useMutation({
  mutationFn: ({ kind, id }: { kind: OrganizationUnitKind; id: string }) =>
    kind === 'department'
      ? organizationApi.deleteDepartment(selectedOrganizationId.value, id)
      : organizationApi.deleteGroup(selectedOrganizationId.value, id),
})
const saveUnitMembersMutation = useMutation({
  mutationFn: async ({
    kind,
    id,
    previousMemberIds,
    nextMemberIds,
  }: {
    kind: OrganizationUnitKind
    id: string
    previousMemberIds: string[]
    nextMemberIds: string[]
  }) => {
    const previous = new Set(previousMemberIds)
    const next = new Set(nextMemberIds)
    const additions = nextMemberIds.filter((memberId) => !previous.has(memberId))
    const removals = previousMemberIds.filter((memberId) => !next.has(memberId))
    await Promise.all([
      ...additions.map((memberId) =>
        kind === 'department'
          ? organizationApi.addDepartmentMember(selectedOrganizationId.value, id, memberId)
          : organizationApi.addGroupMember(selectedOrganizationId.value, id, memberId),
      ),
      ...removals.map((memberId) =>
        kind === 'department'
          ? organizationApi.removeDepartmentMember(selectedOrganizationId.value, id, memberId)
          : organizationApi.removeGroupMember(selectedOrganizationId.value, id, memberId),
      ),
    ])
  },
})

const organization = computed(() => organizationQuery.data.value)
const hasFullDirectory = computed(() => organization.value?.capabilities.directoryAccess === 'FULL')
const canManageMembers = computed(() => organization.value?.capabilities.canManageMembers === true)
const canManageUnits = computed(() => organization.value?.capabilities.canManageUnits === true)
const canManageInvitations = computed(
  () => organization.value?.capabilities.canManageInvitations === true,
)
const canTransferOwnership = computed(
  () => organization.value?.capabilities.canTransferOwnership === true,
)
const canLeaveOrganization = computed(
  () => organization.value?.capabilities.canLeaveOrganization === true,
)
const invitationsQuery = useQuery({
  queryKey: computed(() => ['organization-invitations', selectedOrganizationId.value]),
  queryFn: () => organizationApi.listInvitations(selectedOrganizationId.value),
  enabled: computed(() => Boolean(selectedOrganizationId.value) && canManageInvitations.value),
})
const invitations = computed(() => invitationsQuery.data.value ?? [])
const filteredMembers = computed(() => {
  const keyword = search.value.trim().toLocaleLowerCase()
  if (!keyword) return organization.value?.memberships ?? []
  return (organization.value?.memberships ?? []).filter(
    (item) =>
      item.user.email.toLocaleLowerCase().includes(keyword) ||
      item.user.name?.toLocaleLowerCase().includes(keyword),
  )
})
const activeMemberCount = computed(
  () => organization.value?.memberships.filter((item) => item.status === 'ACTIVE').length ?? 0,
)
const emptyOrganizationDescription = computed(() => {
  if (organizationCapabilities.value?.canCreate) {
    return organizationCapabilities.value.mode === 'single'
      ? '当前部署尚未初始化企业'
      : '当前账号尚未加入企业'
  }
  if (organizationCapabilities.value?.creationUnavailableReason === 'BOOTSTRAP_OWNER_REQUIRED') {
    return '当前账号不是企业初始化所有者，请使用指定账号登录'
  }
  return '企业已经初始化，请联系企业管理员邀请加入'
})
const departmentParentOptions = computed(() => {
  const departments = organization.value?.departments ?? []
  if (!editingDepartmentId.value) return departments
  const excludedIds = new Set([editingDepartmentId.value])
  let changed = true
  while (changed) {
    changed = false
    for (const department of departments) {
      if (
        department.parentId &&
        excludedIds.has(department.parentId) &&
        !excludedIds.has(department.id)
      ) {
        excludedIds.add(department.id)
        changed = true
      }
    }
  }
  return departments.filter((department) => !excludedIds.has(department.id))
})

function getErrorMessage(error: unknown): string {
  return error instanceof ApiError ? error.message : '操作失败，请稍后重试'
}

function roleLabel(role: OrganizationRole): string {
  return {
    OWNER: '企业所有者',
    ADMIN: '企业管理员',
    KNOWLEDGE_ADMIN: '知识管理员',
    SUPPORT: '客服成员',
    MEMBER: '普通成员',
  }[role]
}

function statusLabel(status: OrganizationMemberStatus): string {
  return { INVITED: '待加入', ACTIVE: '正常', SUSPENDED: '已停用' }[status]
}

function statusType(status: OrganizationMemberStatus): 'info' | 'success' | 'danger' {
  return { INVITED: 'info', ACTIVE: 'success', SUSPENDED: 'danger' }[status] as
    | 'info'
    | 'success'
    | 'danger'
}

function formatDate(value: string | null): string {
  if (!value) return '-'
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(value))
}

function departmentName(parentId: string | null): string {
  if (!parentId) return '一级部门'
  return organization.value?.departments.find((item) => item.id === parentId)?.name ?? '上级部门'
}

function memberOptionLabel(member: OrganizationMember): string {
  const name = member.user.name?.trim()
  return `${name || member.user.email}${name ? ` · ${member.user.email}` : ''}`
}

function openCreateOrganization(): void {
  createOrganizationForm.name = ''
  createOrganizationForm.slug = ''
  createOrganizationFormRef.value?.clearValidate()
  createOrganizationDialogVisible.value = true
}

async function saveOrganization(): Promise<void> {
  if (!(await createOrganizationFormRef.value?.validate().catch(() => false))) return
  try {
    const created = await createOrganizationMutation.mutateAsync({
      name: createOrganizationForm.name.trim(),
      slug: createOrganizationForm.slug.trim(),
    })
    createOrganizationDialogVisible.value = false
    selectedOrganizationId.value = created.id
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['organizations'] }),
      queryClient.invalidateQueries({ queryKey: ['organization-capabilities'] }),
      authStore.ensureAccessProfile(true),
    ])
    ElMessage.success('企业已创建，你已成为企业所有者')
  } catch (error) {
    ElMessage.error(getErrorMessage(error))
  }
}

function openAddMember(): void {
  addForm.email = ''
  addForm.role = 'MEMBER'
  addFormRef.value?.clearValidate()
  addDialogVisible.value = true
}

function openInviteMember(invitation?: OrganizationInvitation): void {
  inviteForm.email = invitation?.email ?? ''
  inviteForm.role = invitation?.role ?? 'MEMBER'
  generatedInvitationLink.value = ''
  inviteFormRef.value?.clearValidate()
  inviteDialogVisible.value = true
}

function handleAddMemberCommand(command: 'invite' | 'existing'): void {
  if (command === 'existing') {
    openAddMember()
    return
  }
  openInviteMember()
}

async function refreshOrganization(): Promise<void> {
  await organizationQuery.refetch()
}

async function invalidateOrganization(): Promise<void> {
  await queryClient.invalidateQueries({
    queryKey: ['organization', selectedOrganizationId.value],
  })
}

async function saveMember(): Promise<void> {
  if (!(await addFormRef.value?.validate().catch(() => false))) return
  try {
    await addMemberMutation.mutateAsync({
      email: addForm.email.trim().toLocaleLowerCase(),
      role: addForm.role,
    })
    addDialogVisible.value = false
    ElMessage.success('企业成员已添加')
    await queryClient.invalidateQueries({
      queryKey: ['organization', selectedOrganizationId.value],
    })
  } catch (error) {
    ElMessage.error(getErrorMessage(error))
  }
}

async function saveInvitation(): Promise<void> {
  if (!(await inviteFormRef.value?.validate().catch(() => false))) return
  try {
    const invitation = await createInvitationMutation.mutateAsync({
      email: inviteForm.email.trim().toLocaleLowerCase(),
      role: inviteForm.role,
    })
    generatedInvitationLink.value = `${publicAppOrigin()}/accept-invitation?token=${encodeURIComponent(invitation.token)}`
    ElMessage.success('企业邀请已生成')
    await queryClient.invalidateQueries({
      queryKey: ['organization-invitations', selectedOrganizationId.value],
    })
  } catch (error) {
    ElMessage.error(getErrorMessage(error))
  }
}

function publicAppOrigin(): string {
  const configuredOrigin = (import.meta.env.VITE_PUBLIC_APP_ORIGIN as string | undefined)?.trim()
  return (configuredOrigin || window.location.origin).replace(/\/+$/, '')
}

async function copyInvitationLink(): Promise<void> {
  try {
    await navigator.clipboard.writeText(generatedInvitationLink.value)
    ElMessage.success('邀请链接已复制')
  } catch {
    ElMessage.error('浏览器未允许复制，请手动选择邀请链接')
  }
}

function invitationStatus(invitation: OrganizationInvitation): string {
  if (invitation.acceptedAt) return '已接受'
  if (invitation.revokedAt) return '已撤销'
  if (new Date(invitation.expiresAt).getTime() <= Date.now()) return '已过期'
  return '待接受'
}

function invitationStatusType(
  invitation: OrganizationInvitation,
): 'primary' | 'success' | 'info' | 'warning' {
  return {
    待接受: 'primary',
    已接受: 'success',
    已撤销: 'info',
    已过期: 'warning',
  }[invitationStatus(invitation)] as 'primary' | 'success' | 'info' | 'warning'
}

function canRevokeInvitation(invitation: OrganizationInvitation): boolean {
  return invitationStatus(invitation) === '待接受'
}

async function revokeInvitation(invitation: OrganizationInvitation): Promise<void> {
  try {
    await ElMessageBox.confirm(
      `撤销后，发送给 ${invitation.email} 的当前邀请链接将立即失效。`,
      '撤销企业邀请',
      { confirmButtonText: '确认撤销', cancelButtonText: '取消', type: 'warning' },
    )
    await revokeInvitationMutation.mutateAsync(invitation.id)
    ElMessage.success('企业邀请已撤销')
    await queryClient.invalidateQueries({
      queryKey: ['organization-invitations', selectedOrganizationId.value],
    })
  } catch (error) {
    if (error === 'cancel' || error === 'close') return
    ElMessage.error(getErrorMessage(error))
  }
}

async function updateRole(row: unknown, value: unknown): Promise<void> {
  if (!ASSIGNABLE_ROLES.includes(value as Exclude<OrganizationRole, 'OWNER'>)) return
  const member = row as OrganizationMember
  editingMemberId.value = member.id
  try {
    await updateMemberMutation.mutateAsync({
      memberId: member.id,
      input: { role: value as Exclude<OrganizationRole, 'OWNER'> },
    })
    ElMessage.success('成员角色已更新')
    await queryClient.invalidateQueries({
      queryKey: ['organization', selectedOrganizationId.value],
    })
  } catch (error) {
    ElMessage.error(getErrorMessage(error))
  } finally {
    editingMemberId.value = null
  }
}

async function updateStatus(row: unknown, value: unknown): Promise<void> {
  if (value !== 'ACTIVE' && value !== 'SUSPENDED') return
  const member = row as OrganizationMember
  editingMemberId.value = member.id
  try {
    await updateMemberMutation.mutateAsync({ memberId: member.id, input: { status: value } })
    ElMessage.success(value === 'ACTIVE' ? '成员已启用' : '成员已停用')
    await queryClient.invalidateQueries({
      queryKey: ['organization', selectedOrganizationId.value],
    })
  } catch (error) {
    ElMessage.error(getErrorMessage(error))
  } finally {
    editingMemberId.value = null
  }
}

async function transferOwnership(row: unknown): Promise<void> {
  const member = row as OrganizationMember
  lifecycleMemberId.value = member.id
  try {
    await ElMessageBox.confirm(
      `转移后，${memberOptionLabel(member)} 将成为企业所有者，你将变为企业管理员。`,
      '转移企业所有权',
      { confirmButtonText: '确认转移', cancelButtonText: '取消', type: 'warning' },
    )
    await transferOwnershipMutation.mutateAsync(member.id)
    await Promise.all([
      invalidateOrganization(),
      queryClient.invalidateQueries({ queryKey: ['organizations'] }),
      authStore.ensureAccessProfile(true),
    ])
    ElMessage.success('企业所有权已转移')
  } catch (error) {
    if (error === 'cancel' || error === 'close') return
    ElMessage.error(getErrorMessage(error))
  } finally {
    lifecycleMemberId.value = null
  }
}

async function removeMember(row: unknown): Promise<void> {
  const member = row as OrganizationMember
  lifecycleMemberId.value = member.id
  try {
    await ElMessageBox.confirm(
      `移除后，${memberOptionLabel(member)} 将失去当前企业及其授权资源的访问权限。`,
      '移除企业成员',
      { confirmButtonText: '确认移除', cancelButtonText: '取消', type: 'warning' },
    )
    await removeMemberMutation.mutateAsync(member.id)
    await invalidateOrganization()
    ElMessage.success('企业成员已移除')
  } catch (error) {
    if (error === 'cancel' || error === 'close') return
    ElMessage.error(getErrorMessage(error))
  } finally {
    lifecycleMemberId.value = null
  }
}

async function leaveOrganization(): Promise<void> {
  const organizationId = selectedOrganizationId.value
  try {
    await ElMessageBox.confirm('退出后，你将失去当前企业及其授权资源的访问权限。', '退出企业', {
      confirmButtonText: '确认退出',
      cancelButtonText: '取消',
      type: 'warning',
    })
    await leaveOrganizationMutation.mutateAsync()
    selectedOrganizationId.value = ''
    queryClient.removeQueries({ queryKey: ['organization', organizationId] })
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['organizations'] }),
      authStore.ensureAccessProfile(true),
    ])
    ElMessage.success('已退出企业')
  } catch (error) {
    if (error === 'cancel' || error === 'close') return
    ElMessage.error(getErrorMessage(error))
  }
}

function openDepartmentDialog(department?: OrganizationDepartment): void {
  editingDepartmentId.value = department?.id ?? null
  departmentForm.name = department?.name ?? ''
  departmentForm.parentId = department?.parentId ?? null
  departmentFormRef.value?.clearValidate()
  departmentDialogVisible.value = true
}

async function saveDepartment(): Promise<void> {
  if (!(await departmentFormRef.value?.validate().catch(() => false))) return
  try {
    const editing = Boolean(editingDepartmentId.value)
    await saveDepartmentMutation.mutateAsync({
      id: editingDepartmentId.value,
      input: {
        name: departmentForm.name.trim(),
        parentId: departmentForm.parentId || null,
      },
    })
    departmentDialogVisible.value = false
    ElMessage.success(editing ? '部门已更新' : '部门已创建')
    await invalidateOrganization()
  } catch (error) {
    ElMessage.error(getErrorMessage(error))
  }
}

function openGroupDialog(group?: OrganizationGroup): void {
  editingGroupId.value = group?.id ?? null
  groupForm.name = group?.name ?? ''
  groupForm.description = group?.description ?? null
  groupFormRef.value?.clearValidate()
  groupDialogVisible.value = true
}

async function saveGroup(): Promise<void> {
  if (!(await groupFormRef.value?.validate().catch(() => false))) return
  try {
    const editing = Boolean(editingGroupId.value)
    await saveGroupMutation.mutateAsync({
      id: editingGroupId.value,
      input: {
        name: groupForm.name.trim(),
        description: groupForm.description?.trim() || null,
      },
    })
    groupDialogVisible.value = false
    ElMessage.success(editing ? '用户组已更新' : '用户组已创建')
    await invalidateOrganization()
  } catch (error) {
    ElMessage.error(getErrorMessage(error))
  }
}

function openUnitMembers(unit: EditableOrganizationUnit): void {
  activeUnit.value = unit
  selectedUnitMemberIds.value = [...unit.memberIds]
  unitMembersDialogVisible.value = true
}

async function saveUnitMembers(): Promise<void> {
  if (!activeUnit.value) return
  try {
    await saveUnitMembersMutation.mutateAsync({
      kind: activeUnit.value.kind,
      id: activeUnit.value.id,
      previousMemberIds: activeUnit.value.memberIds,
      nextMemberIds: selectedUnitMemberIds.value,
    })
    unitMembersDialogVisible.value = false
    ElMessage.success('组织成员范围已更新')
    await invalidateOrganization()
  } catch (error) {
    ElMessage.error(getErrorMessage(error))
  }
}

async function deleteUnit(kind: OrganizationUnitKind, id: string, name: string): Promise<void> {
  const label = kind === 'department' ? '部门' : '用户组'
  try {
    await ElMessageBox.confirm(
      `删除${label}“${name}”后，其成员关系和资源授权将一并移除。`,
      `删除${label}`,
      { confirmButtonText: '确认删除', cancelButtonText: '取消', type: 'warning' },
    )
    await deleteUnitMutation.mutateAsync({ kind, id })
    ElMessage.success(`${label}已删除`)
    await invalidateOrganization()
  } catch (error) {
    if (error === 'cancel' || error === 'close') return
    ElMessage.error(getErrorMessage(error))
  }
}
</script>

<template>
  <div class="organization-page">
    <section class="organization-heading">
      <div class="organization-title">
        <span class="organization-icon"
          ><el-icon><OfficeBuilding /></el-icon
        ></span>
        <div>
          <span class="eyebrow">ENTERPRISE DIRECTORY</span>
          <h2>企业管理</h2>
          <p>集中查看当前企业的成员角色、在职状态和组织结构。</p>
        </div>
      </div>
      <div class="organization-heading-actions">
        <el-button
          v-if="organizations.length > 0 && organizationCapabilities?.canCreate"
          :icon="Plus"
          @click="openCreateOrganization"
        >
          新增企业
        </el-button>
        <el-select
          v-if="organizations.length > 0"
          v-model="selectedOrganizationId"
          class="organization-select"
          placeholder="选择企业"
          :loading="organizationsQuery.isLoading.value"
        >
          <el-option
            v-for="item in organizations"
            :key="item.id"
            :label="item.name"
            :value="item.id"
          />
        </el-select>
      </div>
    </section>

    <el-alert
      v-if="organizationsQuery.isError.value"
      type="error"
      title="企业列表加载失败"
      :description="getErrorMessage(organizationsQuery.error.value)"
      show-icon
      :closable="false"
    />

    <el-alert
      v-else-if="organizationCapabilitiesQuery.isError.value"
      type="error"
      title="企业策略加载失败"
      :description="getErrorMessage(organizationCapabilitiesQuery.error.value)"
      show-icon
      :closable="false"
    />

    <el-empty
      v-else-if="
        !organizationsQuery.isLoading.value &&
        !organizationCapabilitiesQuery.isLoading.value &&
        organizations.length === 0
      "
      :description="emptyOrganizationDescription"
    >
      <el-button
        v-if="organizationCapabilities?.canCreate"
        type="primary"
        :icon="OfficeBuilding"
        @click="openCreateOrganization"
      >
        {{ organizationCapabilities.mode === 'single' ? '初始化企业' : '创建企业' }}
      </el-button>
    </el-empty>

    <template v-else-if="selectedOrganizationId">
      <el-skeleton v-if="organizationQuery.isLoading.value" :rows="8" animated />
      <el-alert
        v-else-if="organizationQuery.isError.value"
        type="error"
        title="企业信息加载失败"
        :description="getErrorMessage(organizationQuery.error.value)"
        show-icon
        :closable="false"
      />

      <template v-else-if="organization">
        <section class="organization-summary">
          <div>
            <span>企业名称</span>
            <strong>{{ organization.name }}</strong>
            <small>{{ organization.slug }}</small>
          </div>
          <div>
            <span>{{ hasFullDirectory ? '有效成员' : '我的成员状态' }}</span>
            <strong>{{ activeMemberCount }}</strong>
            <small>
              {{
                hasFullDirectory
                  ? `共 ${organization.memberships.length} 个成员记录`
                  : roleLabel(organization.currentRole)
              }}
            </small>
          </div>
          <div v-if="hasFullDirectory">
            <span>部门</span>
            <strong>{{ organization.departments.length }}</strong>
            <small>企业组织架构</small>
          </div>
          <div v-if="hasFullDirectory">
            <span>用户组</span>
            <strong>{{ organization.groups.length }}</strong>
            <small>跨部门权限集合</small>
          </div>
        </section>

        <el-alert
          v-if="!hasFullDirectory"
          type="info"
          title="当前仅显示你的企业成员信息"
          :closable="false"
          show-icon
        />

        <section class="organization-section members-section">
          <header class="section-header">
            <div>
              <h3>{{ hasFullDirectory ? '人员管理' : '我的企业身份' }}</h3>
              <p v-if="hasFullDirectory">成员角色决定其在当前企业内的管理范围。</p>
            </div>
            <div class="section-actions">
              <el-input
                v-if="hasFullDirectory"
                v-model="search"
                :prefix-icon="Search"
                clearable
                placeholder="搜索姓名或邮箱"
              />
              <el-tooltip content="刷新企业成员" placement="top">
                <el-button
                  :icon="Refresh"
                  circle
                  aria-label="刷新企业成员"
                  @click="refreshOrganization"
                />
              </el-tooltip>
              <el-tooltip v-if="canLeaveOrganization" content="退出当前企业" placement="top">
                <el-button
                  :icon="SwitchButton"
                  type="danger"
                  plain
                  :loading="leaveOrganizationMutation.isPending.value"
                  @click="leaveOrganization"
                >
                  退出企业
                </el-button>
              </el-tooltip>
              <el-dropdown
                v-if="canManageMembers"
                trigger="click"
                @command="handleAddMemberCommand"
              >
                <el-button type="primary" :icon="Plus">
                  新增成员
                  <el-icon class="member-action-arrow"><ArrowDown /></el-icon>
                </el-button>
                <template #dropdown>
                  <el-dropdown-menu>
                    <el-dropdown-item command="invite" :icon="Message">
                      邀请新成员
                    </el-dropdown-item>
                    <el-dropdown-item command="existing" :icon="User">
                      添加已有账号
                    </el-dropdown-item>
                  </el-dropdown-menu>
                </template>
              </el-dropdown>
              <el-tooltip
                v-else
                :content="hasFullDirectory ? '当前角色仅可查看企业目录' : '企业目录仅显示本人信息'"
                placement="top"
              >
                <el-tag type="info" effect="plain">
                  {{ hasFullDirectory ? '企业目录只读' : '仅本人可见' }}
                </el-tag>
              </el-tooltip>
            </div>
          </header>

          <el-table :data="filteredMembers" row-key="id" empty-text="没有符合条件的企业成员">
            <el-table-column label="成员" min-width="250">
              <template #default="{ row }">
                <div class="member-cell">
                  <span class="member-avatar"
                    ><el-icon><UserFilled /></el-icon
                  ></span>
                  <div>
                    <strong>{{ row.user.name || row.user.email }}</strong>
                    <span>{{ row.user.name ? row.user.email : '未设置姓名' }}</span>
                    <el-tag v-if="row.sourceSystem" type="info" size="small">目录同步</el-tag>
                  </div>
                </div>
              </template>
            </el-table-column>
            <el-table-column label="企业角色" min-width="180">
              <template #default="{ row }">
                <el-tag v-if="row.role === 'OWNER'" type="warning">企业所有者</el-tag>
                <el-select
                  v-else-if="canManageMembers && !row.sourceSystem"
                  :model-value="row.role"
                  :disabled="editingMemberId === row.id"
                  aria-label="企业角色"
                  @change="updateRole(row, $event)"
                >
                  <el-option
                    v-for="role in ASSIGNABLE_ROLES"
                    :key="role"
                    :label="roleLabel(role)"
                    :value="role"
                  />
                </el-select>
                <span v-else>{{ roleLabel(row.role) }}</span>
              </template>
            </el-table-column>
            <el-table-column label="状态" width="150">
              <template #default="{ row }">
                <el-select
                  v-if="
                    canManageMembers &&
                    !row.sourceSystem &&
                    row.role !== 'OWNER' &&
                    row.userId !== authStore.user?.id
                  "
                  :model-value="row.status === 'SUSPENDED' ? 'SUSPENDED' : 'ACTIVE'"
                  :disabled="editingMemberId === row.id"
                  aria-label="成员状态"
                  @change="updateStatus(row, $event)"
                >
                  <el-option label="正常" value="ACTIVE" />
                  <el-option label="停用" value="SUSPENDED" />
                </el-select>
                <el-tag v-else :type="statusType(row.status)">{{ statusLabel(row.status) }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column label="加入日期" width="130">
              <template #default="{ row }">{{ formatDate(row.joinedAt) }}</template>
            </el-table-column>
            <el-table-column v-if="canManageMembers" label="操作" width="190" fixed="right">
              <template #default="{ row }">
                <el-button
                  v-if="canTransferOwnership && row.role !== 'OWNER' && row.status === 'ACTIVE'"
                  link
                  type="primary"
                  :icon="SwitchButton"
                  :loading="lifecycleMemberId === row.id"
                  @click="transferOwnership(row)"
                >
                  转移所有权
                </el-button>
                <el-button
                  v-if="
                    row.role !== 'OWNER' && row.userId !== authStore.user?.id && !row.sourceSystem
                  "
                  link
                  type="danger"
                  :icon="Delete"
                  :loading="lifecycleMemberId === row.id"
                  @click="removeMember(row)"
                >
                  移除
                </el-button>
              </template>
            </el-table-column>
          </el-table>

          <div class="member-mobile-list">
            <div v-for="member in filteredMembers" :key="member.id" class="member-mobile-item">
              <div class="member-cell">
                <span class="member-avatar"
                  ><el-icon><UserFilled /></el-icon
                ></span>
                <div>
                  <strong>{{ member.user.name || member.user.email }}</strong>
                  <span>{{ member.user.email }}</span>
                  <el-tag v-if="member.sourceSystem" type="info" size="small">目录同步</el-tag>
                </div>
              </div>
              <dl>
                <div>
                  <dt>企业角色</dt>
                  <dd>
                    <el-tag v-if="member.role === 'OWNER'" type="warning">企业所有者</el-tag>
                    <el-select
                      v-else-if="canManageMembers && !member.sourceSystem"
                      :model-value="member.role"
                      :disabled="editingMemberId === member.id"
                      aria-label="企业角色"
                      @change="updateRole(member, $event)"
                    >
                      <el-option
                        v-for="role in ASSIGNABLE_ROLES"
                        :key="role"
                        :label="roleLabel(role)"
                        :value="role"
                      />
                    </el-select>
                    <span v-else>{{ roleLabel(member.role) }}</span>
                  </dd>
                </div>
                <div>
                  <dt>状态</dt>
                  <dd>
                    <el-select
                      v-if="
                        canManageMembers &&
                        !member.sourceSystem &&
                        member.role !== 'OWNER' &&
                        member.userId !== authStore.user?.id
                      "
                      :model-value="member.status === 'SUSPENDED' ? 'SUSPENDED' : 'ACTIVE'"
                      :disabled="editingMemberId === member.id"
                      aria-label="成员状态"
                      @change="updateStatus(member, $event)"
                    >
                      <el-option label="正常" value="ACTIVE" />
                      <el-option label="停用" value="SUSPENDED" />
                    </el-select>
                    <el-tag v-else :type="statusType(member.status)">
                      {{ statusLabel(member.status) }}
                    </el-tag>
                  </dd>
                </div>
                <div>
                  <dt>加入日期</dt>
                  <dd>{{ formatDate(member.joinedAt) }}</dd>
                </div>
              </dl>
              <div
                v-if="
                  canManageMembers &&
                  (canTransferOwnership ||
                    (member.role !== 'OWNER' &&
                      member.userId !== authStore.user?.id &&
                      !member.sourceSystem))
                "
                class="member-lifecycle-actions"
              >
                <el-button
                  v-if="
                    canTransferOwnership && member.role !== 'OWNER' && member.status === 'ACTIVE'
                  "
                  link
                  type="primary"
                  :icon="SwitchButton"
                  :loading="lifecycleMemberId === member.id"
                  @click="transferOwnership(member)"
                >
                  转移所有权
                </el-button>
                <el-button
                  v-if="
                    member.role !== 'OWNER' &&
                    member.userId !== authStore.user?.id &&
                    !member.sourceSystem
                  "
                  link
                  type="danger"
                  :icon="Delete"
                  :loading="lifecycleMemberId === member.id"
                  @click="removeMember(member)"
                >
                  移除成员
                </el-button>
              </div>
            </div>
            <el-empty v-if="filteredMembers.length === 0" description="没有符合条件的企业成员" />
          </div>
        </section>

        <section v-if="canManageInvitations" class="organization-section invitation-section">
          <header class="section-header">
            <div>
              <h3>企业邀请</h3>
              <p>邀请链接使用一次后立即失效。</p>
            </div>
            <el-tooltip content="刷新企业邀请" placement="top">
              <el-button
                :icon="Refresh"
                circle
                aria-label="刷新企业邀请"
                @click="invitationsQuery.refetch()"
              />
            </el-tooltip>
          </header>
          <el-skeleton v-if="invitationsQuery.isLoading.value" :rows="3" animated />
          <el-alert
            v-else-if="invitationsQuery.isError.value"
            type="error"
            title="企业邀请加载失败"
            :description="getErrorMessage(invitationsQuery.error.value)"
            show-icon
            :closable="false"
          />
          <el-empty v-else-if="invitations.length === 0" description="暂无企业邀请" />
          <ul v-else class="invitation-list">
            <li v-for="invitation in invitations" :key="invitation.id">
              <div class="invitation-recipient">
                <span
                  ><el-icon><Message /></el-icon
                ></span>
                <div>
                  <strong>{{ invitation.email }}</strong>
                  <small
                    >{{ roleLabel(invitation.role) }} ·
                    {{ formatDate(invitation.expiresAt) }} 到期</small
                  >
                </div>
              </div>
              <el-tag :type="invitationStatusType(invitation)">
                {{ invitationStatus(invitation) }}
              </el-tag>
              <div class="invitation-actions">
                <el-button link :icon="Refresh" @click="openInviteMember(invitation)">
                  重新生成
                </el-button>
                <el-button
                  v-if="canRevokeInvitation(invitation)"
                  link
                  type="danger"
                  @click="revokeInvitation(invitation)"
                >
                  撤销
                </el-button>
              </div>
            </li>
          </ul>
        </section>

        <div v-if="hasFullDirectory" class="structure-grid">
          <section class="organization-section">
            <header class="section-header compact">
              <div>
                <h3>部门</h3>
                <p>当前企业的层级组织单元。</p>
              </div>
              <el-tooltip v-if="canManageUnits" content="创建部门" placement="top">
                <el-button
                  :icon="Plus"
                  circle
                  aria-label="创建部门"
                  @click="openDepartmentDialog()"
                />
              </el-tooltip>
            </header>
            <el-empty v-if="organization.departments.length === 0" description="尚未创建部门" />
            <ul v-else class="structure-list">
              <li v-for="department in organization.departments" :key="department.id">
                <div class="structure-main">
                  <span class="structure-icon"
                    ><el-icon><OfficeBuilding /></el-icon
                  ></span>
                  <div>
                    <strong>{{ department.name }}</strong>
                    <small>{{ departmentName(department.parentId) }}</small>
                  </div>
                </div>
                <div class="structure-actions">
                  <el-tag v-if="department.sourceSystem" type="info" size="small">目录同步</el-tag>
                  <span class="member-count">{{ department.memberIds.length }} 人</span>
                  <template v-if="canManageUnits && !department.sourceSystem">
                    <el-tooltip content="分配部门成员" placement="top">
                      <el-button
                        :icon="User"
                        link
                        aria-label="分配部门成员"
                        @click="
                          openUnitMembers({
                            kind: 'department',
                            id: department.id,
                            name: department.name,
                            memberIds: department.memberIds,
                          })
                        "
                      />
                    </el-tooltip>
                    <el-tooltip content="编辑部门" placement="top">
                      <el-button
                        :icon="Edit"
                        link
                        aria-label="编辑部门"
                        @click="openDepartmentDialog(department)"
                      />
                    </el-tooltip>
                    <el-tooltip content="删除部门" placement="top">
                      <el-button
                        :icon="Delete"
                        link
                        type="danger"
                        aria-label="删除部门"
                        @click="deleteUnit('department', department.id, department.name)"
                      />
                    </el-tooltip>
                  </template>
                </div>
              </li>
            </ul>
          </section>
          <section class="organization-section">
            <header class="section-header compact">
              <div>
                <h3>用户组</h3>
                <p>用于跨部门组织知识访问范围。</p>
              </div>
              <el-tooltip v-if="canManageUnits" content="创建用户组" placement="top">
                <el-button :icon="Plus" circle aria-label="创建用户组" @click="openGroupDialog()" />
              </el-tooltip>
            </header>
            <el-empty v-if="organization.groups.length === 0" description="尚未创建用户组" />
            <ul v-else class="structure-list">
              <li v-for="group in organization.groups" :key="group.id">
                <div class="structure-main">
                  <span class="structure-icon group-icon"
                    ><el-icon><UserFilled /></el-icon
                  ></span>
                  <div>
                    <strong>{{ group.name }}</strong>
                    <small>{{ group.description || '暂无说明' }}</small>
                  </div>
                </div>
                <div class="structure-actions">
                  <span class="member-count">{{ group.memberIds.length }} 人</span>
                  <template v-if="canManageUnits">
                    <el-tooltip content="分配用户组成员" placement="top">
                      <el-button
                        :icon="User"
                        link
                        aria-label="分配用户组成员"
                        @click="
                          openUnitMembers({
                            kind: 'group',
                            id: group.id,
                            name: group.name,
                            memberIds: group.memberIds,
                          })
                        "
                      />
                    </el-tooltip>
                    <el-tooltip content="编辑用户组" placement="top">
                      <el-button
                        :icon="Edit"
                        link
                        aria-label="编辑用户组"
                        @click="openGroupDialog(group)"
                      />
                    </el-tooltip>
                    <el-tooltip content="删除用户组" placement="top">
                      <el-button
                        :icon="Delete"
                        link
                        type="danger"
                        aria-label="删除用户组"
                        @click="deleteUnit('group', group.id, group.name)"
                      />
                    </el-tooltip>
                  </template>
                </div>
              </li>
            </ul>
          </section>
        </div>
      </template>
    </template>

    <el-dialog
      v-model="createOrganizationDialogVisible"
      :title="organizationCapabilities?.mode === 'single' ? '初始化企业' : '创建企业'"
      width="min(520px, calc(100vw - 32px))"
    >
      <el-form
        ref="createOrganizationFormRef"
        :model="createOrganizationForm"
        :rules="createOrganizationRules"
        label-position="top"
      >
        <el-form-item label="企业名称" prop="name">
          <el-input v-model="createOrganizationForm.name" maxlength="150" show-word-limit />
        </el-form-item>
        <el-form-item label="企业标识" prop="slug">
          <el-input
            v-model="createOrganizationForm.slug"
            maxlength="100"
            placeholder="example-company"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="createOrganizationDialogVisible = false">取消</el-button>
        <el-button
          type="primary"
          :loading="createOrganizationMutation.isPending.value"
          @click="saveOrganization"
        >
          确认创建
        </el-button>
      </template>
    </el-dialog>

    <el-dialog
      v-model="addDialogVisible"
      title="添加企业成员"
      width="min(520px, calc(100vw - 32px))"
    >
      <el-alert
        title="用于已经完成注册的账号"
        description="尚未注册的人员请使用企业邀请。"
        type="info"
        show-icon
        :closable="false"
      />
      <el-form ref="addFormRef" :model="addForm" :rules="addRules" label-position="top">
        <el-form-item label="成员邮箱" prop="email">
          <el-input v-model="addForm.email" placeholder="member@example.com" />
        </el-form-item>
        <el-form-item label="企业角色" prop="role">
          <el-select v-model="addForm.role">
            <el-option
              v-for="role in ASSIGNABLE_ROLES"
              :key="role"
              :label="roleLabel(role)"
              :value="role"
            />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="addDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="addMemberMutation.isPending.value" @click="saveMember">
          确认添加
        </el-button>
      </template>
    </el-dialog>

    <el-dialog
      v-model="inviteDialogVisible"
      title="邀请新成员"
      width="min(560px, calc(100vw - 32px))"
    >
      <template v-if="!generatedInvitationLink">
        <el-form ref="inviteFormRef" :model="inviteForm" :rules="inviteRules" label-position="top">
          <el-form-item label="邀请邮箱" prop="email">
            <el-input v-model="inviteForm.email" placeholder="new.member@example.com" />
          </el-form-item>
          <el-form-item label="企业角色" prop="role">
            <el-select v-model="inviteForm.role">
              <el-option
                v-for="role in ASSIGNABLE_ROLES"
                :key="role"
                :label="roleLabel(role)"
                :value="role"
              />
            </el-select>
          </el-form-item>
        </el-form>
      </template>
      <template v-else>
        <el-result icon="success" title="邀请链接已生成">
          <template #sub-title>链接包含一次性凭据，请通过可信渠道发送给受邀者。</template>
        </el-result>
        <div class="generated-link">
          <el-input :model-value="generatedInvitationLink" readonly />
          <el-tooltip content="复制邀请链接" placement="top">
            <el-button :icon="CopyDocument" aria-label="复制邀请链接" @click="copyInvitationLink" />
          </el-tooltip>
        </div>
      </template>
      <template #footer>
        <el-button @click="inviteDialogVisible = false">
          {{ generatedInvitationLink ? '完成' : '取消' }}
        </el-button>
        <el-button
          v-if="!generatedInvitationLink"
          type="primary"
          :loading="createInvitationMutation.isPending.value"
          @click="saveInvitation"
        >
          生成邀请链接
        </el-button>
      </template>
    </el-dialog>

    <el-dialog
      v-model="departmentDialogVisible"
      :title="editingDepartmentId ? '编辑部门' : '创建部门'"
      width="min(520px, calc(100vw - 32px))"
    >
      <el-form
        ref="departmentFormRef"
        :model="departmentForm"
        :rules="departmentRules"
        label-position="top"
      >
        <el-form-item label="部门名称" prop="name">
          <el-input v-model="departmentForm.name" maxlength="100" show-word-limit />
        </el-form-item>
        <el-form-item label="上级部门" prop="parentId">
          <el-select v-model="departmentForm.parentId" clearable placeholder="一级部门">
            <el-option
              v-for="department in departmentParentOptions"
              :key="department.id"
              :label="department.name"
              :value="department.id"
            />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="departmentDialogVisible = false">取消</el-button>
        <el-button
          type="primary"
          :loading="saveDepartmentMutation.isPending.value"
          @click="saveDepartment"
        >
          {{ editingDepartmentId ? '保存修改' : '确认创建' }}
        </el-button>
      </template>
    </el-dialog>

    <el-dialog
      v-model="groupDialogVisible"
      :title="editingGroupId ? '编辑用户组' : '创建用户组'"
      width="min(520px, calc(100vw - 32px))"
    >
      <el-form ref="groupFormRef" :model="groupForm" :rules="groupRules" label-position="top">
        <el-form-item label="用户组名称" prop="name">
          <el-input v-model="groupForm.name" maxlength="100" show-word-limit />
        </el-form-item>
        <el-form-item label="说明" prop="description">
          <el-input
            v-model="groupForm.description"
            type="textarea"
            :rows="3"
            maxlength="500"
            show-word-limit
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="groupDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="saveGroupMutation.isPending.value" @click="saveGroup">
          {{ editingGroupId ? '保存修改' : '确认创建' }}
        </el-button>
      </template>
    </el-dialog>

    <el-dialog
      v-model="unitMembersDialogVisible"
      :title="`分配成员 · ${activeUnit?.name ?? ''}`"
      width="min(560px, calc(100vw - 32px))"
    >
      <el-form label-position="top">
        <el-form-item label="企业成员">
          <el-select
            v-model="selectedUnitMemberIds"
            multiple
            filterable
            collapse-tags
            collapse-tags-tooltip
            placeholder="选择成员"
          >
            <el-option
              v-for="member in organization?.memberships ?? []"
              :key="member.id"
              :label="memberOptionLabel(member)"
              :value="member.id"
              :disabled="member.status !== 'ACTIVE' && !activeUnit?.memberIds.includes(member.id)"
            >
              <div class="member-option">
                <span>{{ memberOptionLabel(member) }}</span>
                <el-tag v-if="member.status !== 'ACTIVE'" type="info" size="small">
                  {{ statusLabel(member.status) }}
                </el-tag>
              </div>
            </el-option>
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="unitMembersDialogVisible = false">取消</el-button>
        <el-button
          type="primary"
          :loading="saveUnitMembersMutation.isPending.value"
          @click="saveUnitMembers"
        >
          保存成员
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.organization-page {
  display: grid;
  gap: 20px;
  max-width: 1440px;
  margin: 0 auto;
}

.organization-heading,
.section-header,
.section-actions,
.organization-title,
.member-cell {
  display: flex;
  align-items: center;
}

.organization-heading {
  justify-content: space-between;
  gap: 24px;
}

.organization-heading-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
}

.organization-title {
  gap: 14px;
}

.organization-icon,
.member-avatar {
  display: grid;
  flex: 0 0 auto;
  place-items: center;
  color: #2458c6;
  background: #eaf0ff;
}

.organization-icon {
  width: 46px;
  height: 46px;
  border-radius: 8px;
  font-size: 22px;
}

.organization-heading h2,
.section-header h3 {
  margin: 0;
  color: var(--ink);
  letter-spacing: 0;
}

.organization-heading h2 {
  font-size: 25px;
}

.organization-heading p,
.section-header p {
  margin: 5px 0 0;
  color: var(--muted);
  font-size: 13px;
}

.organization-select {
  width: min(320px, 100%);
}

.organization-summary {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  border: 1px solid var(--line);
  border-radius: 8px;
  background: #fff;
}

.organization-summary > div {
  display: grid;
  gap: 5px;
  min-width: 0;
  padding: 20px 22px;
  border-right: 1px solid var(--line);
}

.organization-summary > div:last-child {
  border-right: 0;
}

.organization-summary span,
.organization-summary small {
  overflow: hidden;
  color: var(--muted);
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.organization-summary strong {
  overflow: hidden;
  color: var(--ink);
  font-size: 22px;
  letter-spacing: 0;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.organization-section {
  overflow: hidden;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: #fff;
}

.section-header {
  justify-content: space-between;
  gap: 20px;
  padding: 20px 22px;
  border-bottom: 1px solid var(--line);
}

.section-header.compact {
  min-height: 82px;
}

.section-header h3 {
  font-size: 17px;
}

.section-actions {
  gap: 10px;
}

.section-actions .el-input {
  width: 230px;
}

.member-action-arrow {
  margin-left: 6px;
}

.member-cell {
  gap: 11px;
}

.member-avatar {
  width: 34px;
  height: 34px;
  border-radius: 50%;
}

.member-cell > div {
  display: grid;
  min-width: 0;
}

.member-cell strong,
.member-cell span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.member-cell span {
  margin-top: 2px;
  color: var(--muted);
  font-size: 12px;
}

.structure-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 20px;
}

.member-mobile-list {
  display: none;
}

.member-lifecycle-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.invitation-list {
  display: grid;
  margin: 0;
  padding: 0;
  list-style: none;
}

.invitation-list li {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto auto;
  align-items: center;
  gap: 18px;
  min-height: 66px;
  padding: 12px 22px;
  border-bottom: 1px solid var(--line);
}

.invitation-list li:last-child {
  border-bottom: 0;
}

.invitation-recipient,
.invitation-actions,
.generated-link {
  display: flex;
  align-items: center;
}

.invitation-recipient {
  min-width: 0;
  gap: 11px;
}

.invitation-recipient > span {
  display: grid;
  flex: 0 0 34px;
  width: 34px;
  height: 34px;
  place-items: center;
  border-radius: 8px;
  color: #2458c6;
  background: #eaf0ff;
}

.invitation-recipient > div {
  display: grid;
  min-width: 0;
}

.invitation-recipient strong,
.invitation-recipient small {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.invitation-recipient small {
  margin-top: 3px;
  color: var(--muted);
}

.invitation-actions {
  gap: 6px;
}

.generated-link {
  gap: 8px;
}

.generated-link .el-input {
  min-width: 0;
}

.structure-list {
  display: grid;
  gap: 0;
  margin: 0;
  padding: 0;
  list-style: none;
}

.structure-list li {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  min-height: 50px;
  padding: 10px 22px;
  border-bottom: 1px solid var(--line);
}

.structure-list li:last-child {
  border-bottom: 0;
}

.structure-main,
.structure-actions,
.member-option {
  display: flex;
  align-items: center;
}

.structure-main {
  min-width: 0;
  gap: 10px;
}

.structure-main > div {
  display: grid;
  min-width: 0;
}

.structure-main strong,
.structure-main small {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.structure-main small {
  margin-top: 3px;
  color: var(--muted);
  font-size: 12px;
}

.structure-icon {
  display: grid;
  flex: 0 0 32px;
  width: 32px;
  height: 32px;
  place-items: center;
  border-radius: 8px;
  color: #2458c6;
  background: #eaf0ff;
}

.structure-icon.group-icon {
  color: #246b4d;
  background: #e9f5ef;
}

.structure-actions {
  flex: 0 0 auto;
  gap: 4px;
}

.member-count {
  margin-right: 4px;
  color: var(--muted);
  font-size: 12px;
  white-space: nowrap;
}

.member-option {
  justify-content: space-between;
  gap: 12px;
  width: 100%;
}

.member-option > span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.el-dialog .el-form {
  margin-top: 18px;
}

@media (max-width: 900px) {
  .organization-summary {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .organization-summary > div:nth-child(2) {
    border-right: 0;
  }

  .organization-summary > div:nth-child(-n + 2) {
    border-bottom: 1px solid var(--line);
  }

  .section-header,
  .section-actions {
    align-items: stretch;
  }

  .section-header {
    flex-direction: column;
  }

  .section-actions .el-input {
    flex: 1;
    width: auto;
  }
}

@media (max-width: 640px) {
  .organization-heading,
  .organization-heading-actions,
  .section-actions {
    flex-direction: column;
    align-items: stretch;
  }

  .organization-title {
    align-items: flex-start;
  }

  .organization-select,
  .section-actions .el-input {
    width: 100%;
  }

  .organization-summary,
  .structure-grid {
    grid-template-columns: 1fr;
  }

  .organization-summary > div {
    border-right: 0;
    border-bottom: 1px solid var(--line);
  }

  .organization-summary > div:last-child {
    border-bottom: 0;
  }

  .members-section :deep(.el-table) {
    display: none;
  }

  .member-mobile-list {
    display: grid;
  }

  .member-mobile-item {
    display: grid;
    gap: 16px;
    padding: 18px 22px;
    border-bottom: 1px solid var(--line);
  }

  .member-mobile-item:last-child {
    border-bottom: 0;
  }

  .member-mobile-item dl {
    display: grid;
    gap: 12px;
    margin: 0;
  }

  .member-mobile-item dl > div {
    display: grid;
    grid-template-columns: 72px minmax(0, 1fr);
    align-items: center;
    gap: 10px;
  }

  .member-mobile-item dt {
    color: var(--muted);
    font-size: 12px;
  }

  .member-mobile-item dd {
    min-width: 0;
    margin: 0;
  }

  .member-mobile-item .el-select {
    width: 100%;
  }

  .invitation-list li {
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 12px;
    align-items: start;
  }

  .invitation-actions {
    grid-column: 1 / -1;
    justify-content: flex-end;
  }

  .structure-list li {
    display: grid;
    gap: 10px;
  }

  .structure-actions {
    justify-content: flex-end;
  }
}
</style>
