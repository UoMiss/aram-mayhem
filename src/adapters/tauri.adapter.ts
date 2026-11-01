import { invoke } from '@tauri-apps/api/core'
import { DesktopServiceError } from '@/services/desktop-error'
import type { AppHealth, DesktopAdapter } from '@/types/desktop'

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
