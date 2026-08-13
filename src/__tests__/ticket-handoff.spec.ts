import { describe, expect, it, vi } from 'vitest'

import {
  buildTicketEscalationDraft,
  formatTicketEscalationDraft,
  openTicketSystem,
  parseTicketSystemUrl,
} from '@/services/ticket-handoff'
import type { ConversationMessage } from '@/types/assistant'

const message = {
  id: '11111111-1111-4111-8111-111111111111',
  position: 2,
  role: 'ASSISTANT',
  status: 'COMPLETED',
  content: '请先确认指示灯状态。',
  clientRequestId: null,
  parentMessageId: '44444444-4444-4444-8444-444444444444',
  provider: 'openai',
  model: 'test-model',
  providerResponseId: null,
  finishReason: 'stop',
  usage: null,
  citations: [
    {
      sourceId: 'CS-NET-001',
      chunkId: '22222222-2222-4222-8222-222222222222',
      documentId: '33333333-3333-4333-8333-333333333333',
      documentName: '网络故障处理手册.md',
      position: 1,
      similarityScore: 0.9,
    },
  ],
  structuredResponse: {
    schemaVersion: '1.0',
    scenario: 'customer_service_assist',
    answer: '请先检查网络状态。',
    steps: [],
    applicableConditions: [],
    riskWarnings: [],
    citations: ['CS-NET-001'],
    missingInformation: ['设备序列号'],
    refusalReason: null,
    customerService: {
      customerFacingReply: '请先确认指示灯状态。',
      internalTroubleshooting: ['检查路由器连接'],
      followUpQuestions: [],
      escalationConditions: ['仍然离线时升级二线'],
      prohibitedCommitments: ['不要承诺立即修复'],
    },
  },
  errorCode: null,
  createdAt: '2026-08-13T00:00:00.000Z',
  updatedAt: '2026-08-13T00:00:00.000Z',
} as ConversationMessage

describe('工单人工交接', () => {
  it('从客服结构化回答生成有限字段草稿', () => {
    const draft = buildTicketEscalationDraft({
      assistantMessage: message,
      customerQuestion: '设备重启后仍然离线',
      ticketId: 'CS-1001',
      productName: 'AirLink AP720',
    })

    expect(draft).toMatchObject({
      schemaVersion: '1.0',
      customerQuestion: '设备重启后仍然离线',
      escalationConditions: ['仍然离线时升级二线'],
      prohibitedCommitments: ['不要承诺立即修复'],
    })
    expect(draft?.subject).toContain('[CS-1001]')
    expect(draft?.evidence).toEqual([
      { sourceId: 'CS-NET-001', documentName: '网络故障处理手册.md' },
    ])
    expect(() => structuredClone(draft)).not.toThrow()
  })

  it('拒绝非完成助手回答或缺少客户问题的输入', () => {
    expect(
      buildTicketEscalationDraft({
        assistantMessage: { ...message, status: 'FAILED' },
        customerQuestion: '问题',
      }),
    ).toBeNull()
    expect(
      buildTicketEscalationDraft({ assistantMessage: message, customerQuestion: ' ' }),
    ).toBeNull()
  })

  it('格式化草稿时保留人工核对所需的边界和依据', () => {
    const draft = buildTicketEscalationDraft({
      assistantMessage: message,
      customerQuestion: '设备重启后仍然离线',
    })!
    const text = formatTicketEscalationDraft(draft)
    expect(text).toContain('升级条件：')
    expect(text).toContain('禁止承诺：')
    expect(text).toContain('CS-NET-001 · 网络故障处理手册.md')
  })

  it('只接受 HTTPS 或本机 HTTP 跳转地址并拒绝凭据和片段', () => {
    expect(
      parseTicketSystemUrl('https://tickets.example.com/create', 'http://localhost:5173'),
    ).toBe('https://tickets.example.com/create')
    expect(parseTicketSystemUrl('http://localhost:8080/create', 'http://localhost:5173')).toBe(
      'http://localhost:8080/create',
    )
    expect(
      parseTicketSystemUrl('http://tickets.example.com/create', 'http://localhost:5173'),
    ).toBeNull()
    expect(parseTicketSystemUrl('/tickets/create', 'https://portal.example.com')).toBeNull()
    expect(
      parseTicketSystemUrl('http://localhost:8080/create', 'https://portal.example.com'),
    ).toBeNull()
    expect(
      parseTicketSystemUrl('https://user:pass@tickets.example.com', 'http://localhost:5173'),
    ).toBeNull()
    expect(
      parseTicketSystemUrl('https://tickets.example.com/#token', 'http://localhost:5173'),
    ).toBeNull()
  })

  it('使用隔离的新标签页打开已验证的工单地址', () => {
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined)

    openTicketSystem('https://tickets.example.com/create')

    const link = click.mock.instances[0] as HTMLAnchorElement
    expect(link.href).toBe('https://tickets.example.com/create')
    expect(link.target).toBe('_blank')
    expect(link.rel).toBe('noopener noreferrer')
  })
})
