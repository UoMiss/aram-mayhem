import { isTauri } from '@tauri-apps/api/core'
import { browserLcuAdapter } from '@/adapters/browser.adapter'
import type { LcuAdapter, LcuStatusDto, LcuStatusListener, LcuUnlisten } from '@/types/lcu'

async function getLcuAdapter(): Promise<LcuAdapter> {
  if (!isTauri()) {
    return browserLcuAdapter
  }
  const { tauriLcuAdapter } = await import('@/adapters/tauri.adapter')
  return tauriLcuAdapter
}

export async function getLcuConnectionStatus(): Promise<LcuStatusDto> {
  return (await getLcuAdapter()).getConnectionStatus()
}

export async function startLcuMonitoring(): Promise<LcuStatusDto> {
  return (await getLcuAdapter()).startMonitoring()
}

export async function stopLcuMonitoring(): Promise<LcuStatusDto> {
  return (await getLcuAdapter()).stopMonitoring()
}

export async function subscribeLcuStatus(listener: LcuStatusListener): Promise<LcuUnlisten> {
  return (await getLcuAdapter()).subscribe(listener)
}
