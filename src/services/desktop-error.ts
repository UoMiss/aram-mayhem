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
