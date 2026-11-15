import type { Component } from 'vue'
import type { DesktopAdapter } from '@/types/desktop'
import type { MatchHistorySnapshot } from '@/types/history-api'
import type { HomeSnapshot } from '@/types/home-api'
import type { GameflowAdapter, GameflowPhase, GameflowSnapshot, LcuAdapter } from '@/types/lcu'
import type { MatchRuleRecord, OpeningChoice } from '@/types/match-rule-api'
import type { ParticipantSnapshot } from '@/types/participants'
import type { SettlementRequest, SettlementSnapshot } from '@/types/settlement-api'
import type { UpdateSnapshot } from '@/types/settings'

export interface PreviewRuntime {
  controls: Component
  messages: Record<string, Record<string, string>>
  health: DesktopAdapter
  lcu: LcuAdapter
  gameflow: GameflowAdapter
  resetConnection(): GameflowSnapshot
  home(): HomeSnapshot
  history(): MatchHistorySnapshot
  participants(): ParticipantSnapshot
  settlement(request: SettlementRequest): SettlementSnapshot
  lockRule(choice: OpeningChoice): MatchRuleRecord
  lockedRule(gameId: string): MatchRuleRecord | null
  createUpdater(phase: () => GameflowPhase | null | undefined): {
    getUpdateState(): Promise<UpdateSnapshot>
    checkUpdate(): Promise<UpdateSnapshot>
    downloadUpdate(progress: (snapshot: UpdateSnapshot) => void): Promise<UpdateSnapshot>
    cancelUpdate(): Promise<void>
    installUpdate(): Promise<UpdateSnapshot>
    dispose(): void
  }
}

export const previewRuntime: PreviewRuntime | undefined = undefined
