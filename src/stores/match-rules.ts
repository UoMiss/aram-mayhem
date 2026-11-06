import { defineStore } from 'pinia'
import { shallowRef } from 'vue'
import type { MatchRuleRecord } from '@/types/match-rule-api'

/** Display cache. The native match-rule book owns the saved record. */
export const useMatchRulesStore = defineStore('match-rules', () => {
  const records = shallowRef<MatchRuleRecord[]>([])
  function find(accountKey: string, gameId: string) {
    return records.value.find(
      (record) => record.accountKey === accountKey && record.gameId === gameId,
    )
  }
  function accept(record: MatchRuleRecord) {
    records.value = [
      record,
      ...records.value.filter(
        (item) => item.accountKey !== record.accountKey || item.gameId !== record.gameId,
      ),
    ].slice(0, 100)
  }
  return { find, accept }
})
