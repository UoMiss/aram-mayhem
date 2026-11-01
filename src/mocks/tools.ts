import type { ScoreRuleOption, TeamPlayer } from '@/types/tools'

/** 原始 #page-tools 中三条规则的顺序与 Font Awesome 图标；文案由 i18n 提供。 */
export const SCORE_RULE_OPTIONS: readonly ScoreRuleOption[] = [
  {
    key: 'damage',
    icon: 'fa-solid fa-fire',
  },
  {
    key: 'lucky',
    icon: 'fa-solid fa-dice',
  },
  {
    key: 'tail',
    icon: 'fa-solid fa-list-ol',
  },
]

/**
 * 原始工具页的 8 名随机分组玩家，保留完整昵称和原始顺序。
 * 初始网格由 CSS truncate 处理长昵称，不修改这里的实际数据。
 * 该名单独立于结算页的 6 名玩家，不从结算 fixture 推导。
 */
export const TEAM_DRAW_PLAYERS: readonly TeamPlayer[] = [
  { id: 'team-player-01', name: 'Ezreal' },
  { id: 'team-player-02', name: '洞爷湖' },
  { id: 'team-player-03', name: '黛乃奈昭姿' },
  { id: 'team-player-04', name: 'Faker' },
  { id: 'team-player-05', name: '湘川苦茶子' },
  { id: 'team-player-06', name: '奢谨筱箅栗' },
  { id: 'team-player-07', name: '翻斗花园牛爷爷' },
  { id: 'team-player-08', name: '召唤师52395' },
]
