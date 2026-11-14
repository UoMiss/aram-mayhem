import type { MatchKda } from '@/types/history'
import type { SizeOutcome } from '@/types/settlement-api'

export type TeamSide = 'red' | 'blue'
export type PlayerRelation = 'self' | 'friend'
export type StatTone = 'rose' | 'amber' | 'emerald'
export type SettlementLayout = 'group' | 'global'

export interface SettlementStat {
  key: 'damage' | 'taken' | 'healing'
  value: number | string | null
  percent: number
  tone: StatTone
}

export interface SettlementPlayer {
  id: string
  teamId?: number
  team: TeamSide | null
  champion: string
  championImage: string
  level: number | null
  rank: number | null
  nickname: string
  relation: PlayerRelation | null
  kda: MatchKda
  stats: readonly SettlementStat[]
  score: number | null
  ruleValue?: string | null
  sizeResult?: {
    group: SizeOutcome | null
  }
}
