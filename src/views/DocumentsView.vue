<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query'
import {
  CircleCheck,
  CloseBold,
  Delete,
  Document as DocumentIcon,
  FolderOpened,
  MagicStick,
  Link,
  Picture,
  EditPen,
  Files,
  Plus,
  QuestionFilled,
  Refresh,
  Search,
  Tickets,
  UploadFilled,
  VideoCamera,
  Warning,
} from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useRoute, useRouter } from 'vue-router'

import * as documentsApi from '@/services/api/documents'
import * as knowledgeBaseApi from '@/services/api/knowledge-bases'
import { getErrorCodeMessage, getErrorMessage } from '@/services/error-feedback'
import { readSession } from '@/services/session-storage'
import type { KnowledgeDocument } from '@/types/document'
import type {
  DocumentAudienceEvidence,
  DocumentBusinessEvidence,
  DocumentAudienceApproval,
  UpdateDocumentMetadataInput,
  UpsertDocumentAudienceEvidenceInput,
} from '@/types/document'

const PAGE_SIZE = 20
const MAX_FILES = 20
const MAX_FILE_SIZE = 20 * 1024 * 1024
const MAX_TOTAL_SIZE = 100 * 1024 * 1024
const ACCEPTED_EXTENSIONS = ['.txt', '.md', '.pdf', '.docx', '.xlsx']
const ACCEPTED_FILE_TYPES = [
  ...ACCEPTED_EXTENSIONS,
  'text/plain',
  'text/markdown',
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
].join(',')
const BUSINESS_EVIDENCE_ATTACHMENT_TYPES =
  'image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm,video/quicktime'
const BUSINESS_EVIDENCE_ATTACHMENT_LIMIT = 5
const BUSINESS_EVIDENCE_IMAGE_MAX_SIZE = 10 * 1024 * 1024
const BUSINESS_EVIDENCE_VIDEO_MAX_SIZE = 100 * 1024 * 1024

const route = useRoute()
const router = useRouter()
const queryClient = useQueryClient()
const page = ref(1)
const selectedKnowledgeBaseId = ref('')
const search = ref('')
const statusFilter = ref<'ALL' | 'PROCESSING' | 'READY' | 'FAILED'>('ALL')
const audienceFilter = ref<'ALL' | 'UNCONFIRMED' | 'APPROVED' | 'REJECTED'>('ALL')
const uploadDialogVisible = ref(false)
const selectedFiles = ref<File[]>([])
const dragActive = ref(false)
const fileInput = ref<HTMLInputElement>()
const metadataDialogVisible = ref(false)
const audienceEvidenceDialogVisible = ref(false)
const businessEvidenceDialogVisible = ref(false)
const audienceApprovalTodoDrawerVisible = ref(false)
const businessEvidenceEditor = ref<HTMLElement>()
const businessEvidenceFileInput = ref<HTMLInputElement>()
const versionsDrawerVisible = ref(false)
const versionUploadVisible = ref(false)
const activeDocument = ref<KnowledgeDocument | null>(null)
const versionFile = ref<File | null>(null)
const versionFileInput = ref<HTMLInputElement>()
const versionLabel = ref('')
const metadataForm = ref({
  category: '',
  businessDomain: '',
  tags: [] as string[],
  sensitivityLevel: 'INTERNAL' as KnowledgeDocument['sensitivityLevel'],
  accessMode: 'INHERIT' as KnowledgeDocument['accessMode'],
  versionLabel: '',
  effectiveAt: '',
  expiresAt: '',
})
const audienceEvidenceForm = ref<UpsertDocumentAudienceEvidenceInput>({
  proposedAudienceTag: 'audience:internal-only',
  businessOwner: '',
  businessEvidenceId: '',
  approvalId: '',
  businessEvidenceReference: '',
  approvalReference: '',
  approvalAt: '',
  decision: 'APPROVED',
  comment: '',
})
const businessEvidenceItems = ref<DocumentBusinessEvidence[]>([])
const audienceApprovalItems = ref<DocumentAudienceApproval[]>([])
const businessEvidenceForm = ref({ title: '', detailsHtml: '' })
const businessEvidenceAttachments = ref<File[]>([])
const creatingBusinessEvidence = ref(false)
const creatingAudienceApproval = ref(false)
const decidingApprovalId = ref('')
const currentUserId = readSession()?.user.id ?? ''
let pollTimer: ReturnType<typeof setInterval> | null = null

const knowledgeBasesQuery = useQuery({
  queryKey: ['knowledge-bases', 'document-selector'],
  queryFn: () => knowledgeBaseApi.listKnowledgeBases(1, 100),
})

watch(
  () => knowledgeBasesQuery.data.value?.items,
  (items) => {
    if (!items?.length || selectedKnowledgeBaseId.value) return
    const queryId =
      typeof route.query.knowledgeBaseId === 'string' ? route.query.knowledgeBaseId : ''
    selectedKnowledgeBaseId.value = items.some((item) => item.id === queryId)
      ? queryId
      : (items[0]?.id ?? '')
  },
  { immediate: true },
)

watch(selectedKnowledgeBaseId, async (id) => {
  page.value = 1
  if (id && route.query.knowledgeBaseId !== id) {
    await router.replace({ query: { ...route.query, knowledgeBaseId: id } })
  }
})

const documentsQuery = useQuery({
  queryKey: computed(() => ['documents', selectedKnowledgeBaseId.value, page.value, PAGE_SIZE]),
  queryFn: () => documentsApi.listDocuments(selectedKnowledgeBaseId.value, page.value, PAGE_SIZE),
  enabled: computed(() => Boolean(selectedKnowledgeBaseId.value)),
})

const lifecycleSummaryQuery = useQuery({
  queryKey: computed(() => ['document-lifecycle-summary', selectedKnowledgeBaseId.value]),
  queryFn: () => documentsApi.getDocumentLifecycleSummary(selectedKnowledgeBaseId.value),
  enabled: computed(() => Boolean(selectedKnowledgeBaseId.value)),
})

const audienceApprovalSummaryQuery = useQuery({
  queryKey: computed(() => ['document-audience-approval-summary', selectedKnowledgeBaseId.value]),
  queryFn: () => documentsApi.getDocumentAudienceApprovalSummary(selectedKnowledgeBaseId.value),
  enabled: computed(() => Boolean(selectedKnowledgeBaseId.value)),
  refetchInterval: 60_000,
})

const uploadMutation = useMutation({
  mutationFn: ({ knowledgeBaseId, files }: { knowledgeBaseId: string; files: File[] }) =>
    documentsApi.uploadDocuments(knowledgeBaseId, files),
})

const deleteMutation = useMutation({
  mutationFn: ({ knowledgeBaseId, documentId }: { knowledgeBaseId: string; documentId: string }) =>
    documentsApi.deleteDocument(knowledgeBaseId, documentId),
})

const metadataMutation = useMutation({
  mutationFn: ({ documentId, input }: { documentId: string; input: UpdateDocumentMetadataInput }) =>
    documentsApi.updateDocumentMetadata(selectedKnowledgeBaseId.value, documentId, input),
})

const audienceEvidenceMutation = useMutation({
  mutationFn: ({
    documentId,
    input,
  }: {
    documentId: string
    input: UpsertDocumentAudienceEvidenceInput
  }) =>
    documentsApi.upsertDocumentAudienceEvidence(selectedKnowledgeBaseId.value, documentId, input),
})

const versionsQuery = useQuery({
  queryKey: computed(() => [
    'document-versions',
    selectedKnowledgeBaseId.value,
    activeDocument.value?.id,
  ]),
  queryFn: () =>
    documentsApi.listDocumentVersions(
      selectedKnowledgeBaseId.value,
      activeDocument.value?.id ?? '',
    ),
  enabled: computed(() => versionsDrawerVisible.value && Boolean(activeDocument.value?.id)),
})

const versionUploadMutation = useMutation({
  mutationFn: ({ documentId, file, label }: { documentId: string; file: File; label: string }) =>
    documentsApi.uploadDocumentVersion(selectedKnowledgeBaseId.value, documentId, file, label),
})

const activateVersionMutation = useMutation({
  mutationFn: ({ documentId, versionId }: { documentId: string; versionId: string }) =>
    documentsApi.activateDocumentVersion(selectedKnowledgeBaseId.value, documentId, versionId),
})

const knowledgeBases = computed(() => knowledgeBasesQuery.data.value?.items ?? [])
const currentKnowledgeBase = computed(() =>
  knowledgeBases.value.find((item) => item.id === selectedKnowledgeBaseId.value),
)
const documents = computed(() => documentsQuery.data.value?.items ?? [])
const meta = computed(() => documentsQuery.data.value?.meta)
const selectedTotalSize = computed(() =>
  selectedFiles.value.reduce((sum, file) => sum + file.size, 0),
)
const filteredDocuments = computed(() => {
  const keyword = search.value.trim().toLocaleLowerCase()
  return documents.value.filter((item) => {
    const state = displayState(item).key
    const audienceState = item.audienceEvidence ? item.audienceEvidence.decision : 'UNCONFIRMED'
    return (
      (statusFilter.value === 'ALL' || state === statusFilter.value) &&
      (audienceFilter.value === 'ALL' || audienceState === audienceFilter.value) &&
      (!keyword || item.originalName.toLocaleLowerCase().includes(keyword))
    )
  })
})

const selectedBusinessEvidence = computed(() =>
  businessEvidenceItems.value.find(
    (item) => item.id === audienceEvidenceForm.value.businessEvidenceId,
  ),
)

const compatibleApprovedAudienceApprovals = computed(() => {
  const form = audienceEvidenceForm.value
  const businessOwner = form.businessOwner.trim()
  return audienceApprovalItems.value.filter(
    (item) =>
      item.status === 'APPROVED' &&
      item.businessEvidenceId === form.businessEvidenceId &&
      item.proposedAudienceTag === form.proposedAudienceTag &&
      item.businessOwner === businessOwner,
  )
})

watch(
  () => [
    audienceEvidenceForm.value.businessEvidenceId,
    audienceEvidenceForm.value.proposedAudienceTag,
    audienceEvidenceForm.value.businessOwner.trim(),
  ],
  () => {
    const approvalId = audienceEvidenceForm.value.approvalId
    if (
      approvalId &&
      !compatibleApprovedAudienceApprovals.value.some((item) => item.id === approvalId)
    ) {
      audienceEvidenceForm.value.approvalId = ''
    }
  },
)

const audienceCounts = computed(() => ({
  unconfirmed: documents.value.filter((item) => !item.audienceEvidence).length,
  approved: documents.value.filter((item) => item.audienceEvidence?.decision === 'APPROVED').length,
  rejected: documents.value.filter((item) => item.audienceEvidence?.decision === 'REJECTED').length,
}))

watch(
  () =>
    documents.value.some((item) =>
      ['PENDING', 'RUNNING'].includes(item.ingestionJob?.status ?? ''),
    ),
  (needsPolling) => {
    if (needsPolling && !pollTimer) pollTimer = setInterval(() => documentsQuery.refetch(), 5000)
    if (!needsPolling && pollTimer) {
      clearInterval(pollTimer)
      pollTimer = null
    }
  },
  { immediate: true },
)

onBeforeUnmount(() => {
  if (pollTimer) clearInterval(pollTimer)
})

function openUpload(): void {
  selectedFiles.value = []
  uploadDialogVisible.value = true
}

function addFiles(files: File[]): void {
  const next = [...selectedFiles.value]
  for (const file of files) {
    const extension = file.name.includes('.') ? `.${file.name.split('.').pop()?.toLowerCase()}` : ''
    if (!ACCEPTED_EXTENSIONS.includes(extension)) {
      ElMessage.warning(`${file.name} 的文件类型不受支持`)
      continue
    }
    if (file.size > MAX_FILE_SIZE) {
      ElMessage.warning(`${file.name} 超过单文件 20 MB 限制`)
      continue
    }
    if (!next.some((item) => item.name === file.name && item.size === file.size)) next.push(file)
  }
  if (next.length > MAX_FILES) {
    ElMessage.warning(`单次最多选择 ${MAX_FILES} 个文件`)
    next.splice(MAX_FILES)
  }
  if (next.reduce((sum, file) => sum + file.size, 0) > MAX_TOTAL_SIZE) {
    ElMessage.warning('单次上传总大小不能超过 100 MB')
    return
  }
  selectedFiles.value = next
}

function handleFileInput(event: Event): void {
  const input = event.target as HTMLInputElement
  addFiles(Array.from(input.files ?? []))
  input.value = ''
}

function handleDrop(event: DragEvent): void {
  dragActive.value = false
  addFiles(Array.from(event.dataTransfer?.files ?? []))
}

async function upload(): Promise<void> {
  if (!selectedKnowledgeBaseId.value || !selectedFiles.value.length) return
  try {
    const batch = await uploadMutation.mutateAsync({
      knowledgeBaseId: selectedKnowledgeBaseId.value,
      files: selectedFiles.value,
    })
    uploadDialogVisible.value = false
    const rejected = batch.rejectedFiles
    ElMessage({
      type: rejected ? 'warning' : 'success',
      message: rejected
        ? `已接收 ${batch.acceptedFiles} 个文件，${rejected} 个文件未通过校验`
        : `已接收 ${batch.acceptedFiles} 个文件并开始自动入库`,
    })
    await queryClient.invalidateQueries({ queryKey: ['documents', selectedKnowledgeBaseId.value] })
  } catch (error) {
    ElMessage.error(getErrorMessage(error))
  }
}

async function removeDocument(item: KnowledgeDocument): Promise<void> {
  try {
    await ElMessageBox.confirm(
      `删除后“${item.originalName}”将退出知识检索，并清理对应存储文件。`,
      '确认删除文档',
      { confirmButtonText: '确认删除', cancelButtonText: '取消', type: 'warning' },
    )
    await deleteMutation.mutateAsync({
      knowledgeBaseId: selectedKnowledgeBaseId.value,
      documentId: item.id,
    })
    ElMessage.success('文档已删除')
    if (documents.value.length === 1 && page.value > 1) page.value -= 1
    await queryClient.invalidateQueries({ queryKey: ['documents', selectedKnowledgeBaseId.value] })
  } catch (error) {
    if (error === 'cancel' || error === 'close') return
    ElMessage.error(getErrorMessage(error))
  }
}

function openMetadata(item: KnowledgeDocument): void {
  activeDocument.value = item
  metadataForm.value = {
    category: item.category ?? '',
    businessDomain: item.businessDomain ?? '',
    tags: [...item.tags],
    sensitivityLevel: item.sensitivityLevel,
    accessMode: item.accessMode,
    versionLabel: item.versionLabel ?? '',
    effectiveAt: toLocalDateTime(item.effectiveAt),
    expiresAt: toLocalDateTime(item.expiresAt),
  }
  metadataDialogVisible.value = true
}

async function openAudienceEvidence(item: KnowledgeDocument): Promise<void> {
  activeDocument.value = item
  const [businessEvidence, approvals] = await Promise.all([
    documentsApi.listDocumentBusinessEvidence(selectedKnowledgeBaseId.value, item.id),
    documentsApi.listDocumentAudienceApprovals(selectedKnowledgeBaseId.value, item.id),
  ])
  businessEvidenceItems.value = businessEvidence
  audienceApprovalItems.value = approvals
  const evidence: DocumentAudienceEvidence | null = item.audienceEvidence
  audienceEvidenceForm.value = evidence
    ? {
        proposedAudienceTag: evidence.proposedAudienceTag,
        businessOwner: evidence.businessOwner,
        businessEvidenceId: evidence.businessEvidenceId ?? '',
        approvalId: evidence.approvalId ?? '',
        businessEvidenceReference: evidence.businessEvidenceReference,
        approvalReference: evidence.approvalReference,
        approvalAt: toLocalDateTime(evidence.approvalAt),
        decision: evidence.decision,
        comment: evidence.comment ?? '',
      }
    : {
        proposedAudienceTag: 'audience:internal-only',
        businessOwner: '',
        businessEvidenceId: '',
        approvalId: '',
        businessEvidenceReference: '',
        approvalReference: '',
        approvalAt: toLocalDateTime(new Date().toISOString()),
        decision: 'APPROVED',
        comment: '',
      }
  audienceEvidenceDialogVisible.value = true
}

async function openAudienceApprovalTodo(documentId: string): Promise<void> {
  const currentPageDocument = documents.value.find((item) => item.id === documentId)
  let targetDocument: KnowledgeDocument
  if (currentPageDocument) {
    targetDocument = currentPageDocument
  } else {
    try {
      targetDocument = await documentsApi.getDocument(selectedKnowledgeBaseId.value, documentId)
    } catch (error) {
      ElMessage.error(getErrorMessage(error))
      return
    }
  }
  audienceApprovalTodoDrawerVisible.value = false
  await openAudienceEvidence(targetDocument)
}

function openBusinessEvidenceCreate(): void {
  businessEvidenceForm.value = { title: '', detailsHtml: '' }
  businessEvidenceAttachments.value = []
  businessEvidenceDialogVisible.value = true
}

function updateBusinessEvidenceHtml(event: Event): void {
  businessEvidenceForm.value.detailsHtml = (event.currentTarget as HTMLElement).innerHTML
}

function businessEvidencePlainText(html: string): string {
  const element = document.createElement('div')
  element.innerHTML = html
  return (element.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 2000)
}

function applyBusinessEvidenceFormat(command: string, value?: string): void {
  businessEvidenceEditor.value?.focus()
  document.execCommand(command, false, value)
  businessEvidenceForm.value.detailsHtml = businessEvidenceEditor.value?.innerHTML ?? ''
}

function addBusinessEvidenceLink(): void {
  void ElMessageBox.prompt('填写以 http:// 或 https:// 开头的可核查地址。', '插入链接', {
    inputPlaceholder: 'https://example.com/review-record',
    inputValidator: (value) =>
      /^https?:\/\//i.test(value.trim()) || '链接必须以 http:// 或 https:// 开头',
  })
    .then(({ value }) => applyBusinessEvidenceFormat('createLink', value.trim()))
    .catch(() => undefined)
}

function handleBusinessEvidenceFiles(event: Event): void {
  const input = event.target as HTMLInputElement
  const next = [...businessEvidenceAttachments.value]
  for (const file of Array.from(input.files ?? [])) {
    const isVideo = file.type.startsWith('video/')
    const maxSize = isVideo ? BUSINESS_EVIDENCE_VIDEO_MAX_SIZE : BUSINESS_EVIDENCE_IMAGE_MAX_SIZE
    if (!BUSINESS_EVIDENCE_ATTACHMENT_TYPES.split(',').includes(file.type)) {
      ElMessage.warning(`${file.name} 不是支持的图片或视频类型`)
      continue
    }
    if (file.size > maxSize) {
      ElMessage.warning(`${file.name} 超过${isVideo ? '视频 100 MB' : '图片 10 MB'}限制`)
      continue
    }
    if (!next.some((item) => item.name === file.name && item.size === file.size)) next.push(file)
  }
  businessEvidenceAttachments.value = next.slice(0, BUSINESS_EVIDENCE_ATTACHMENT_LIMIT)
  if (next.length > BUSINESS_EVIDENCE_ATTACHMENT_LIMIT)
    ElMessage.warning(`每条业务证据最多 ${BUSINESS_EVIDENCE_ATTACHMENT_LIMIT} 个附件`)
  input.value = ''
}

function removeBusinessEvidenceFile(index: number): void {
  businessEvidenceAttachments.value.splice(index, 1)
}

async function openBusinessEvidenceAttachment(
  evidence: DocumentBusinessEvidence,
  attachmentId: string,
): Promise<void> {
  const item = activeDocument.value
  if (!item) return
  const previewWindow = window.open('', '_blank')
  try {
    const blob = await documentsApi.readDocumentBusinessEvidenceAttachment(
      selectedKnowledgeBaseId.value,
      item.id,
      evidence.id,
      attachmentId,
    )
    const url = URL.createObjectURL(blob)
    if (previewWindow) {
      previewWindow.opener = null
      previewWindow.location.href = url
    } else {
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.target = '_blank'
      anchor.rel = 'noopener noreferrer'
      anchor.click()
    }
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
  } catch (error) {
    previewWindow?.close()
    ElMessage.error(getErrorMessage(error))
  }
}

async function createBusinessEvidence(): Promise<void> {
  const item = activeDocument.value
  const title = businessEvidenceForm.value.title.trim()
  const detailsHtml = businessEvidenceForm.value.detailsHtml.trim()
  const details = businessEvidencePlainText(detailsHtml)
  if (!item || !title || !details) {
    ElMessage.warning('请填写业务证据标题和详细内容')
    return
  }
  creatingBusinessEvidence.value = true
  try {
    const evidence = await documentsApi.createDocumentBusinessEvidence(
      selectedKnowledgeBaseId.value,
      item.id,
      { title, details, detailsHtml },
    )
    const uploadedAttachments = []
    let failedAttachments = 0
    for (const file of businessEvidenceAttachments.value) {
      try {
        uploadedAttachments.push(
          await documentsApi.uploadDocumentBusinessEvidenceAttachment(
            selectedKnowledgeBaseId.value,
            item.id,
            evidence.id,
            file,
          ),
        )
      } catch {
        failedAttachments += 1
      }
    }
    evidence.attachments = uploadedAttachments
    businessEvidenceItems.value = [evidence, ...businessEvidenceItems.value]
    audienceEvidenceForm.value.businessEvidenceId = evidence.id
    businessEvidenceDialogVisible.value = false
    if (failedAttachments > 0) {
      ElMessage.warning(
        `业务证据 ${evidence.reference} 已创建，${failedAttachments} 个附件上传失败`,
      )
    } else {
      ElMessage.success(`业务证据 ${evidence.reference} 已创建`)
    }
  } catch (error) {
    ElMessage.error(getErrorMessage(error))
  } finally {
    creatingBusinessEvidence.value = false
  }
}

async function createAudienceApproval(): Promise<void> {
  const item = activeDocument.value
  const evidenceId = audienceEvidenceForm.value.businessEvidenceId
  if (!item || !evidenceId) {
    ElMessage.warning('请先选择业务证据')
    return
  }
  const businessOwner = audienceEvidenceForm.value.businessOwner.trim()
  if (!businessOwner) {
    ElMessage.warning('请先填写业务内容负责人')
    return
  }
  creatingAudienceApproval.value = true
  try {
    const approval = await documentsApi.createDocumentAudienceApproval(
      selectedKnowledgeBaseId.value,
      item.id,
      {
        businessEvidenceId: evidenceId,
        proposedAudienceTag: audienceEvidenceForm.value.proposedAudienceTag,
        businessOwner,
      },
    )
    audienceApprovalItems.value = [approval, ...audienceApprovalItems.value]
    audienceEvidenceForm.value.approvalId = ''
    await audienceApprovalSummaryQuery.refetch()
    ElMessage.success(`审批单 ${approval.reference} 已创建，请由另一名成员审批`)
  } catch (error) {
    ElMessage.error(getErrorMessage(error))
  } finally {
    creatingAudienceApproval.value = false
  }
}

async function decideAudienceApproval(
  item: DocumentAudienceApproval,
  decision: 'APPROVED' | 'REJECTED',
): Promise<void> {
  const document = activeDocument.value
  if (!document) return
  try {
    const result = await ElMessageBox.prompt(
      decision === 'APPROVED' ? '可填写批准说明。' : '请填写驳回原因。',
      decision === 'APPROVED' ? '批准文档审批单' : '驳回文档审批单',
      {
        inputPlaceholder:
          decision === 'APPROVED' ? '例如：确认本版本仅供内部使用' : '填写需要补充或修改的内容',
        inputValidator: (value) =>
          decision === 'APPROVED' || value.trim() ? true : '驳回原因不能为空',
      },
    )
    decidingApprovalId.value = item.id
    const updated = await documentsApi.decideDocumentAudienceApproval(
      selectedKnowledgeBaseId.value,
      document.id,
      item.id,
      decision,
      result.value.trim(),
    )
    audienceApprovalItems.value = audienceApprovalItems.value.map((approval) =>
      approval.id === updated.id ? updated : approval,
    )
    if (decision === 'APPROVED') audienceEvidenceForm.value.approvalId = updated.id
    await audienceApprovalSummaryQuery.refetch()
    ElMessage.success(decision === 'APPROVED' ? '文档审批单已批准' : '文档审批单已驳回')
  } catch (error) {
    if (error === 'cancel' || error === 'close') return
    ElMessage.error(getErrorMessage(error))
  } finally {
    decidingApprovalId.value = ''
  }
}

async function saveAudienceEvidence(): Promise<void> {
  const item = activeDocument.value
  if (!item) return
  const form = audienceEvidenceForm.value
  if (!form.businessOwner.trim()) {
    ElMessage.warning('请填写业务内容负责人')
    return
  }
  if (!form.businessEvidenceId || !form.approvalId) {
    ElMessage.warning('请选择业务证据和已通过的文档审批单')
    return
  }
  try {
    await audienceEvidenceMutation.mutateAsync({
      documentId: item.id,
      input: {
        ...form,
        businessOwner: form.businessOwner.trim(),
        comment: form.comment?.trim() || null,
      },
    })
    audienceEvidenceDialogVisible.value = false
    ElMessage.success('文档受众证据已保存')
    await queryClient.invalidateQueries({ queryKey: ['documents', selectedKnowledgeBaseId.value] })
  } catch (error) {
    ElMessage.error(getErrorMessage(error))
  }
}

function openCandidateGeneration(item: KnowledgeDocument): void {
  void router.push({
    name: 'evaluations',
    query: {
      knowledgeBaseId: selectedKnowledgeBaseId.value,
      candidateDocumentId: item.id,
    },
  })
}

async function saveMetadata(): Promise<void> {
  const item = activeDocument.value
  if (!item) return
  const effectiveAt = toIsoDateTime(metadataForm.value.effectiveAt)
  const expiresAt = toIsoDateTime(metadataForm.value.expiresAt)
  if (effectiveAt && expiresAt && new Date(expiresAt) <= new Date(effectiveAt)) {
    ElMessage.warning('失效时间必须晚于生效时间')
    return
  }
  try {
    await metadataMutation.mutateAsync({
      documentId: item.id,
      input: {
        category: metadataForm.value.category.trim() || null,
        businessDomain: metadataForm.value.businessDomain.trim() || null,
        tags: metadataForm.value.tags
          .map((tag) => tag.trim())
          .filter(Boolean)
          .slice(0, 20),
        sensitivityLevel: metadataForm.value.sensitivityLevel,
        accessMode: metadataForm.value.accessMode,
        versionLabel: metadataForm.value.versionLabel.trim() || null,
        effectiveAt,
        expiresAt,
      },
    })
    metadataDialogVisible.value = false
    ElMessage.success('文档元数据已更新')
    await queryClient.invalidateQueries({ queryKey: ['documents', selectedKnowledgeBaseId.value] })
  } catch (error) {
    ElMessage.error(getErrorMessage(error))
  }
}

function openVersions(item: KnowledgeDocument): void {
  activeDocument.value = item
  versionsDrawerVisible.value = true
}

function openVersionUpload(): void {
  versionFile.value = null
  versionLabel.value = ''
  versionUploadVisible.value = true
}

function handleVersionFile(event: Event): void {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  const extension = file.name.includes('.') ? `.${file.name.split('.').pop()?.toLowerCase()}` : ''
  if (!ACCEPTED_EXTENSIONS.includes(extension) || file.size > MAX_FILE_SIZE) {
    ElMessage.warning('请选择受支持且不超过 20 MB 的文件')
    input.value = ''
    return
  }
  versionFile.value = file
  input.value = ''
}

async function uploadVersion(): Promise<void> {
  if (!activeDocument.value || !versionFile.value) return
  try {
    await versionUploadMutation.mutateAsync({
      documentId: activeDocument.value.id,
      file: versionFile.value,
      label: versionLabel.value,
    })
    versionUploadVisible.value = false
    ElMessage.success('新版本已上传，处理完成后将自动生效')
    await queryClient.invalidateQueries({ queryKey: ['document-versions'] })
    await queryClient.invalidateQueries({ queryKey: ['documents'] })
  } catch (error) {
    ElMessage.error(getErrorMessage(error))
  }
}

async function activateVersion(version: KnowledgeDocument): Promise<void> {
  if (!activeDocument.value) return
  try {
    const preflight = await documentsApi.getDocumentReleasePreflight(
      selectedKnowledgeBaseId.value,
      activeDocument.value.id,
      version.id,
    )
    const blockerLabels: Record<string, string> = {
      DOCUMENT_NOT_READY: '文档尚未完成解析',
      EMBEDDING_NOT_READY: '向量化尚未完成',
      DOCUMENT_NOT_EFFECTIVE: '文档尚未到生效时间',
      DOCUMENT_EXPIRED: '文档已经过期',
      NO_EVALUATION_COVERAGE: '没有评测套件覆盖此版本',
      NO_COMPLETED_EVALUATION: '没有已完成的覆盖性评测',
      EVALUATION_GATE_NOT_PASSED: '最近一次评测门禁未通过',
      EVALUATION_RUN_IS_RETRY: '最近一次评测是局部重试',
      EVALUATION_DATASET_MISMATCH: '评测数据与套件不一致',
    }
    const blockers = preflight.blockerCodes.map((code) => blockerLabels[code] || code)
    const message = blockers.length
      ? `预检发现：${blockers.join('；')}。仍要切换到 ${version.versionLabel || `V${version.version}`}？`
      : `确认切换到 ${version.versionLabel || `V${version.version}`}？当前版本将自动归档。`
    await ElMessageBox.confirm(message, '切换文档版本', {
      confirmButtonText: blockers.length ? '仍然切换' : '确认切换',
      cancelButtonText: '取消',
      type: blockers.length ? 'warning' : 'info',
    })
    await activateVersionMutation.mutateAsync({
      documentId: activeDocument.value.id,
      versionId: version.id,
    })
    ElMessage.success('文档版本已切换')
    await queryClient.invalidateQueries({ queryKey: ['document-versions'] })
    await queryClient.invalidateQueries({ queryKey: ['documents'] })
  } catch (error) {
    if (error === 'cancel' || error === 'close') return
    ElMessage.error(getErrorMessage(error))
  }
}

function canActivateVersion(version: KnowledgeDocument): boolean {
  return (
    version.lifecycleStatus !== 'PUBLISHED' &&
    version.status === 'READY' &&
    version.embeddingStatus === 'READY'
  )
}

function lifecycleLabel(value: KnowledgeDocument['lifecycleStatus']): string {
  return { DRAFT: '草稿处理中', PUBLISHED: '当前生效', ARCHIVED: '历史归档' }[value]
}

function sensitivityLabel(value: KnowledgeDocument['sensitivityLevel']): string {
  return { INTERNAL: '内部', CONFIDENTIAL: '机密', RESTRICTED: '严格受限' }[value]
}

function toLocalDateTime(value: string | null): string {
  if (!value) return ''
  const date = new Date(value)
  const offset = date.getTimezoneOffset() * 60_000
  return new Date(date.getTime() - offset).toISOString().slice(0, 16)
}

function toIsoDateTime(value: string): string | null {
  return value ? new Date(value).toISOString() : null
}

function displayState(item: KnowledgeDocument): {
  key: 'PROCESSING' | 'READY' | 'FAILED'
  label: string
  type: 'primary' | 'success' | 'danger'
  progress: number
} {
  const job = item.ingestionJob
  if (job?.status === 'FAILED' || job?.status === 'CANCELLED' || item.status === 'FAILED') {
    return {
      key: 'FAILED',
      label: job?.status === 'CANCELLED' ? '已取消' : '处理失败',
      type: 'danger',
      progress: job?.progress ?? 0,
    }
  }
  if (
    job?.status === 'SUCCEEDED' ||
    (item.status === 'READY' && item.embeddingStatus === 'READY')
  ) {
    return { key: 'READY', label: '已就绪', type: 'success', progress: 100 }
  }
  const stage = {
    QUEUED: '等待处理',
    PARSING: '正在解析',
    EMBEDDING: '正在向量化',
    COMPLETED: '处理完成',
  }[job?.stage ?? 'QUEUED']
  return { key: 'PROCESSING', label: stage, type: 'primary', progress: job?.progress ?? 0 }
}

function fileKind(item: KnowledgeDocument): string {
  return item.originalName.split('.').pop()?.toUpperCase() || 'FILE'
}

function formatBytes(size: number): string {
  if (size < 1024) return `${size} B`
  if (size < 1024 ** 2) return `${(size / 1024).toFixed(1)} KB`
  return `${(size / 1024 ** 2).toFixed(1)} MB`
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
  <div class="documents-page">
    <section class="documents-hero">
      <div>
        <span class="eyebrow">DOCUMENT PIPELINE</span>
        <h2>文档管理</h2>
        <p>上传后自动完成解析、切片与向量化。支持 TXT、Markdown、PDF、Word 和 Excel。</p>
      </div>
      <el-button
        type="primary"
        :icon="UploadFilled"
        size="large"
        :disabled="!selectedKnowledgeBaseId"
        @click="openUpload"
        >上传文档</el-button
      >
    </section>

    <section v-if="knowledgeBases.length" class="documents-context">
      <div class="context-selector">
        <span>当前知识库</span>
        <el-select v-model="selectedKnowledgeBaseId" filterable aria-label="选择知识库">
          <el-option
            v-for="item in knowledgeBases"
            :key="item.id"
            :label="item.name"
            :value="item.id"
          />
        </el-select>
      </div>
      <div class="context-summary">
        <el-icon><FolderOpened /></el-icon>
        <div>
          <strong>{{ currentKnowledgeBase?.name }}</strong
          ><span>{{ currentKnowledgeBase?.description || '暂无知识库描述' }}</span>
        </div>
      </div>
    </section>

    <el-empty
      v-else-if="!knowledgeBasesQuery.isLoading.value"
      description="请先创建知识库，再上传知识文档"
    >
      <el-button type="primary" :icon="Plus" @click="router.push({ name: 'knowledge-bases' })"
        >创建知识库</el-button
      >
    </el-empty>

    <template v-if="selectedKnowledgeBaseId">
      <section v-if="lifecycleSummaryQuery.data.value" class="document-lifecycle-summary">
        <div class="lifecycle-metric">
          <span>可检索</span><strong>{{ lifecycleSummaryQuery.data.value.ready }}</strong>
        </div>
        <div
          class="lifecycle-metric"
          :class="{ 'is-warning': lifecycleSummaryQuery.data.value.expiringSoon }"
        >
          <span>7 天内到期</span
          ><strong>{{ lifecycleSummaryQuery.data.value.expiringSoon }}</strong>
        </div>
        <div
          class="lifecycle-metric"
          :class="{ 'is-danger': lifecycleSummaryQuery.data.value.expired }"
        >
          <span>已过期</span><strong>{{ lifecycleSummaryQuery.data.value.expired }}</strong>
        </div>
        <div
          class="lifecycle-metric"
          :class="{ 'is-danger': lifecycleSummaryQuery.data.value.failed }"
        >
          <span>处理失败</span><strong>{{ lifecycleSummaryQuery.data.value.failed }}</strong>
        </div>
        <div class="lifecycle-summary-note">
          已发布 {{ lifecycleSummaryQuery.data.value.published }} 份 · 无预设期限
          {{ lifecycleSummaryQuery.data.value.withoutExpiry }} 份
        </div>
      </section>
      <section v-if="audienceApprovalSummaryQuery.data.value" class="document-approval-summary">
        <div>
          <el-icon><Tickets /></el-icon>
          <span>文档受众审批待办</span>
        </div>
        <strong>{{ audienceApprovalSummaryQuery.data.value.actionable }}</strong>
        <small
          >可由当前账号处理 · 共
          {{ audienceApprovalSummaryQuery.data.value.pending }} 条待审批</small
        >
        <el-button
          v-if="audienceApprovalSummaryQuery.data.value.actionable > 0"
          link
          type="primary"
          @click="audienceApprovalTodoDrawerVisible = true"
          >查看待办</el-button
        >
      </section>
      <section class="documents-toolbar">
        <div class="documents-search">
          <el-input
            v-model="search"
            :prefix-icon="Search"
            clearable
            placeholder="搜索当前页文件名"
          />
          <el-select
            v-model="statusFilter"
            class="document-status-filter"
            aria-label="处理状态筛选"
          >
            <el-option label="全部状态" value="ALL" /><el-option
              label="处理中"
              value="PROCESSING"
            /><el-option label="已就绪" value="READY" /><el-option label="失败" value="FAILED" />
          </el-select>
          <el-select
            v-model="audienceFilter"
            class="document-status-filter"
            aria-label="受众证据筛选"
          >
            <el-option label="全部受众证据" value="ALL" />
            <el-option :label="`未确认 (${audienceCounts.unconfirmed})`" value="UNCONFIRMED" />
            <el-option :label="`已批准 (${audienceCounts.approved})`" value="APPROVED" />
            <el-option :label="`已驳回 (${audienceCounts.rejected})`" value="REJECTED" />
          </el-select>
        </div>
        <div class="toolbar-meta">
          <span>共 {{ meta?.total ?? 0 }} 份文档</span
          ><el-button
            :icon="Refresh"
            circle
            aria-label="刷新"
            :loading="documentsQuery.isFetching.value"
            @click="documentsQuery.refetch()"
          />
        </div>
      </section>

      <section v-loading="documentsQuery.isLoading.value" class="documents-panel">
        <el-alert
          v-if="documentsQuery.isError.value"
          title="文档加载失败"
          :description="getErrorMessage(documentsQuery.error.value)"
          type="error"
          show-icon
          :closable="false"
          ><template #default
            ><el-button size="small" @click="documentsQuery.refetch()"
              >重新加载</el-button
            ></template
          ></el-alert
        >
        <el-empty
          v-else-if="!documentsQuery.isLoading.value && filteredDocuments.length === 0"
          :description="documents.length ? '当前筛选条件下没有文档' : '这个知识库还没有文档'"
        >
          <el-button
            v-if="!documents.length"
            type="primary"
            :icon="UploadFilled"
            @click="openUpload"
            >上传第一份文档</el-button
          >
        </el-empty>
        <div v-else class="document-list">
          <article v-for="item in filteredDocuments" :key="item.id" class="document-row">
            <div class="document-type">
              <el-icon><DocumentIcon /></el-icon><span>{{ fileKind(item) }}</span>
            </div>
            <div class="document-primary">
              <strong>{{ item.originalName }}</strong
              ><span
                >{{ formatBytes(item.sizeBytes) }} · 版本
                {{ item.versionLabel || `V${item.version}` }} ·
                {{ formatDate(item.createdAt) }}</span
              >
            </div>
            <div class="document-metadata">
              <span>{{ item.category || '未分类' }}</span
              ><span v-if="item.chunkCount">{{ item.chunkCount }} 个切片</span
              ><span v-if="item.pageCount">{{ item.pageCount }} 页</span
              ><el-tag
                :type="
                  item.audienceEvidence
                    ? item.audienceEvidence.decision === 'APPROVED'
                      ? 'success'
                      : 'danger'
                    : 'warning'
                "
                size="small"
                effect="light"
              >
                {{
                  item.audienceEvidence
                    ? item.audienceEvidence.proposedAudienceTag === 'audience:customer-citable'
                      ? '客服可引用'
                      : '仅内部'
                    : '受众未确认'
                }}
              </el-tag>
            </div>
            <div class="document-state">
              <el-tag :type="displayState(item).type" effect="light"
                ><el-icon
                  ><component
                    :is="
                      displayState(item).key === 'READY'
                        ? CircleCheck
                        : displayState(item).key === 'FAILED'
                          ? Warning
                          : Refresh
                    " /></el-icon
                >{{ displayState(item).label }}</el-tag
              >
              <el-progress
                v-if="displayState(item).key === 'PROCESSING'"
                :percentage="displayState(item).progress"
                :show-text="false"
                :stroke-width="4"
              />
              <small v-if="displayState(item).key === 'FAILED'">{{
                getErrorCodeMessage(
                  item.ingestionJob?.lastErrorCode || item.errorCode || item.embeddingErrorCode,
                  '文档处理失败，请在处理任务中重试',
                )
              }}</small>
            </div>
            <div class="document-row-actions">
              <el-button
                v-if="
                  item.status === 'READY' &&
                  item.embeddingStatus === 'READY' &&
                  item.lifecycleStatus === 'PUBLISHED'
                "
                link
                :icon="MagicStick"
                @click="openCandidateGeneration(item)"
                >生成评测题</el-button
              >
              <el-button link :icon="EditPen" @click="openMetadata(item)">元数据</el-button>
              <el-button link :icon="QuestionFilled" @click="openAudienceEvidence(item)"
                >受众证据</el-button
              >
              <el-button link :icon="Files" @click="openVersions(item)">版本</el-button>
              <el-dropdown trigger="click"
                ><el-button link>更多</el-button
                ><template #dropdown
                  ><el-dropdown-menu
                    ><el-dropdown-item
                      :icon="Delete"
                      class="danger-item"
                      @click="removeDocument(item)"
                      >删除</el-dropdown-item
                    ></el-dropdown-menu
                  ></template
                ></el-dropdown
              >
            </div>
          </article>
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
    </template>

    <el-dialog
      v-model="uploadDialogVisible"
      title="上传知识文档"
      width="min(650px, 92vw)"
      destroy-on-close
    >
      <div class="upload-context">
        <span>上传至</span><strong>{{ currentKnowledgeBase?.name }}</strong>
      </div>
      <el-alert
        class="document-upload-help"
        title="上传限制与处理规则"
        description="支持 TXT、Markdown、PDF、Word 和 Excel；单文件不超过 20 MB，每批最多 20 个文件且总大小不超过 100 MB。上传成功后由后台自动解析、切片和向量化，处理完成前不会参与问答。"
        type="info"
        show-icon
        :closable="false"
      />
      <input
        ref="fileInput"
        class="visually-hidden"
        type="file"
        multiple
        :accept="ACCEPTED_FILE_TYPES"
        @change="handleFileInput"
      />
      <button
        class="upload-dropzone"
        :class="{ active: dragActive }"
        type="button"
        @click="fileInput?.click()"
        @dragover.prevent="dragActive = true"
        @dragleave.prevent="dragActive = false"
        @drop.prevent="handleDrop"
      >
        <el-icon><UploadFilled /></el-icon><strong>拖放文件到这里，或点击选择文件</strong
        ><span
          >支持 TXT、MD、PDF、DOCX、XLSX · 单文件 ≤ 20 MB · 每批 ≤ 20 个 · 总大小 ≤ 100 MB</span
        >
      </button>
      <div v-if="selectedFiles.length" class="selected-files">
        <div class="selected-files-title">
          <strong>已选择 {{ selectedFiles.length }} 个文件</strong
          ><span>共 {{ formatBytes(selectedTotalSize) }}</span>
        </div>
        <ul>
          <li v-for="(file, index) in selectedFiles" :key="`${file.name}-${file.size}`">
            <span
              ><el-icon><DocumentIcon /></el-icon>{{ file.name }}</span
            ><small>{{ formatBytes(file.size) }}</small
            ><button type="button" aria-label="移除文件" @click="selectedFiles.splice(index, 1)">
              <el-icon><CloseBold /></el-icon>
            </button>
          </li>
        </ul>
      </div>
      <template #footer
        ><el-button @click="uploadDialogVisible = false">取消</el-button
        ><el-button
          type="primary"
          :disabled="!selectedFiles.length"
          :loading="uploadMutation.isPending.value"
          @click="upload"
          >上传并自动入库</el-button
        ></template
      >
    </el-dialog>

    <el-dialog v-model="metadataDialogVisible" title="编辑文档元数据" width="min(650px, 92vw)">
      <div v-if="activeDocument" class="metadata-document-head">
        <el-icon><DocumentIcon /></el-icon>
        <div>
          <strong>{{ activeDocument.originalName }}</strong
          ><span
            >{{ lifecycleLabel(activeDocument.lifecycleStatus) }} · V{{
              activeDocument.version
            }}</span
          >
        </div>
      </div>
      <el-form :model="metadataForm" label-position="top">
        <div class="metadata-form-grid">
          <el-form-item
            ><template #label
              >分类
              <el-tooltip
                content="用于按制度、产品、操作手册等业务类别筛选和识别文档，不影响原文内容。"
                ><el-icon><QuestionFilled /></el-icon></el-tooltip></template
            ><el-input v-model="metadataForm.category" maxlength="100" placeholder="例如：内部制度"
          /></el-form-item>
          <el-form-item
            ><template #label
              >业务领域
              <el-tooltip
                content="填写文档归属的业务范围，例如人力资源、采购或售后，便于管理和后续质量分析。"
                ><el-icon><QuestionFilled /></el-icon></el-tooltip></template
            ><el-input
              v-model="metadataForm.businessDomain"
              maxlength="100"
              placeholder="例如：人力资源"
          /></el-form-item>
          <el-form-item
            ><template #label
              >敏感等级
              <el-tooltip
                content="控制文档的敏感标记。内部、机密、严格受限会影响管理员识别和授权策略，请按文档内容选择。"
                ><el-icon><QuestionFilled /></el-icon></el-tooltip></template
            ><el-select v-model="metadataForm.sensitivityLevel" class="form-full-width"
              ><el-option label="内部" value="INTERNAL" /><el-option
                label="机密"
                value="CONFIDENTIAL" /><el-option label="严格受限" value="RESTRICTED" /></el-select
          ></el-form-item>
          <el-form-item
            ><template #label
              >访问模式
              <el-tooltip
                content="继承知识库权限表示沿用知识库授权；单独配置权限表示该文档需要额外授权。"
                ><el-icon><QuestionFilled /></el-icon></el-tooltip></template
            ><el-select v-model="metadataForm.accessMode" class="form-full-width"
              ><el-option label="继承知识库权限" value="INHERIT" /><el-option
                label="单独配置权限"
                value="RESTRICTED" /></el-select
          ></el-form-item>
          <el-form-item
            ><template #label
              >版本标签
              <el-tooltip
                content="给当前文档版本起一个容易识别的名称，例如 2026 年正式版；不会改变系统内部版本号。"
                ><el-icon><QuestionFilled /></el-icon></el-tooltip></template
            ><el-input
              v-model="metadataForm.versionLabel"
              maxlength="50"
              placeholder="例如：2026 年正式版"
          /></el-form-item>
          <el-form-item
            ><template #label
              >标签
              <el-tooltip content="可添加多个关键词，用于后续筛选和管理；每个文档最多 20 个标签。"
                ><el-icon><QuestionFilled /></el-icon></el-tooltip></template
            ><el-select
              v-model="metadataForm.tags"
              multiple
              filterable
              allow-create
              default-first-option
              class="form-full-width"
              :multiple-limit="20"
              placeholder="输入后按回车添加，最多 20 个"
          /></el-form-item>
          <el-form-item
            ><template #label
              >生效时间
              <el-tooltip content="填写后可标记文档从何时开始有效；留空表示立即有效。"
                ><el-icon><QuestionFilled /></el-icon></el-tooltip></template
            ><el-date-picker
              v-model="metadataForm.effectiveAt"
              type="datetime"
              value-format="YYYY-MM-DDTHH:mm"
              class="form-full-width"
              clearable
          /></el-form-item>
          <el-form-item
            ><template #label
              >失效时间
              <el-tooltip
                content="填写后可标记文档何时失效；失效时间必须晚于生效时间，留空表示没有预设失效日期。"
                ><el-icon><QuestionFilled /></el-icon></el-tooltip></template
            ><el-date-picker
              v-model="metadataForm.expiresAt"
              type="datetime"
              value-format="YYYY-MM-DDTHH:mm"
              class="form-full-width"
              clearable
          /></el-form-item>
        </div>
      </el-form>
      <template #footer
        ><el-button @click="metadataDialogVisible = false">取消</el-button
        ><el-button type="primary" :loading="metadataMutation.isPending.value" @click="saveMetadata"
          >保存元数据</el-button
        ></template
      >
    </el-dialog>

    <el-dialog
      v-model="audienceEvidenceDialogVisible"
      title="填写文档受众证据"
      width="min(650px, 92vw)"
    >
      <div v-if="activeDocument" class="metadata-document-head">
        <el-icon><DocumentIcon /></el-icon>
        <div>
          <strong>{{ activeDocument.originalName }}</strong>
          <span
            >当前版本 V{{ activeDocument.version }} · SHA-256
            {{ activeDocument.checksumSha256.slice(0, 12) }}…</span
          >
        </div>
      </div>
      <el-alert
        title="系统内填写，不需要编辑 JSON"
        description="受众判断会绑定当前文档版本并写入审计。保存后不会自动启用客服白名单，仍需完成全部文档预检和评测门禁。"
        type="info"
        show-icon
        :closable="false"
      />
      <el-form :model="audienceEvidenceForm" label-position="top" class="audience-evidence-form">
        <el-form-item label="受众范围" required>
          <el-radio-group v-model="audienceEvidenceForm.proposedAudienceTag">
            <el-radio value="audience:customer-citable">客服可引用</el-radio>
            <el-radio value="audience:internal-only">仅内部使用</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="业务内容负责人" required>
          <el-input
            v-model="audienceEvidenceForm.businessOwner"
            maxlength="200"
            placeholder="填写实际业务负责人姓名或账号"
          />
        </el-form-item>
        <el-form-item label="业务证据" required>
          <div class="audience-record-row">
            <el-select
              v-model="audienceEvidenceForm.businessEvidenceId"
              class="form-full-width"
              placeholder="选择系统中的业务证据"
            >
              <el-option
                v-for="item in businessEvidenceItems"
                :key="item.id"
                :label="`${item.reference} · ${item.title}`"
                :value="item.id"
              />
            </el-select>
            <el-button :icon="Plus" @click="openBusinessEvidenceCreate">新建</el-button>
          </div>
          <small class="form-help"
            >业务证据用于说明为什么这份文档属于该受众范围，系统会自动带出证据编号。</small
          >
          <div v-if="selectedBusinessEvidence" class="selected-record-detail">
            <strong>{{ selectedBusinessEvidence.title }}</strong>
            <div
              class="business-evidence-rich-preview"
              v-html="selectedBusinessEvidence.detailsHtml"
            ></div>
            <div
              v-if="selectedBusinessEvidence.attachments.length"
              class="business-evidence-attachment-links"
            >
              <el-button
                v-for="attachment in selectedBusinessEvidence.attachments"
                :key="attachment.id"
                link
                type="primary"
                :icon="attachment.mimeType.startsWith('video/') ? VideoCamera : Picture"
                @click="openBusinessEvidenceAttachment(selectedBusinessEvidence, attachment.id)"
                >{{ attachment.originalName }}</el-button
              >
            </div>
          </div>
        </el-form-item>
        <el-form-item label="文档级审批单" required>
          <div class="audience-record-row">
            <el-select
              v-model="audienceEvidenceForm.approvalId"
              class="form-full-width"
              placeholder="选择已通过的文档审批单"
            >
              <el-option
                v-for="item in compatibleApprovedAudienceApprovals"
                :key="item.id"
                :label="`${item.reference} · 已通过`"
                :value="item.id"
              />
            </el-select>
            <el-button
              :icon="Plus"
              :loading="creatingAudienceApproval"
              :disabled="
                !audienceEvidenceForm.businessEvidenceId ||
                !audienceEvidenceForm.businessOwner.trim()
              "
              @click="createAudienceApproval"
              >创建审批单</el-button
            >
          </div>
          <small class="form-help"
            >审批单会冻结当前文档版本、业务证据、受众范围和负责人；发起人不能审批自己的审批单。</small
          >
          <div
            v-for="item in audienceApprovalItems.filter(
              (approval) => approval.status === 'PENDING',
            )"
            :key="item.id"
            class="approval-inline-item"
          >
            <div>
              <strong>{{ item.reference }} · 待审批</strong>
              <span
                >{{
                  item.proposedAudienceTag === 'audience:customer-citable'
                    ? '客服可引用'
                    : '仅内部使用'
                }}
                · {{ item.businessOwner }}</span
              >
            </div>
            <div v-if="item.createdByUser.id !== currentUserId">
              <el-button
                size="small"
                type="success"
                :loading="decidingApprovalId === item.id"
                @click="decideAudienceApproval(item, 'APPROVED')"
                >批准</el-button
              ><el-button
                size="small"
                type="danger"
                plain
                :disabled="Boolean(decidingApprovalId)"
                @click="decideAudienceApproval(item, 'REJECTED')"
                >驳回</el-button
              >
            </div>
            <el-tag v-else type="info" effect="plain">等待其他成员审批</el-tag>
          </div>
        </el-form-item>
        <el-form-item label="补充说明">
          <el-input
            v-model="audienceEvidenceForm.comment"
            type="textarea"
            :rows="3"
            maxlength="1000"
            show-word-limit
            placeholder="可填写受众判断边界、例外或后续动作"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="audienceEvidenceDialogVisible = false">取消</el-button>
        <el-button
          type="primary"
          :loading="audienceEvidenceMutation.isPending.value"
          :disabled="!audienceEvidenceForm.businessEvidenceId || !audienceEvidenceForm.approvalId"
          @click="saveAudienceEvidence"
          >保存受众证据</el-button
        >
      </template>
    </el-dialog>

    <el-dialog
      v-model="businessEvidenceDialogVisible"
      title="新建业务证据"
      width="min(680px, 94vw)"
      append-to-body
    >
      <el-alert
        title="填写可核查的业务事实"
        description="写明事实、时间、参与人和结论；图片或视频用于辅助核查，不能替代业务负责人和审批人的判断。"
        type="info"
        show-icon
        :closable="false"
      />
      <el-form :model="businessEvidenceForm" label-position="top" class="business-evidence-form">
        <el-form-item label="证据标题" required>
          <el-input
            v-model="businessEvidenceForm.title"
            maxlength="200"
            show-word-limit
            placeholder="例如：AI Backend 运维手册评审结论"
          />
        </el-form-item>
        <el-form-item label="证据内容" required>
          <div class="business-evidence-editor-shell">
            <div class="business-evidence-toolbar" aria-label="富文本工具栏">
              <el-tooltip content="加粗"
                ><el-button text class="editor-command" @click="applyBusinessEvidenceFormat('bold')"
                  ><strong>B</strong></el-button
                ></el-tooltip
              >
              <el-tooltip content="斜体"
                ><el-button
                  text
                  class="editor-command"
                  @click="applyBusinessEvidenceFormat('italic')"
                  ><em>I</em></el-button
                ></el-tooltip
              >
              <el-tooltip content="下划线"
                ><el-button
                  text
                  class="editor-command"
                  @click="applyBusinessEvidenceFormat('underline')"
                  ><u>U</u></el-button
                ></el-tooltip
              >
              <el-tooltip content="无序列表"
                ><el-button
                  text
                  class="editor-command"
                  @click="applyBusinessEvidenceFormat('insertUnorderedList')"
                  >• 列表</el-button
                ></el-tooltip
              >
              <el-tooltip content="有序列表"
                ><el-button
                  text
                  class="editor-command"
                  @click="applyBusinessEvidenceFormat('insertOrderedList')"
                  >1. 列表</el-button
                ></el-tooltip
              >
              <el-tooltip content="插入外部核查链接"
                ><el-button text :icon="Link" @click="addBusinessEvidenceLink"
              /></el-tooltip>
            </div>
            <div
              ref="businessEvidenceEditor"
              class="business-evidence-editor"
              contenteditable="true"
              data-placeholder="例如：2026-09-02 运维评审确认，该手册包含内部网络、部署和排障信息，仅供企业内部运维成员使用。"
              @input="updateBusinessEvidenceHtml"
            ></div>
          </div>
          <small class="form-help"
            >支持加粗、斜体、下划线、列表和外部链接；服务端会移除脚本、样式和嵌入内容。</small
          >
        </el-form-item>
        <el-form-item label="图片或视频附件">
          <input
            ref="businessEvidenceFileInput"
            type="file"
            hidden
            multiple
            :accept="BUSINESS_EVIDENCE_ATTACHMENT_TYPES"
            @change="handleBusinessEvidenceFiles"
          />
          <div class="business-evidence-upload-row">
            <el-button
              :icon="UploadFilled"
              :disabled="businessEvidenceAttachments.length >= BUSINESS_EVIDENCE_ATTACHMENT_LIMIT"
              @click="businessEvidenceFileInput?.click()"
              >选择附件</el-button
            >
            <small>最多 5 个；图片每个 10 MB，视频每个 100 MB。禁止 SVG 和可执行文件。</small>
          </div>
          <div v-if="businessEvidenceAttachments.length" class="business-evidence-pending-files">
            <div
              v-for="(file, index) in businessEvidenceAttachments"
              :key="`${file.name}-${file.size}`"
            >
              <el-icon
                ><VideoCamera v-if="file.type.startsWith('video/')" /><Picture v-else
              /></el-icon>
              <span>{{ file.name }}</span>
              <small>{{ formatBytes(file.size) }}</small>
              <el-button
                link
                type="danger"
                :icon="Delete"
                aria-label="移除附件"
                @click="removeBusinessEvidenceFile(index)"
              />
            </div>
          </div>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="businessEvidenceDialogVisible = false">取消</el-button>
        <el-button
          type="primary"
          :loading="creatingBusinessEvidence"
          :disabled="
            !businessEvidenceForm.title.trim() ||
            !businessEvidencePlainText(businessEvidenceForm.detailsHtml)
          "
          @click="createBusinessEvidence"
          >创建并选中</el-button
        >
      </template>
    </el-dialog>

    <el-drawer
      v-model="audienceApprovalTodoDrawerVisible"
      title="我的文档审批待办"
      size="min(720px, 96vw)"
      class="document-approval-todo-drawer"
    >
      <el-alert
        title="待办来自实时审批状态"
        description="只显示当前账号有文档管理权限、且不是本人发起的待审批记录。等待满 24 小时会标记为超时，但不会自动批准或驳回。"
        type="info"
        show-icon
        :closable="false"
      />
      <div class="document-approval-todo-summary">
        <span>可处理 {{ audienceApprovalSummaryQuery.data.value?.actionable ?? 0 }} 条</span>
        <el-tag v-if="audienceApprovalSummaryQuery.data.value?.overdue" type="danger" effect="plain"
          >超时 {{ audienceApprovalSummaryQuery.data.value.overdue }} 条</el-tag
        >
        <el-button link :icon="Refresh" @click="audienceApprovalSummaryQuery.refetch()"
          >刷新</el-button
        >
      </div>
      <el-empty
        v-if="!audienceApprovalSummaryQuery.data.value?.items.length"
        description="当前没有可处理的文档审批待办"
      />
      <div v-else class="document-approval-todo-list">
        <article
          v-for="todo in audienceApprovalSummaryQuery.data.value.items"
          :key="todo.approvalId"
          class="document-approval-todo-item"
          :class="{ 'is-overdue': todo.overdue }"
        >
          <div class="document-approval-todo-head">
            <div>
              <strong>{{ todo.documentName }}</strong>
              <span>{{ todo.reference }} · V{{ todo.documentVersion }}</span>
            </div>
            <el-tag :type="todo.overdue ? 'danger' : 'warning'" effect="plain">
              {{ todo.overdue ? `已等待 ${todo.ageHours} 小时` : `等待 ${todo.ageHours} 小时` }}
            </el-tag>
          </div>
          <dl>
            <div>
              <dt>受众范围</dt>
              <dd>
                {{
                  todo.proposedAudienceTag === 'audience:customer-citable'
                    ? '客服可引用'
                    : '仅内部使用'
                }}
              </dd>
            </div>
            <div>
              <dt>业务负责人</dt>
              <dd>{{ todo.businessOwner }}</dd>
            </div>
            <div>
              <dt>业务证据</dt>
              <dd>{{ todo.businessEvidenceReference }} · {{ todo.businessEvidenceTitle }}</dd>
            </div>
            <div>
              <dt>发起人</dt>
              <dd>{{ todo.createdByDisplayName }}</dd>
            </div>
          </dl>
          <div class="document-approval-todo-actions">
            <small>发起于 {{ formatDate(todo.createdAt) }}</small>
            <el-button
              type="primary"
              size="small"
              @click="openAudienceApprovalTodo(todo.documentId)"
              >立即处理</el-button
            >
          </div>
        </article>
      </div>
      <el-alert
        v-if="audienceApprovalSummaryQuery.data.value?.truncated"
        title="待办超过 50 条，当前只显示等待时间最长的 50 条"
        type="warning"
        show-icon
        :closable="false"
      />
    </el-drawer>

    <el-drawer v-model="versionsDrawerVisible" title="文档版本" size="min(720px, 96vw)">
      <div class="version-drawer-head">
        <div>
          <strong>{{ activeDocument?.originalName }}</strong
          ><span>版本系列 {{ versionsQuery.data.value?.versionSeriesId.slice(0, 8) || '—' }}</span>
        </div>
        <el-button
          type="primary"
          :icon="UploadFilled"
          :disabled="activeDocument?.lifecycleStatus !== 'PUBLISHED'"
          @click="openVersionUpload"
          >上传替换版本</el-button
        >
      </div>
      <el-alert
        title="新版本完成解析和向量化后会自动生效；切换历史版本时，当前生效版本自动归档。"
        description="替换文件必须使用受支持的格式且不超过 20 MB。上传期间旧版本继续提供问答，只有新版本处理完成后才会切换。"
        type="info"
        show-icon
        :closable="false"
      />
      <div v-loading="versionsQuery.isLoading.value" class="version-timeline">
        <el-empty
          v-if="!versionsQuery.isLoading.value && !versionsQuery.data.value?.items.length"
          description="暂无版本记录"
        />
        <article
          v-for="version in versionsQuery.data.value?.items ?? []"
          :key="version.id"
          :class="{ current: version.id === versionsQuery.data.value?.currentDocumentId }"
        >
          <div class="version-rail"><span></span></div>
          <div class="version-content">
            <header>
              <div>
                <strong>{{ version.versionLabel || `V${version.version}` }}</strong
                ><el-tag
                  :type="
                    version.lifecycleStatus === 'PUBLISHED'
                      ? 'success'
                      : version.lifecycleStatus === 'DRAFT'
                        ? 'primary'
                        : 'info'
                  "
                  effect="light"
                  >{{ lifecycleLabel(version.lifecycleStatus) }}</el-tag
                >
              </div>
              <span>{{ formatDate(version.createdAt) }}</span>
            </header>
            <p>{{ version.originalName }} · {{ formatBytes(version.sizeBytes) }}</p>
            <div class="version-facts">
              <span>{{ sensitivityLabel(version.sensitivityLevel) }}</span
              ><span>{{ version.chunkCount }} 个切片</span
              ><span>{{ displayState(version).label }}</span>
            </div>
            <footer>
              <el-button
                v-if="canActivateVersion(version)"
                type="primary"
                link
                :loading="activateVersionMutation.isPending.value"
                @click="activateVersion(version)"
                >切换为当前版本</el-button
              ><span
                v-else-if="
                  version.lifecycleStatus !== 'PUBLISHED' &&
                  (version.status !== 'READY' || version.embeddingStatus !== 'READY')
                "
                >处理完成后才可切换</span
              >
            </footer>
          </div>
        </article>
      </div>
    </el-drawer>

    <el-dialog v-model="versionUploadVisible" title="上传替换版本" width="min(540px, 92vw)">
      <el-form label-position="top"
        ><el-form-item
          ><template #label
            >版本标签
            <el-tooltip
              content="可选的人工识别名称，例如 2026.2；用于区分版本，不会直接决定哪个版本生效。"
              ><el-icon><QuestionFilled /></el-icon></el-tooltip></template
          ><el-input
            v-model="versionLabel"
            maxlength="50"
            placeholder="可选，例如：2026.2" /></el-form-item
        ><el-form-item
          ><template #label
            >版本文件
            <el-tooltip content="上传后会创建新的草稿版本并进入后台处理；处理成功后可作为当前版本。"
              ><el-icon><QuestionFilled /></el-icon></el-tooltip></template
          ><input
            ref="versionFileInput"
            class="visually-hidden"
            type="file"
            :accept="ACCEPTED_FILE_TYPES"
            @change="handleVersionFile"
          /><button type="button" class="version-file-picker" @click="versionFileInput?.click()">
            <el-icon><UploadFilled /></el-icon><span>{{ versionFile?.name || '选择替换文件' }}</span
            ><small>{{
              versionFile ? formatBytes(versionFile.size) : '支持 TXT、MD、PDF、DOCX、XLSX'
            }}</small>
          </button></el-form-item
        ></el-form
      >
      <template #footer
        ><el-button @click="versionUploadVisible = false">取消</el-button
        ><el-button
          type="primary"
          :disabled="!versionFile"
          :loading="versionUploadMutation.isPending.value"
          @click="uploadVersion"
          >上传并处理</el-button
        ></template
      >
    </el-dialog>
  </div>
</template>
