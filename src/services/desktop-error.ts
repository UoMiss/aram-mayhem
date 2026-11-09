export class DesktopServiceError extends Error {
  readonly code: string

  constructor(code: string, message: string) {
    super(message)
    this.name = 'DesktopServiceError'
    this.code = code
  }
}

/** LCU-specific sanitized error; never carries credentials or a raw host stack. */
export class LcuServiceError extends Error {
  readonly code: string

  constructor(code: string, message: string) {
    super(message)
    this.name = 'LcuServiceError'
    this.code = code
  }
}

const LCU_ERROR_MESSAGES: Record<string, string> = {
  unsupported_platform: '当前系统暂不支持客户端连接',
  invalid_lockfile: '客户端连接信息无效，请重启客户端后重试',
  discovery_failed: '无法读取客户端连接信息，请重试',
  authentication_failed: '客户端认证失败，请重新连接',
  connection_refused: '无法连接客户端，请确认客户端已启动',
  timeout: '客户端响应超时，请重试',
  tls_error: '客户端安全连接失败，请重试',
  invalid_response: '客户端返回的数据格式不正确，请重试',
  http_status: '客户端暂时无法处理请求，请重试',
  cancelled: '操作已取消',
  not_logged_in: '请先登录英雄联盟客户端后重试',
  account_changed: '账号已切换，请重新加载',
  settlement_pending: '本局赛后数据尚未就绪',
  settlement_unavailable: '客户端未提供该局战绩数据',
  size_record_invalid: '本地开奖记录无法核验',
  size_storage_failed: '本地开奖记录保存失败',
  size_random_failed: '系统随机源不可用',
  internal: '客户端连接失败，请重试',
}

export function normalizeLcuError(error: unknown, fallback = 'lcu.ipc_failed'): LcuServiceError {
  if (error instanceof LcuServiceError) return error
  if (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    typeof error.code === 'string' &&
    Object.hasOwn(LCU_ERROR_MESSAGES, error.code)
  ) {
    return new LcuServiceError(`lcu.${error.code}`, LCU_ERROR_MESSAGES[error.code]!)
  }
  return new LcuServiceError(fallback, 'LCU IPC failed')
}
