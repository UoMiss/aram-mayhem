import { isTauri } from '@tauri-apps/api/core'
import { MATCH_HISTORY } from '@/mocks/history'
import type { MatchHistoryItem } from '@/types/history'
import type { MatchHistorySnapshot } from '@/types/history-api'

export type HistoryResult =
  | { source: 'real'; snapshot: MatchHistorySnapshot }
  | { source: 'mock'; matches: readonly MatchHistoryItem[] }

export async function getMatchHistory(): Promise<HistoryResult> {
  if (!isTauri()) return { source: 'mock', matches: MATCH_HISTORY }
  const { tauriHistoryAdapter } = await import('@/adapters/tauri.adapter')
  return { source: 'real', snapshot: await tauriHistoryAdapter.getMatchHistory() }
}
