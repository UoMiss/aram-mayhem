import type { OpeningChoice } from '@/types/match-rule-api'

export async function lockMatchRule(choice: OpeningChoice) {
  const { tauriMatchRuleAdapter } = await import('@/adapters/tauri.adapter')
  return tauriMatchRuleAdapter.lock(choice)
}

export async function getLockedMatchRule(gameId: string) {
  const { tauriMatchRuleAdapter } = await import('@/adapters/tauri.adapter')
  return tauriMatchRuleAdapter.get(gameId)
}
