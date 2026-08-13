import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  createConversation,
  listConversations,
  listMessages,
  sendMessage,
  upsertMessageFeedback,
} from '@/services/api/assistant'

const conversationId = '03c7a80e-c672-41f0-8b9c-cfb915eabe4c'
const knowledgeBaseId = '9b148f19-fd93-4c74-be98-35fa2008efc8'
const userMessageId = '241a10e1-b6f3-468e-b6ed-d8619e7520b7'
const assistantMessageId = '63d3f9f8-55ef-418d-8300-402e7b64607b'

const conversation = {
  id: conversationId,
  title: '网络故障排查',
  knowledgeBaseId,
  createdAt: '2026-08-12T01:00:00.000Z',
  updatedAt: '2026-08-12T01:05:00.000Z',
}

const baseMessage = {
  position: 1,
  status: 'COMPLETED',
  clientRequestId: null,
  parentMessageId: null,
  provider: null,
  model: null,
  providerResponseId: null,
  finishReason: null,
  usage: null,
  citations: null,
  structuredResponse: null,
  errorCode: null,
  createdAt: '2026-08-12T01:00:00.000Z',
  updatedAt: '2026-08-12T01:00:00.000Z',
}
const userMessage = {
  ...baseMessage,
  id: userMessageId,
  role: 'USER',
  content: '设备无法联网怎么办？',
  clientRequestId: '80fd06fc-3777-4610-9854-260c0f8c2115',
}
const assistantMessage = {
  ...baseMessage,
  id: assistantMessageId,
  position: 2,
  role: 'ASSISTANT',
  content: '请先检查电源和网络指示灯。',
  parentMessageId: userMessageId,
  provider: 'openai',
  model: 'test-model',
  citations: [
    {
      sourceId: 'S1',
      chunkId: '4dd40bfe-17b3-4a38-b7cf-9355fb137a10',
      documentId: '060a09bd-61ec-4c78-8106-2c0ded250a35',
      documentName: '网络排查手册.pdf',
      position: 1,
      similarityScore: 0.92,
      excerpt: '检查设备电源及网络指示灯。',
    },
  ],
  structuredResponse: {
    schemaVersion: '1.0',
    scenario: 'customer_service_assist',
    answer: '请先检查电源和网络指示灯。',
    steps: ['确认电源状态'],
    applicableConditions: [],
    riskWarnings: [],
    citations: ['S1'],
    missingInformation: [],
    refusalReason: null,
    customerService: {
      customerFacingReply: '请确认设备电源和网络指示灯状态。',
      internalTroubleshooting: ['记录指示灯状态'],
      followUpQuestions: [],
      escalationConditions: [],
      prohibitedCommitments: [],
    },
  },
}
const pagination = { page: 1, pageSize: 100, total: 1, totalPages: 1, hasNextPage: false }

afterEach(() => vi.unstubAllGlobals())

describe('assistant api', () => {
  it('loads conversations and messages with citations and structured customer reply', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ items: [conversation], meta: pagination }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ items: [userMessage, assistantMessage], meta: pagination }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      )
    vi.stubGlobal('fetch', fetchMock)

    expect((await listConversations()).items[0]?.knowledgeBaseId).toBe(knowledgeBaseId)
    const messages = await listMessages(conversationId)
    expect(messages.items[1]?.citations?.[0]?.documentName).toBe('网络排查手册.pdf')
    expect(messages.items[1]?.structuredResponse?.customerService?.customerFacingReply).toContain(
      '网络指示灯',
    )
  })

  it('creates a bound conversation, sends standard RAG mode and records feedback', async () => {
    const feedback = {
      id: 'b39754d1-dbb0-4c60-9f28-2c8a9bd94944',
      assistantMessageId,
      rating: 'HELPFUL',
      reason: null,
      comment: null,
      clientRequestId: '81a5f9ae-023a-4641-a83e-27164e0a1503',
      createdAt: '2026-08-12T01:06:00.000Z',
      updatedAt: '2026-08-12T01:06:00.000Z',
    }
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify(conversation), {
          status: 201,
          headers: { 'Content-Type': 'application/json' },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ userMessage, assistantMessage, replayed: false }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify(feedback), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      )
    vi.stubGlobal('fetch', fetchMock)

    await createConversation({ knowledgeBaseId, title: '网络故障排查' })
    await sendMessage(conversationId, '设备无法联网怎么办？')
    await upsertMessageFeedback(conversationId, assistantMessageId, { rating: 'HELPFUL' })

    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toMatchObject({
      knowledgeBaseId,
    })
    expect(JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body))).toMatchObject({
      mode: 'standard',
    })
    expect(JSON.parse(String(fetchMock.mock.calls[2]?.[1]?.body))).toMatchObject({
      rating: 'HELPFUL',
    })
  })
})
