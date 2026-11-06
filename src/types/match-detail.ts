import type { MatchKda } from '@/types/history'

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
  team: TeamSide
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
}

export interface RedPacketEntry {
  name: string
  rank: number
}

export interface RedPacketNotice {
  entries: readonly RedPacketEntry[]
}

/**
 * 浏览器共享静态演示示例，不与真实对局绑定；桌面使用 SettlementSnapshot。
 */
export interface MatchDetailFixture {
  id: string
  isSharedFixture: boolean
  queueLabel: string
  duration: string
  redPacket: RedPacketNotice
  players: readonly SettlementPlayer[]
}
