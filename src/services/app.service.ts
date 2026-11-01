import { isTauri } from '@tauri-apps/api/core'
import { browserAdapter } from '@/adapters/browser.adapter'
import type { AppHealth, AppRuntime, DesktopAdapter } from '@/types/desktop'

/** Select the adapter from the actual runtime, not a build-time flag. */
export function getRuntimeEnvironment(): AppRuntime {
  return isTauri() ? 'tauri' : 'browser'
}

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

export type { DesktopAdapter }
