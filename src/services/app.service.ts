import { isTauri } from '@tauri-apps/api/core'
import { browserAdapter } from '@/adapters/browser.adapter'
import type { AppHealth } from '@/types/desktop'

/**
 * Browser -> Mock adapter; Tauri -> lazy IPC adapter.
 * The Tauri API chunk is only loaded when the desktop runtime is active.
 */
export async function getAppHealth(): Promise<AppHealth> {
  if (!isTauri()) {
    return browserAdapter.getHealth()
  }

  const { tauriAdapter } = await import('@/adapters/tauri.adapter')
  return tauriAdapter.getHealth()
}
