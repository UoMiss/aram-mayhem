import type { ScoreRule } from '@/types/home'

/** 工具页算分规则选项；显示文案由组件层 i18n 映射。 */
export interface ScoreRuleOption {
  key: ScoreRule
  icon: string
}

/** 随机分组玩家。ID 只用于稳定 key，不展示。 */
export interface TeamPlayer {
  id: string
  name: string
}

export interface TeamSplit {
  groupA: TeamPlayer[]
  groupB: TeamPlayer[]
}
