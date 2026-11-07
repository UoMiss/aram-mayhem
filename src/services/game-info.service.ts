import { isTauri } from '@tauri-apps/api/core'
import type { GameMetadataRequest } from '@/types/game-info'
export async function getGameMetadata(request: GameMetadataRequest) {
  if (!isTauri()) return null
  const { tauriMetadataAdapter } = await import('@/adapters/tauri.adapter')
  return tauriMetadataAdapter.get(request)
}
