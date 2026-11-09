import { isTauri } from '@tauri-apps/api/core'
import { demoHome } from '@/mocks/client-demo'
import type { HomeSnapshot } from '@/types/home-api'
export type HomeResult = { source: 'real' | 'mock'; snapshot: HomeSnapshot }
export async function getHomeSnapshot(): Promise<HomeResult> {
  if (!isTauri()) return { source: 'mock', snapshot: demoHome() }
  const { tauriHomeAdapter } = await import('@/adapters/tauri.adapter')
  return { source: 'real', snapshot: await tauriHomeAdapter.getHomeSnapshot() }
}
