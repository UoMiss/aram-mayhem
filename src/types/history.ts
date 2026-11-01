/** 原始 HTML 中 data-mode 的两种战绩类型。 */
export type MatchMode = 'hex' | 'custom'

/** 筛选值：全部或具体模式。 */
export type HistoryFilter = 'all' | MatchMode

/** 原始 HTML 中的胜负状态。 */
export type MatchResult = 'victory' | 'defeat'

export interface MatchKda {
  kills: number
  deaths: number
  assists: number
}

/** 单条首页战绩 Mock；字段与原始 7 条卡片一一对应。 */
export interface MatchHistoryItem {
  id: string
  mode: MatchMode
  result: MatchResult
  champion: string
  championImage: string
  kda: MatchKda
  isFriend: boolean
  timeLabel: string
}
