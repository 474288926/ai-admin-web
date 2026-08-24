import { ApiError } from '@/services/api/client'

const ERROR_MESSAGES = {
  NETWORK_ERROR: '无法连接服务，请检查网络或确认后端已经启动',
  REQUEST_CANCELLED: '请求已取消',
  AUTH_UNAUTHORIZED: '登录状态已失效，请重新登录',
  AUTH_REFRESH_TOKEN_INVALID: '登录状态已失效，请重新登录',
  AI_DISABLED: 'AI 服务当前未启用，请联系管理员检查系统配置',
  AI_MODEL_NOT_AVAILABLE: '当前选择的模型不可用，请切换模型后重试',
  AI_PROVIDER_UNAVAILABLE: '模型服务暂时不可用，请稍后重试或切换模型',
  AI_PROVIDER_ERROR: '模型服务调用失败，请稍后重试或切换模型',
  AI_PROVIDER_TIMEOUT: '模型响应超时，请稍后重试',
  AI_PROVIDER_RATE_LIMITED: '模型请求过于频繁，请稍后重试',
  AI_TOO_MANY_REQUESTS: '模型请求过于频繁，请稍后重试',
  AI_EMPTY_RESPONSE: '模型未返回可用内容，请检查输入内容后重试',
  AI_INPUT_INVALID: '提交给模型的内容不符合要求，请调整输入后重试',
  DOCUMENT_NOT_READY: '文档尚未完成解析，请等待入库完成后重试',
  DOCUMENT_EMBEDDING_NOT_READY: '文档尚未完成向量化，请等待入库完成后重试',
  DOCUMENT_TEXT_EMPTY: '未从文件中解析出有效文本，请确认文件内容可复制且未加密后重新上传',
  DOCUMENT_PARSE_FAILED: '文档解析失败，请检查文件格式后重试',
  DOCUMENT_EMBEDDING_FAILED: '文档向量化失败，请在处理任务中重试',
  DOCUMENT_PROCESSING_FAILED: '文档处理失败，请在处理任务中重试',
  DOCUMENT_PREVIEW_NOT_READY: '文档预览仍在生成，请稍后重试',
  DOCUMENT_PROCESSING_TIMEOUT: '文档处理超时，请在入库管理中重试该任务',
  EVALUATION_CANDIDATE_GENERATION_FAILED: '候选题生成失败，请检查文档状态和模型配置后重新发起',
  EVALUATION_CASE_TIMEOUT: '评测用例执行超时，可在运行结束后重试失败题',
  CROSS_KNOWLEDGE_BASE_REGRESSION_TIMEOUT: '跨知识库评测等待超时，请稍后查看两次运行记录',
} as const

type KnownErrorCode = keyof typeof ERROR_MESSAGES

function mappedErrorMessage(code: string | undefined): string | undefined {
  if (!code || !Object.prototype.hasOwnProperty.call(ERROR_MESSAGES, code)) return undefined
  return ERROR_MESSAGES[code as KnownErrorCode]
}

export function getErrorCodeMessage(
  code: string | null | undefined,
  fallback = '操作失败，请稍后重试',
): string {
  return mappedErrorMessage(code ?? undefined) ?? fallback
}

export function getErrorMessage(error: unknown, fallback = '操作失败，请稍后重试'): string {
  if (!(error instanceof ApiError)) return fallback
  const mappedMessage = mappedErrorMessage(error.code)
  if (mappedMessage) return mappedMessage
  if (error.status === 401) return ERROR_MESSAGES.AUTH_UNAUTHORIZED
  if (error.status === 408 || error.status === 504) return '请求处理超时，请稍后重试'
  return error.message || fallback
}
