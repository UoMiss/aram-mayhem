import type { ScoreRuleOption } from '@/types/tools'

/** 算分规则顺序与 Font Awesome 图标；文案由 i18n 提供。 */
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
  { key: 'damage_size', icon: 'fa-solid fa-dice-two' },
]
