import type { GameInfoInput } from './game-info'
/** 保留原始演示类型，并区分普通 ARAM 与其他真实队列。 */
export type MatchMode = 'hex' | 'custom' | 'aram' | 'other'

/** 筛选值：全部或具体模式。 */
export type HistoryFilter = 'all' | 'hex' | 'custom'

/** 原始 HTML 中的胜负状态。 */
export type MatchResult = 'victory' | 'defeat'

export interface MatchKda {
  kills: number
  deaths: number
  assists: number
}

/** 战绩卡片视图；真实记录保留时间戳，演示记录保留原始时间文案。 */
export interface MatchHistoryItem {
  gameInfo?: GameInfoInput
  accountKey?: string
  id: string
  mode: MatchMode
  result: MatchResult
  champion: string
  championImage: string
  kda: MatchKda
  isFriend: boolean
  timeLabel: string
  createdAt?: number
}
