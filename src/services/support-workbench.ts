export const SUPPORT_WORKBENCH_PROTOCOL = 'knowledge-assistant.support.v1' as const

export interface SupportTicketContext {
  requestId: string
  ticketId: string
  customerQuestion: string
  productName?: string
  issueSummary?: string
}

export interface SupportWorkbenchMessage {
  protocol: typeof SUPPORT_WORKBENCH_PROTOCOL
  type: 'SET_CONTEXT' | 'PING'
  payload?: unknown
}

export function parseTrustedWorkbenchOrigins(
  configured: string | undefined,
  currentOrigin: string,
): string[] {
  const candidates =
    configured
      ?.split(',')
      .map((item) => item.trim())
      .filter(Boolean) ?? []
  const origins = candidates.length > 0 ? candidates : [currentOrigin]

  return [
    ...new Set(
      origins.flatMap((value) => {
        try {
          const url = new URL(value)
          return ['http:', 'https:'].includes(url.protocol) && url.origin === value ? [value] : []
        } catch {
          return []
        }
      }),
    ),
  ]
}

export function isTrustedWorkbenchOrigin(origin: string, trustedOrigins: string[]): boolean {
  return trustedOrigins.includes(origin)
}

export function parseSupportTicketContext(value: unknown): SupportTicketContext | null {
  if (!isRecord(value)) return null
  const requestId = normalizeRequired(value.requestId, 100)
  const ticketId = normalizeRequired(value.ticketId, 100)
  const customerQuestion = normalizeRequired(value.customerQuestion, 4000)
  const productName = normalizeOptional(value.productName, 200)
  const issueSummary = normalizeOptional(value.issueSummary, 2000)

  if (!requestId || !ticketId || !customerQuestion) return null
  return {
    requestId,
    ticketId,
    customerQuestion,
    ...(productName ? { productName } : {}),
    ...(issueSummary ? { issueSummary } : {}),
  }
}

export function buildSupportQuestion(context: SupportTicketContext): string {
  return [
    `工单编号：${context.ticketId}`,
    context.productName ? `涉及产品：${context.productName}` : '',
    `客户问题：${context.customerQuestion}`,
    context.issueSummary ? `已知现象：${context.issueSummary}` : '',
    '请基于授权知识给出建议对客回复、内部排查步骤、升级条件和禁止承诺。',
  ]
    .filter(Boolean)
    .join('\n')
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function normalizeRequired(value: unknown, maxLength: number): string | null {
  if (typeof value !== 'string') return null
  const normalized = value.trim()
  return normalized.length > 0 && normalized.length <= maxLength ? normalized : null
}

function normalizeOptional(value: unknown, maxLength: number): string | null {
  if (value === undefined || value === null || value === '') return null
  return normalizeRequired(value, maxLength)
}
