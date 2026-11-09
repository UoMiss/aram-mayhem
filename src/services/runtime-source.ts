import { isTauri } from '@tauri-apps/api/core'
import type { GameflowSnapshot } from '@/types/lcu'

/** A desktop failure must never be replaced by browser fixtures. */
export const isRuntimeSource = (source: string) => source === (isTauri() ? 'real' : 'mock')
export const isRuntimeFlow = (flow: GameflowSnapshot) =>
  isRuntimeSource(flow.source) && flow.simulated === !isTauri()
