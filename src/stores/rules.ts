import { isTauri } from '@tauri-apps/api/core'
import { readLocalData, writeLocalData } from '@/shared/lib/local-data'
import { ref } from 'vue'
import { defineStore } from 'pinia'
import { INITIAL_SCORE_RULE } from '@/mocks/home'
import type { ScoreRuleSelection } from '@/types/home'

export const useRulesStore = defineStore('rules', () => {
  const key = 'aram.score-rule.v1'
  const stored = isTauri() ? readLocalData(key) : null
  const savedRule =
    stored && typeof stored === 'object' && 'rule' in stored ? stored.rule : undefined
  const currentRule = ref<ScoreRuleSelection>(
    savedRule === null ||
      savedRule === 'damage' ||
      savedRule === 'tail' ||
      savedRule === 'lucky' ||
      savedRule === 'damage_size'
      ? savedRule
      : INITIAL_SCORE_RULE,
  )
  function persist() {
    if (isTauri()) writeLocalData(key, { rule: currentRule.value })
  }
  function setCurrentRule(rule: ScoreRuleSelection) {
    currentRule.value = rule
    persist()
  }
  return { currentRule, setCurrentRule }
})
