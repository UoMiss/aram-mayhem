export type LcuConnectionStatus =
  | 'unsupported_platform'
  | 'not_running'
  | 'discovering'
  | 'connecting'
  | 'connected'
  | 'disconnected'
  | 'reconnecting'
  | 'error'

export type LcuSource = 'real' | 'unavailable' | 'mock'

/** Typed payload shared by Rust, Tauri events and the browser Mock. */
export interface LcuStatusDto {
  status: LcuConnectionStatus
  code: string | null
  message: string | null
  source: LcuSource
  simulated: boolean
  revision: number
  updatedAt: number
  monitoring: boolean
}

export type LcuStatusListener = (status: LcuStatusDto) => void
export type LcuUnlisten = () => void

export interface LcuAdapter {
  getConnectionStatus(): Promise<LcuStatusDto>
  startMonitoring(): Promise<LcuStatusDto>
  stopMonitoring(): Promise<LcuStatusDto>
  subscribe(listener: LcuStatusListener): Promise<LcuUnlisten>
}

export const LCU_STATUS_EVENT = 'lcu://connection-status'
