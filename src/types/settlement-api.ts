import type { ScoreRuleSelection } from './home'
export interface SettlementRequest {
  gameId: string
  accountKey: string
  rule: ScoreRuleSelection
}
export interface LcuSettlementPlayer {
  id: string
  teamId: number
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
  damageSize?: DamageSizeResult
  rankingStatus:
    'not_applicable' | 'ready' | 'no_rule' | 'missing_damage' | 'missing_lucky' | 'missing_friends'
  luckyDigit: number | null
  lockedRule: boolean
  players: LcuSettlementPlayer[]
  updatedAt: number
}

export type SizeOutcome = 'big' | 'small'
export type SizeReason =
  | 'missing_damage'
  | 'missing_friends'
  | 'identity_unverified'
  | 'end_unverified'
  | 'invalid_match'
  | 'unsupported_count'
  | 'unlocked'
  | 'data_conflict'
  | 'current_game_active'
export interface SizeParticipant {
  id: string
  identity: string
  nickname: string | null
  damage: string | null
  group: SizeOutcome | null
}
export interface DamageSizeResult {
  status: 'ready' | 'preview' | 'pending' | 'unsupported' | 'conflict'
  reason: SizeReason | null
  outcome: SizeOutcome | null
  participants: SizeParticipant[]
  redPacketPlayerIds: string[] | null
  frozenAt: number | null
}
