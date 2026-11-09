import { isTauri } from '@tauri-apps/api/core'
import { demoSettlement } from '@/mocks/client-demo'
import type { SettlementSnapshot, SettlementRequest } from '@/types/settlement-api'
export type SettlementResult = { source: 'real' | 'mock'; snapshot: SettlementSnapshot }
export async function getSettlement(request: SettlementRequest): Promise<SettlementResult> {
  if (!isTauri()) return { source: 'mock', snapshot: demoSettlement(request) }
  const { tauriSettlementAdapter } = await import('@/adapters/tauri.adapter')
  return { source: 'real', snapshot: await tauriSettlementAdapter.getSettlement(request) }
}
