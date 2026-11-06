import { isTauri } from '@tauri-apps/api/core'
import { createMockHomeProfile } from '@/mocks/home'
import type { HomeProfile } from '@/types/home'
import type { HomeSnapshot } from '@/types/home-api'

export type HomeResult =
  { source: 'real'; snapshot: HomeSnapshot } | { source: 'mock'; profile: HomeProfile }

export async function getHomeSnapshot(): Promise<HomeResult> {
  if (!isTauri()) return { source: 'mock', profile: createMockHomeProfile() }
  const { tauriHomeAdapter } = await import('@/adapters/tauri.adapter')
  return { source: 'real', snapshot: await tauriHomeAdapter.getHomeSnapshot() }
}
