import { describe, expect, it } from 'vitest'

import { ApiError } from '@/services/api/client'
import { getErrorCodeMessage, getErrorMessage } from '@/services/error-feedback'

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

  it.each([
    ['DOCUMENT_TEXT_EMPTY', '未从文件中解析出有效文本，请确认文件内容可复制且未加密后重新上传'],
    ['AI_EMPTY_RESPONSE', '模型未返回可用内容，请检查输入内容后重试'],
    [
      'EVALUATION_CANDIDATE_GENERATION_FAILED',
      '候选题生成失败，请检查文档状态和模型配置后重新发起',
    ],
  ])('maps persisted failure code %s without exposing it as the message', (code, message) => {
    expect(getErrorCodeMessage(code)).toBe(message)
  })

  it('uses a safe fallback for an unknown persisted failure code', () => {
    expect(getErrorCodeMessage('UNKNOWN_INTERNAL_FAILURE', '处理失败，请重试')).toBe(
      '处理失败，请重试',
    )
  })
})
