import type {
  AiBudgetDecision,
  AiModelOption,
  AiModelPricing,
  AiTokenUsage,
  AiProviderFailover,
  ConversationMessage,
} from '@/types/assistant'

export interface AiUsageSummary {
  callCount: number
  inputTokens: number
  outputTokens: number
  totalTokens: number
  cachedInputTokens: number
  reasoningOutputTokens: number
}

export interface AiCostSummary {
  currency: AiModelPricing['currency']
  amount: number
}

const PROVIDER_LABELS: Readonly<Record<string, string>> = {
  openai: 'OpenAI',
  qwen: '千问',
  deepseek: 'DeepSeek',
  doubao: '豆包',
}

export function providerLabel(provider: string | null | undefined): string {
  if (!provider) return 'AI'
  return PROVIDER_LABELS[provider.toLowerCase()] ?? provider
}

export function formatTokenCount(tokens: number): string {
  return new Intl.NumberFormat('zh-CN').format(tokens)
}

export function estimateAiUsageCost(usage: AiTokenUsage, pricing: AiModelPricing): number {
  const cachedInputTokens = Math.min(usage.cachedInputTokens, usage.inputTokens)
  const uncachedInputTokens = Math.max(0, usage.inputTokens - cachedInputTokens)

  return (
    (uncachedInputTokens * pricing.inputPerMillionTokens +
      cachedInputTokens * pricing.cachedInputPerMillionTokens +
      usage.outputTokens * pricing.outputPerMillionTokens) /
    1_000_000
  )
}

export function formatEstimatedCost(amount: number, currency: AiModelPricing['currency']): string {
  const symbol = currency === 'CNY' ? '¥' : '$'
  const maximumFractionDigits = amount < 0.01 ? 6 : 4
  return `${symbol}${amount.toLocaleString('zh-CN', { maximumFractionDigits, minimumFractionDigits: 0 })}`
}

export function summarizeAiUsage(messages: readonly ConversationMessage[]): AiUsageSummary {
  return messages.reduce<AiUsageSummary>(
    (summary, message) => {
      if (message.role !== 'ASSISTANT' || !message.usage) return summary

      summary.callCount += 1
      summary.inputTokens += message.usage.inputTokens
      summary.outputTokens += message.usage.outputTokens
      summary.totalTokens += message.usage.totalTokens
      summary.cachedInputTokens += message.usage.cachedInputTokens
      summary.reasoningOutputTokens += message.usage.reasoningOutputTokens
      return summary
    },
    {
      callCount: 0,
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      cachedInputTokens: 0,
      reasoningOutputTokens: 0,
    },
  )
}

export function summarizeAiCosts(
  messages: readonly ConversationMessage[],
  models: readonly AiModelOption[],
): AiCostSummary[] {
  const totals = new Map<AiModelPricing['currency'], number>()

  for (const message of messages) {
    if (message.role !== 'ASSISTANT' || !message.usage || !message.provider) continue
    const pricing = models.find((model) => model.provider === message.provider)?.pricing
    if (!pricing) continue
    totals.set(
      pricing.currency,
      (totals.get(pricing.currency) ?? 0) + estimateAiUsageCost(message.usage, pricing),
    )
  }

  return [...totals.entries()].map(([currency, amount]) => ({ currency, amount }))
}

export function budgetDecisionMessage(decision: AiBudgetDecision | undefined): string | null {
  if (!decision || decision.status === 'normal' || decision.status === 'untracked') return null

  const ratio = decision.usageRatio === null ? '' : `${(decision.usageRatio * 100).toFixed(1)}%`
  const currency = decision.currency ?? '当前币种'

  if (decision.status === 'fallback') {
    return `${currency} 月度预算已使用 ${ratio}，本次已自动切换为 ${providerLabel(decision.effectiveModelId)}`
  }
  if (decision.status === 'limit') {
    return `${currency} 月度预算已使用 ${ratio}，当前模型没有可用的自动降级映射`
  }
  return `${currency} 月度预算已使用 ${ratio}，请关注后续模型消耗`
}

export function providerFailoverMessage(failover: AiProviderFailover | undefined): string | null {
  if (!failover) return null
  const reason = providerFailoverReasonLabel(failover.reason)
  return `${providerLabel(failover.fromModelId)}发生${reason}，本次已自动切换为 ${providerLabel(failover.toModelId)}`
}

export function providerFailoverReasonLabel(reason: AiProviderFailover['reason']): string {
  return {
    timeout: '响应超时',
    rate_limited: '请求限流',
    unavailable: '网络不可用',
    provider_error: '服务异常',
    circuit_open: '持续异常，保护性熔断',
  }[reason]
}
