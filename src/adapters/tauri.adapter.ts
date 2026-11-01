import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { DesktopServiceError, LcuServiceError } from '@/services/desktop-error'
import type { AppHealth, DesktopAdapter } from '@/types/desktop'
import {
  LCU_STATUS_EVENT,
  type LcuAdapter,
  type LcuStatusDto,
  type LcuStatusListener,
  type LcuUnlisten,
} from '@/types/lcu'

/** The only module allowed to know the Rust command name. */
export const tauriAdapter: DesktopAdapter = {
  async getHealth(): Promise<AppHealth> {
    try {
      return await invoke<AppHealth>('app_health_check')
    } catch {
      // Never surface a raw Rust/host exception or stack trace to the page.
      throw new DesktopServiceError('desktop.ipc_failed', 'Desktop health check failed')
    }
  },
}

function lcuIpcError(): LcuServiceError {
  return new LcuServiceError('lcu.ipc_failed', 'LCU IPC failed')
}

/** The only frontend module that knows the Rust LCU command/event names. */
export const tauriLcuAdapter: LcuAdapter = {
  async getConnectionStatus() {
    try {
      return await invoke<LcuStatusDto>('lcu_get_connection_status')
    } catch {
      throw lcuIpcError()
    }
  },
  async startMonitoring() {
    try {
      return await invoke<LcuStatusDto>('lcu_start_monitoring')
    } catch {
      throw lcuIpcError()
    }
  },
  async stopMonitoring() {
    try {
      return await invoke<LcuStatusDto>('lcu_stop_monitoring')
    } catch {
      throw lcuIpcError()
    }
  },
  async subscribe(listener: LcuStatusListener): Promise<LcuUnlisten> {
    try {
      return await listen<LcuStatusDto>(LCU_STATUS_EVENT, (event) => listener(event.payload))
    } catch {
      throw lcuIpcError()
    }
  },
}
