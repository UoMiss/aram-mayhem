import { isTauri } from '@tauri-apps/api/core'
import { demoHistory } from '@/mocks/client-demo'
import type { MatchHistorySnapshot } from '@/types/history-api'
export type HistoryResult = { source: 'real' | 'mock'; snapshot: MatchHistorySnapshot }
export async function getMatchHistory(): Promise<HistoryResult> {
  if (!isTauri()) return { source: 'mock', snapshot: demoHistory() }
  const { tauriHistoryAdapter } = await import('@/adapters/tauri.adapter')
  return { source: 'real', snapshot: await tauriHistoryAdapter.getMatchHistory() }
}
