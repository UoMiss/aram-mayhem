import type { ScoreRule, ScoreRuleSelection } from '@/types/home'

/**
 * 原版 handleRuleToggle() 的核心语义：
 * 点击已选中的规则取消选中；点击其他规则切换为该项。
 */
export function toggleScoreRule(
  current: ScoreRuleSelection,
  clicked: ScoreRule,
): ScoreRuleSelection {
  return current === clicked ? null : clicked
}
