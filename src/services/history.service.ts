import { isTauri } from '@tauri-apps/api/core'
import { previewRuntime } from '@/adapters/preview-runtime'
import { requireTauri } from './runtime-source'
import type { MatchHistorySnapshot } from '@/types/history-api'
export type HistoryResult = { source: 'real' | 'mock'; snapshot: MatchHistorySnapshot }
export async function getMatchHistory(): Promise<HistoryResult> {
  if (previewRuntime && !isTauri()) return { source: 'mock', snapshot: previewRuntime.history() }
  requireTauri()
  const { tauriHistoryAdapter } = await import('@/adapters/tauri.adapter')
  return { source: 'real', snapshot: await tauriHistoryAdapter.getMatchHistory() }
}
