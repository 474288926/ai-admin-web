import type { ConversationMessage } from '@/types/assistant'

export interface TicketEscalationDraft {
  schemaVersion: '1.0'
  subject: string
  customerQuestion: string
  suggestedReply: string
  internalTroubleshooting: string[]
  escalationConditions: string[]
  missingInformation: string[]
  prohibitedCommitments: string[]
  evidence: Array<{ sourceId: string; documentName: string }>
  assistantMessageId: string
}

export function buildTicketEscalationDraft(input: {
  assistantMessage: ConversationMessage
  customerQuestion: string
  ticketId?: string
  productName?: string
}): TicketEscalationDraft | null {
  const structured = input.assistantMessage.structuredResponse
  if (
    input.assistantMessage.role !== 'ASSISTANT' ||
    input.assistantMessage.status !== 'COMPLETED' ||
    !structured
  ) {
    return null
  }
  const question = normalize(input.customerQuestion, 4000)
  if (!question) return null
  const ticketId = normalize(input.ticketId, 100)
  const customerService = structured.customerService
  const subjectParts = [
    ticketId ? `[${ticketId}]` : '[知识辅助升级]',
    input.productName ? normalize(input.productName, 80) : '',
    question,
  ].filter(Boolean)

  return {
    schemaVersion: '1.0',
    subject: normalize(subjectParts.join(' '), 160),
    customerQuestion: question,
    suggestedReply: normalize(customerService?.customerFacingReply ?? structured.answer, 5000),
    internalTroubleshooting: normalizeList(
      customerService?.internalTroubleshooting ?? structured.steps,
      20,
      500,
    ),
    escalationConditions: normalizeList(customerService?.escalationConditions ?? [], 20, 500),
    missingInformation: normalizeList(structured.missingInformation, 20, 500),
    prohibitedCommitments: normalizeList(customerService?.prohibitedCommitments ?? [], 20, 500),
    evidence: (input.assistantMessage.citations ?? []).slice(0, 20).map((item) => ({
      sourceId: normalize(item.sourceId, 100),
      documentName: normalize(item.documentName, 255),
    })),
    assistantMessageId: input.assistantMessage.id,
  }
}

export function formatTicketEscalationDraft(draft: TicketEscalationDraft): string {
  const sections = [
    `主题：${draft.subject}`,
    `客户问题：\n${draft.customerQuestion}`,
    `建议对客回复：\n${draft.suggestedReply || '待补充'}`,
    formatSection('内部排查', draft.internalTroubleshooting),
    formatSection('升级条件', draft.escalationConditions),
    formatSection('仍需确认', draft.missingInformation),
    formatSection('禁止承诺', draft.prohibitedCommitments),
    formatSection(
      '知识依据',
      draft.evidence.map((item) => `${item.sourceId} · ${item.documentName}`),
    ),
    `知识助手消息 ID：${draft.assistantMessageId}`,
  ].filter(Boolean)

  return sections.join('\n\n')
}

export function parseTicketSystemUrl(
  configured: string | undefined,
  currentOrigin: string,
): string | null {
  if (!configured?.trim()) return null
  try {
    const url = new URL(configured.trim())
    const origin = new URL(currentOrigin)
    const localHttp =
      url.protocol === 'http:' &&
      ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) &&
      ['localhost', '127.0.0.1', '[::1]'].includes(origin.hostname)
    if ((url.protocol !== 'https:' && !localHttp) || url.username || url.password || url.hash) {
      return null
    }
    return url.toString()
  } catch {
    return null
  }
}

export function openTicketSystem(url: string): void {
  const link = document.createElement('a')
  link.href = url
  link.target = '_blank'
  link.rel = 'noopener noreferrer'
  link.click()
}

function normalize(value: string | undefined | null, maxLength: number): string {
  return (value ?? '').trim().slice(0, maxLength)
}

function normalizeList(values: string[], maxItems: number, maxLength: number): string[] {
  return [...new Set(values.map((item) => normalize(item, maxLength)).filter(Boolean))].slice(
    0,
    maxItems,
  )
}

function formatSection(title: string, items: string[]): string {
  return items.length ? `${title}：\n${items.map((item) => `- ${item}`).join('\n')}` : ''
}
