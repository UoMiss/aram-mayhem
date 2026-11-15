import { isTauri } from '@tauri-apps/api/core'
import { previewRuntime } from '@/adapters/preview-runtime'
import { requireTauri } from './runtime-source'
import type { HomeSnapshot } from '@/types/home-api'
export type HomeResult = { source: 'real' | 'mock'; snapshot: HomeSnapshot }
export async function getHomeSnapshot(): Promise<HomeResult> {
  if (previewRuntime && !isTauri()) return { source: 'mock', snapshot: previewRuntime.home() }
  requireTauri()
  const { tauriHomeAdapter } = await import('@/adapters/tauri.adapter')
  return { source: 'real', snapshot: await tauriHomeAdapter.getHomeSnapshot() }
}
