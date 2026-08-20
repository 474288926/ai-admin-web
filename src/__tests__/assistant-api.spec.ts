import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  createConversation,
  getAiProviderHealthSummary,
  getAiUsageSummary,
  listAiModels,
  listConversations,
  listMessages,
  retryAiProviderAlertDelivery,
  sendAiProviderAlertTest,
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
  it('loads the enabled AI models for the selector', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      new Response(
        JSON.stringify([
          {
            id: 'qwen',
            provider: 'qwen',
            displayName: '千问（阿里云百炼）',
            isDefault: true,
            pricing: {
              currency: 'CNY',
              inputPerMillionTokens: 2,
              cachedInputPerMillionTokens: 2,
              outputPerMillionTokens: 8,
              effectiveDate: '2026-08-14',
            },
          },
        ]),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    )
    vi.stubGlobal('fetch', fetchMock)

    await expect(listAiModels()).resolves.toEqual([
      {
        id: 'qwen',
        provider: 'qwen',
        displayName: '千问（阿里云百炼）',
        isDefault: true,
        pricing: {
          currency: 'CNY',
          inputPerMillionTokens: 2,
          cachedInputPerMillionTokens: 2,
          outputPerMillionTokens: 8,
          effectiveDate: '2026-08-14',
        },
      },
    ])
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/ai/models'),
      expect.any(Object),
    )
  })

  it('loads and validates the current user monthly usage report', async () => {
    const response = {
      month: '2026-08',
      timeZone: 'Asia/Shanghai',
      budgetPolicy: {
        warningRatio: 0.8,
        fallbackRatio: 1,
        autoFallbackEnabled: true,
      },
      totals: {
        callCount: 2,
        inputTokens: 1000,
        outputTokens: 500,
        totalTokens: 1500,
        cachedInputTokens: 200,
        reasoningOutputTokens: 50,
      },
      costs: [{ currency: 'CNY', amount: 0.0058, budget: 10, usageRatio: 0.00058 }],
      byModel: [
        {
          provider: 'qwen',
          model: 'qwen-demo',
          callCount: 2,
          inputTokens: 1000,
          outputTokens: 500,
          totalTokens: 1500,
          cachedInputTokens: 200,
          reasoningOutputTokens: 50,
          cost: { currency: 'CNY', amount: 0.0058 },
        },
      ],
      daily: [
        {
          date: '2026-08-14',
          callCount: 2,
          inputTokens: 1000,
          outputTokens: 500,
          totalTokens: 1500,
          cachedInputTokens: 200,
          reasoningOutputTokens: 50,
          costs: [{ currency: 'CNY', amount: 0.0058 }],
        },
      ],
    }
    const fetchMock = vi.fn().mockResolvedValueOnce(
      new Response(JSON.stringify(response), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )
    vi.stubGlobal('fetch', fetchMock)

    await expect(getAiUsageSummary('2026-08')).resolves.toEqual(response)
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/ai/usage/summary?month=2026-08'),
      expect.any(Object),
    )
  })

  it('loads and validates provider health and failover counters', async () => {
    const response = {
      period: {
        days: 7,
        from: '2026-08-08',
        to: '2026-08-14',
        timeZone: 'Asia/Shanghai',
      },
      totals: {
        requests: 11,
        successes: 10,
        failures: 1,
        successRate: 0.9091,
        averageDurationMs: 320,
        failovers: 1,
      },
      models: [
        {
          modelId: 'qwen',
          provider: 'qwen',
          displayName: '千问（阿里云百炼）',
          status: 'degraded',
          circuitOpen: false,
          circuitRetryAfterSeconds: null,
          requests: 11,
          successes: 10,
          failures: 1,
          successRate: 0.9091,
          averageDurationMs: 320,
          failovers: 1,
          timeoutCount: 1,
          rateLimitCount: 0,
          unavailableCount: 0,
          providerErrorCount: 0,
          failoverOutCount: 1,
          failoverInCount: 0,
          lastActivityDate: '2026-08-14',
        },
      ],
      daily: [
        {
          date: '2026-08-14',
          requests: 11,
          successes: 10,
          failures: 1,
          successRate: 0.9091,
          averageDurationMs: 320,
          failovers: 1,
        },
      ],
      incidents: [
        {
          id: '550e8400-e29b-41d4-a716-446655440000',
          type: 'circuit_opened',
          modelId: 'qwen',
          occurredAt: '2026-08-14T12:00:00.000Z',
          reason: 'timeout',
          failureCount: 3,
          openSeconds: 60,
        },
      ],
      alertDeliveries: [
        {
          id: '550e8400-e29b-41d4-a716-446655440001',
          incidentId: '550e8400-e29b-41d4-a716-446655440000',
          incidentType: 'circuit_opened',
          modelId: 'qwen',
          incidentOccurredAt: '2026-08-14T12:00:00.000Z',
          reason: 'timeout',
          failureCount: 3,
          openSeconds: 60,
          attempt: 1,
          trigger: 'initial',
          retriedFromDeliveryId: null,
          attemptedAt: '2026-08-14T12:00:01.000Z',
          status: 'delivered',
          channel: 'generic',
          statusCode: 204,
          failureReason: null,
        },
      ],
    }
    const fetchMock = vi.fn().mockResolvedValueOnce(
      new Response(JSON.stringify(response), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )
    vi.stubGlobal('fetch', fetchMock)

    await expect(getAiProviderHealthSummary(7)).resolves.toEqual(response)
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/ai/health/summary?days=7'),
      expect.any(Object),
    )
  })

  it('sends and validates a provider test alert', async () => {
    const response = {
      status: 'delivered',
      channel: 'generic',
      statusCode: 204,
      failureReason: null,
      incidentType: 'circuit_opened',
      modelId: 'qwen',
    }
    const fetchMock = vi.fn().mockResolvedValueOnce(
      new Response(JSON.stringify(response), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      sendAiProviderAlertTest({ modelId: 'qwen', type: 'circuit_opened' }),
    ).resolves.toEqual(response)
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/ai/health/alerts/test'),
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ modelId: 'qwen', type: 'circuit_opened' }),
      }),
    )
  })

  it('retries a failed provider alert delivery through the authenticated API', async () => {
    const deliveryId = '550e8400-e29b-41d4-a716-446655440001'
    const response = {
      status: 'delivered',
      channel: 'generic',
      statusCode: 204,
      failureReason: null,
      incidentType: 'circuit_opened',
      modelId: 'qwen',
      retriedFromDeliveryId: deliveryId,
    }
    const fetchMock = vi.fn().mockResolvedValueOnce(
      new Response(JSON.stringify(response), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )
    vi.stubGlobal('fetch', fetchMock)

    await expect(retryAiProviderAlertDelivery(deliveryId)).resolves.toEqual(response)
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining(`/ai/health/alerts/deliveries/${deliveryId}/retry`),
      expect.objectContaining({ method: 'POST' }),
    )
  })

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
    const unhelpfulFeedback = {
      ...feedback,
      id: 'c4a8658b-4ec4-4c39-a1c8-d3db28e9f2c8',
      rating: 'UNHELPFUL',
      reason: 'INCORRECT',
      comment: '引用没有覆盖问题中的版本要求',
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
        new Response(
          JSON.stringify({
            userMessage,
            assistantMessage,
            replayed: false,
            modelSelection: {
              requestedModelId: 'deepseek',
              effectiveModelId: 'deepseek',
              status: 'warning',
              currency: 'USD',
              spent: 0.8,
              budget: 1,
              usageRatio: 0.8,
            },
            providerFailover: {
              fromModelId: 'deepseek',
              toModelId: 'qwen',
              reason: 'rate_limited',
            },
          }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          },
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify(feedback), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify(unhelpfulFeedback), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      )
    vi.stubGlobal('fetch', fetchMock)

    await createConversation({ knowledgeBaseId, title: '网络故障排查' })
    const sendResult = await sendMessage(conversationId, '设备无法联网怎么办？', 'deepseek')
    await upsertMessageFeedback(conversationId, assistantMessageId, { rating: 'HELPFUL' })
    await upsertMessageFeedback(conversationId, assistantMessageId, {
      rating: 'UNHELPFUL',
      reason: 'INCORRECT',
      comment: '引用没有覆盖问题中的版本要求',
    })

    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toMatchObject({
      knowledgeBaseId,
    })
    expect(JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body))).toMatchObject({
      mode: 'standard',
      modelId: 'deepseek',
    })
    expect(sendResult.modelSelection?.status).toBe('warning')
    expect(sendResult.providerFailover?.toModelId).toBe('qwen')
    expect(JSON.parse(String(fetchMock.mock.calls[2]?.[1]?.body))).toMatchObject({
      rating: 'HELPFUL',
    })
    expect(JSON.parse(String(fetchMock.mock.calls[3]?.[1]?.body))).toMatchObject({
      rating: 'UNHELPFUL',
      reason: 'INCORRECT',
      comment: '引用没有覆盖问题中的版本要求',
    })
  })
})
