import { computed, ref, shallowRef } from 'vue'
import { defineStore } from 'pinia'
import { MATCH_HISTORY } from '@/mocks/history'
import type { HistoryFilter, MatchHistoryItem } from '@/types/history'
import { useUiStore } from './ui'
export const useHistoryStore = defineStore('history', () => {
  const ui = useUiStore()
  const matchHistory = shallowRef(MATCH_HISTORY)
  const historyFilter = ref<HistoryFilter>('all')
  const selectedMatchId = ref<string | null>(null)
  const selectedMatch = computed<MatchHistoryItem | null>(
    () => matchHistory.value.find((item) => item.id === selectedMatchId.value) ?? null,
  )
  function setHistoryFilter(filter: HistoryFilter) {
    historyFilter.value = filter
  }
  function resetHistoryView() {
    historyFilter.value = 'all'
    selectedMatchId.value = null
  }
  function openMatchDetail(matchId: string) {
    if (!matchHistory.value.some((item) => item.id === matchId)) return
    selectedMatchId.value = matchId
    ui.setActiveTab('match-detail')
  }
  return {
    matchHistory,
    historyFilter,
    selectedMatchId,
    selectedMatch,
    setHistoryFilter,
    resetHistoryView,
    openMatchDetail,
  }
})
