import type { MatchKda } from '@/types/history'

export type TeamSide = 'red' | 'blue'
export type PlayerRelation = 'self' | 'friend'
export type StatTone = 'rose' | 'amber' | 'emerald'
export type SettlementLayout = 'group' | 'global'

export interface SettlementStat {
  key: 'damage' | 'taken' | 'healing'
  value: number
  percent: number
  tone: StatTone
}

export interface SettlementPlayer {
  id: string
  team: TeamSide
  champion: string
  championImage: string
  level: number
  rank: number
  nickname: string
  relation: PlayerRelation
  kda: MatchKda
  stats: readonly SettlementStat[]
  score: number
}

export interface RedPacketEntry {
  name: string
  rank: number
}

export interface RedPacketNotice {
  entries: readonly RedPacketEntry[]
}

/**
 * 当前只有一份共享的静态结算示例，不绑定 match-001..match-007 的“真实”结算。
 * `isSharedFixture` 仅供数据层与文档标注，不在 UI 显示额外说明。
 */
export interface MatchDetailFixture {
  id: string
  isSharedFixture: boolean
  queueLabel: string
  duration: string
  redPacket: RedPacketNotice
  players: readonly SettlementPlayer[]
}

/**
 * 未来按 matchId 载入真实结算详情的数据源契约。
 * 当前阶段只保留类型；页面仍使用共享静态 fixture，不发起请求。
 */
export interface MatchDetailSource {
  load(matchId: string): Promise<MatchDetailFixture>
}
