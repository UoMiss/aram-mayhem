import { isTauri } from '@tauri-apps/api/core'
import { MATCH_DETAIL_FIXTURE } from '@/mocks/match-detail'
import type { MatchDetailFixture } from '@/types/match-detail'
import type { SettlementRequest, SettlementSnapshot } from '@/types/settlement-api'
export type SettlementResult =
  { source: 'real'; snapshot: SettlementSnapshot } | { source: 'mock'; fixture: MatchDetailFixture }
export async function getSettlement(request: SettlementRequest): Promise<SettlementResult> {
  if (!isTauri()) return { source: 'mock', fixture: MATCH_DETAIL_FIXTURE }
  const { tauriSettlementAdapter } = await import('@/adapters/tauri.adapter')
  return { source: 'real', snapshot: await tauriSettlementAdapter.getSettlement(request) }
}
