import type { ScoreRuleSelection } from './home'

export interface MatchRuleRecord {
  accountKey: string
  gameId: string
  rule: ScoreRuleSelection
  luckyDigit: number | null
}

export interface OpeningChoice {
  sessionKey: string
  gameId: string
  rule: ScoreRuleSelection
}
