import { describe, expect, it } from 'vitest'

import { ApiError } from '@/services/api/client'
import { getErrorMessage } from '@/services/error-feedback'

describe('error feedback', () => {
  it.each([
    ['AI_PROVIDER_UNAVAILABLE', '模型服务暂时不可用，请稍后重试或切换模型'],
    ['DOCUMENT_EMBEDDING_NOT_READY', '文档尚未完成向量化，请等待入库完成后重试'],
    ['EVALUATION_CASE_TIMEOUT', '评测用例执行超时，可在运行结束后重试失败题'],
    ['NETWORK_ERROR', '无法连接服务，请检查网络或确认后端已经启动'],
  ])('maps %s to a consistent user message', (code, message) => {
    expect(getErrorMessage(new ApiError('raw message', 503, code))).toBe(message)
  })

  it('keeps an unknown backend business message', () => {
    expect(getErrorMessage(new ApiError('配置已被其他管理员修改', 409, 'REVISION_CONFLICT'))).toBe(
      '配置已被其他管理员修改',
    )
  })

  it('uses the caller fallback for non-API errors', () => {
    expect(getErrorMessage(new Error('fetch failed'), '加载失败')).toBe('加载失败')
  })
})
