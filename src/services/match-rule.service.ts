import { isTauri } from '@tauri-apps/api/core'
import { demoLockRule, demoLockedRule } from '@/mocks/client-demo'
import type { OpeningChoice } from '@/types/match-rule-api'

export async function lockMatchRule(choice: OpeningChoice) {
  if (!isTauri()) return demoLockRule(choice)
  const { tauriMatchRuleAdapter } = await import('@/adapters/tauri.adapter')
  return tauriMatchRuleAdapter.lock(choice)
}

export async function getLockedMatchRule(gameId: string) {
  if (!isTauri()) return demoLockedRule(gameId)
  const { tauriMatchRuleAdapter } = await import('@/adapters/tauri.adapter')
  return tauriMatchRuleAdapter.get(gameId)
}
