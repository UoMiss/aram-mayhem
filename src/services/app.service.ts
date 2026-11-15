import { isTauri } from '@tauri-apps/api/core'
import { previewRuntime } from '@/adapters/preview-runtime'
import { requireTauri } from './runtime-source'
import type { AppHealth } from '@/types/desktop'

export async function getAppHealth(): Promise<AppHealth> {
  if (previewRuntime && !isTauri()) return previewRuntime.health.getHealth()
  requireTauri()

  const { tauriAdapter } = await import('@/adapters/tauri.adapter')
  return tauriAdapter.getHealth()
}
