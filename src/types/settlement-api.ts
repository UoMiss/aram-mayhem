import type { ScoreRuleSelection } from './home'
export interface SettlementRequest {
  gameId: string
  accountKey: string
  rule: ScoreRuleSelection
}
export interface LcuSettlementPlayer {
  id: string
  teamId: 100 | 200
  championId: number
  level: number | null
  nickname: string | null
  isSelf: boolean
  isFriend: boolean
  win: boolean
  kills: number
  deaths: number
  assists: number
  damage: string | null
  taken: string | null
  healing: string | null
  rank: number | null
  ruleValue: string | null
}
export interface SettlementSnapshot {
  id: string
  accountKey: string
  queueId: number | null
  mapId: number | null
  gameMode: string | null
  gameType: string | null
  createdAt: number
  durationSeconds: number
  appliedRule: ScoreRuleSelection
  isCustom: boolean
  rankingStatus: 'ready' | 'no_rule' | 'missing_damage' | 'missing_lucky' | 'missing_friends'
  luckyDigit: number | null
  lockedRule: boolean
  players: LcuSettlementPlayer[]
  updatedAt: number
}
