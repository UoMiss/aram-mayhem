import { isTauri } from '@tauri-apps/api/core'
import { previewRuntime } from '@/adapters/preview-runtime'
import { requireTauri } from './runtime-source'
import type { SettlementSnapshot, SettlementRequest } from '@/types/settlement-api'
export type SettlementResult = { source: 'real' | 'mock'; snapshot: SettlementSnapshot }
export async function getSettlement(request: SettlementRequest): Promise<SettlementResult> {
  if (previewRuntime && !isTauri())
    return { source: 'mock', snapshot: previewRuntime.settlement(request) }
  requireTauri()
  const { tauriSettlementAdapter } = await import('@/adapters/tauri.adapter')
  return { source: 'real', snapshot: await tauriSettlementAdapter.getSettlement(request) }
}
