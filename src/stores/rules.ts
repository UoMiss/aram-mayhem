import { ref } from 'vue'
import { defineStore } from 'pinia'
import { INITIAL_SCORE_RULE } from '@/mocks/home'
import type { ScoreRuleSelection } from '@/types/home'
export const useRulesStore = defineStore('rules', () => {
  const currentRule = ref<ScoreRuleSelection>(INITIAL_SCORE_RULE)
  function setCurrentRule(rule: ScoreRuleSelection) {
    currentRule.value = rule
  }
  return { currentRule, setCurrentRule }
})
