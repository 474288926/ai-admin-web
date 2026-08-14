import { describe, expect, it } from 'vitest'

import {
  budgetDecisionMessage,
  estimateAiUsageCost,
  formatEstimatedCost,
  formatTokenCount,
  providerLabel,
  providerFailoverMessage,
  summarizeAiCosts,
  summarizeAiUsage,
} from '@/services/ai-usage'
import type { ConversationMessage } from '@/types/assistant'

function message(
  role: ConversationMessage['role'],
  usage: ConversationMessage['usage'],
): ConversationMessage {
  return {
    id: crypto.randomUUID(),
    position: 1,
    role,
    status: 'COMPLETED',
    content: 'test',
    clientRequestId: null,
    parentMessageId: null,
    provider: role === 'ASSISTANT' ? 'qwen' : null,
    model: role === 'ASSISTANT' ? 'qwen-test' : null,
    providerResponseId: null,
    finishReason: null,
    usage,
    citations: null,
    structuredResponse: null,
    errorCode: null,
    createdAt: '2026-08-14T00:00:00.000Z',
    updatedAt: '2026-08-14T00:00:00.000Z',
  }
}

describe('AI usage presentation', () => {
  it('describes automatic budget fallback decisions', () => {
    expect(
      budgetDecisionMessage({
        requestedModelId: 'qwen',
        effectiveModelId: 'doubao',
        status: 'fallback',
        currency: 'CNY',
        spent: 10.5,
        budget: 10,
        usageRatio: 1.05,
      }),
    ).toContain('自动切换为 豆包')
  })

  it('describes transient provider failover decisions', () => {
    expect(
      providerFailoverMessage({
        fromModelId: 'qwen',
        toModelId: 'deepseek',
        reason: 'timeout',
      }),
    ).toBe('千问发生响应超时，本次已自动切换为 DeepSeek')
  })

  it('summarizes completed assistant usage without counting user messages', () => {
    const usage = {
      inputTokens: 1200,
      outputTokens: 300,
      totalTokens: 1500,
      cachedInputTokens: 200,
      reasoningOutputTokens: 80,
    }

    expect(summarizeAiUsage([message('USER', usage), message('ASSISTANT', usage)])).toEqual({
      callCount: 1,
      inputTokens: 1200,
      outputTokens: 300,
      totalTokens: 1500,
      cachedInputTokens: 200,
      reasoningOutputTokens: 80,
    })
  })

  it('formats provider labels and token totals for display', () => {
    expect(providerLabel('deepseek')).toBe('DeepSeek')
    expect(providerLabel('custom-provider')).toBe('custom-provider')
    expect(formatTokenCount(12345)).toBe('12,345')
  })

  it('estimates cached input and output costs without mixing currencies', () => {
    const usage = {
      inputTokens: 1_000_000,
      outputTokens: 100_000,
      totalTokens: 1_100_000,
      cachedInputTokens: 200_000,
      reasoningOutputTokens: 0,
    }
    const pricing = {
      currency: 'CNY' as const,
      inputPerMillionTokens: 2,
      cachedInputPerMillionTokens: 0.4,
      outputPerMillionTokens: 8,
      effectiveDate: '2026-08-14',
    }
    expect(estimateAiUsageCost(usage, pricing)).toBeCloseTo(2.48)
    expect(formatEstimatedCost(2.48, 'CNY')).toBe('¥2.48')
    expect(
      summarizeAiCosts(
        [message('ASSISTANT', usage)],
        [
          {
            id: 'qwen',
            provider: 'qwen',
            displayName: '千问（阿里云百炼）',
            isDefault: true,
            pricing,
          },
        ],
      ),
    ).toEqual([{ currency: 'CNY', amount: 2.48 }])
  })
})
