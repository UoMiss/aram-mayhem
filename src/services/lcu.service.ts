import { isTauri } from '@tauri-apps/api/core'
import { browserGameflowAdapter, browserLcuAdapter } from '@/adapters/browser.adapter'
import type {
  GameflowAdapter,
  GameflowEventListener,
  GameflowSnapshot,
  LcuAdapter,
  LcuStatusDto,
  LcuStatusListener,
  LcuUnlisten,
} from '@/types/lcu'

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

export async function getGameflowSnapshot(): Promise<GameflowSnapshot> {
  return (await getGameflowAdapter()).getSnapshot()
}

export async function startGameflowMonitoring(): Promise<GameflowSnapshot> {
  return (await getGameflowAdapter()).startMonitoring()
}

export async function stopGameflowMonitoring(): Promise<GameflowSnapshot> {
  return (await getGameflowAdapter()).stopMonitoring()
}

export async function subscribeGameflow(listener: GameflowEventListener): Promise<LcuUnlisten> {
  return (await getGameflowAdapter()).subscribe(listener)
}

async function getGameflowAdapter(): Promise<GameflowAdapter> {
  if (!isTauri()) {
    return browserGameflowAdapter
  }
  const { tauriGameflowAdapter } = await import('@/adapters/tauri.adapter')
  return tauriGameflowAdapter
}
