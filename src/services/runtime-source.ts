import { isTauri } from '@tauri-apps/api/core'
import { previewRuntime } from '@/adapters/preview-runtime'
import type { GameflowSnapshot } from '@/types/lcu'
import { LcuServiceError } from './desktop-error'

/** A desktop failure must never be replaced by browser fixtures. */
export const isRuntimeSource = (source: string) =>
  isTauri() ? source === 'real' : !!previewRuntime && source === 'mock'

export function requireTauri() {
  if (!isTauri()) throw new LcuServiceError('lcu.unsupported_platform', 'Desktop runtime required')
}
export const isRuntimeFlow = (flow: GameflowSnapshot) =>
  isRuntimeSource(flow.source) && flow.simulated === !isTauri()
