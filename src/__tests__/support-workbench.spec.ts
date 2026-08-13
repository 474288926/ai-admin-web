import { describe, expect, it } from 'vitest'

import {
  buildSupportQuestion,
  isTrustedWorkbenchOrigin,
  parseSupportTicketContext,
  parseTrustedWorkbenchOrigins,
} from '@/services/support-workbench'

describe('客服工作台嵌入协议', () => {
  it('只接受精确的 http 或 https Origin，并自动去重', () => {
    expect(
      parseTrustedWorkbenchOrigins(
        'https://support.example.com, https://support.example.com, http://localhost:5173, *, https://bad.example.com/path',
        'http://localhost:5173',
      ),
    ).toEqual(['https://support.example.com', 'http://localhost:5173'])
  })

  it('未配置来源时只信任当前站点', () => {
    expect(parseTrustedWorkbenchOrigins(undefined, 'http://localhost:5173')).toEqual([
      'http://localhost:5173',
    ])
  })

  it('按完整 Origin 判断工作台来源，不接受相似域名', () => {
    const trusted = ['https://support.example.com']
    expect(isTrustedWorkbenchOrigin('https://support.example.com', trusted)).toBe(true)
    expect(isTrustedWorkbenchOrigin('https://support.example.com.evil.test', trusted)).toBe(false)
  })

  it('规范化合法工单上下文', () => {
    expect(
      parseSupportTicketContext({
        requestId: ' req-1 ',
        ticketId: ' CS-1001 ',
        customerQuestion: ' 设备无法联网怎么办？ ',
        productName: ' AirLink AP720 ',
        issueSummary: '',
      }),
    ).toEqual({
      requestId: 'req-1',
      ticketId: 'CS-1001',
      customerQuestion: '设备无法联网怎么办？',
      productName: 'AirLink AP720',
    })
  })

  it('拒绝缺少必填字段或超过长度限制的上下文', () => {
    expect(parseSupportTicketContext({ ticketId: 'CS-1', customerQuestion: '问题' })).toBeNull()
    expect(
      parseSupportTicketContext({
        requestId: 'req-1',
        ticketId: 'CS-1',
        customerQuestion: 'x'.repeat(4001),
      }),
    ).toBeNull()
  })

  it('生成明确包含客服回答边界的知识问题', () => {
    const question = buildSupportQuestion({
      requestId: 'req-1',
      ticketId: 'CS-1001',
      customerQuestion: '设备无法联网怎么办？',
      productName: 'AirLink AP720',
      issueSummary: '重启后仍然离线',
    })

    expect(question).toContain('工单编号：CS-1001')
    expect(question).toContain('客户问题：设备无法联网怎么办？')
    expect(question).toContain('内部排查步骤、升级条件和禁止承诺')
  })
})
