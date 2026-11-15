import { isTauri } from '@tauri-apps/api/core'
import { previewRuntime } from '@/adapters/preview-runtime'
import { requireTauri } from './runtime-source'
import type { OpeningChoice } from '@/types/match-rule-api'

export async function lockMatchRule(choice: OpeningChoice) {
  if (previewRuntime && !isTauri()) return previewRuntime.lockRule(choice)
  requireTauri()
  const { tauriMatchRuleAdapter } = await import('@/adapters/tauri.adapter')
  return tauriMatchRuleAdapter.lock(choice)
}

export async function getLockedMatchRule(gameId: string) {
  if (previewRuntime && !isTauri()) return previewRuntime.lockedRule(gameId)
  requireTauri()
  const { tauriMatchRuleAdapter } = await import('@/adapters/tauri.adapter')
  return tauriMatchRuleAdapter.get(gameId)
}
