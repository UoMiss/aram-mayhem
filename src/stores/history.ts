import { computed, onScopeDispose, ref, shallowRef } from 'vue'
import { isTauri } from '@tauri-apps/api/core'
import { defineStore } from 'pinia'
import { demoHistory } from '@/mocks/client-demo'
import { getMatchHistory } from '@/services/history.service'
import { normalizeLcuError, LcuServiceError } from '@/services/desktop-error'
import { toHistoryItem } from '@/shared/lib/history-presentation'
import type { HistoryFilter, MatchHistoryItem } from '@/types/history'
import type { LcuHistoryMatch } from '@/types/history-api'
import { useUiStore } from './ui'

export const HISTORY_MATCH_LIMIT = 20

export const useHistoryStore = defineStore('history', () => {
  const ui = useUiStore()
  const isDesktop = isTauri()
  const initialDemo = isDesktop ? null : demoHistory()
  const matchHistory = shallowRef<readonly MatchHistoryItem[]>(
    initialDemo?.matches.map((match) => toHistoryItem(match, initialDemo.accountKey)) ?? [],
  )
  const realMatches = shallowRef<readonly LcuHistoryMatch[]>([])
  const historyFilter = ref<HistoryFilter>('all')
  const selectedMatchId = ref<string | null>(null)
  const selectedMatch = computed(
    () => matchHistory.value.find((item) => item.id === selectedMatchId.value) ?? null,
  )
  const liveSettlement = shallowRef<{ gameId: string; accountKey: string } | null>(null)
  const isLoading = ref(false)
  const hasLoaded = ref(!isDesktop)
  const errorCode = ref<string | null>(null)
  const accountKey = ref<string | null>(initialDemo?.accountKey ?? null)
  let generation = 0
  let pending: Promise<void> | null = null

  function cancelRequest() {
    generation++
    isLoading.value = false
    pending = null
  }
  function clearRealHistory() {
    cancelRequest()
    matchHistory.value = []
    realMatches.value = []
    hasLoaded.value = false
    selectedMatchId.value = null
    liveSettlement.value = null
    accountKey.value = null
    errorCode.value = null
  }
  function loadHistory(): Promise<void> {
    if (pending) return pending
    const request = ++generation
    isLoading.value = true
    errorCode.value = null
    hasLoaded.value = false
    matchHistory.value = []
    realMatches.value = []
    selectedMatchId.value = null
    liveSettlement.value = null
    accountKey.value = null
    pending = (async () => {
      try {
        const result = await getMatchHistory()
        if (request !== generation) return
        if (isDesktop && result.source !== 'real')
          throw new LcuServiceError('lcu.invalid_response', 'Unexpected history source')
        realMatches.value = [
          ...new Map(result.snapshot.matches.map((row) => [row.id, row])).values(),
        ]
          .sort((left, right) => right.createdAt - left.createdAt)
          .slice(0, HISTORY_MATCH_LIMIT)
        matchHistory.value = realMatches.value.map((match) =>
          toHistoryItem(match, result.snapshot.accountKey),
        )
        accountKey.value = result.snapshot.accountKey
        hasLoaded.value = true
      } catch (error) {
        if (request !== generation) return
        const code = normalizeLcuError(error, 'lcu.history_failed').code
        clearRealHistory()
        errorCode.value = code
      } finally {
        if (request === generation) {
          isLoading.value = false
          pending = null
        }
      }
    })()
    return pending
  }
  function setHistoryFilter(filter: HistoryFilter) {
    historyFilter.value = filter
  }
  function resetHistoryView() {
    historyFilter.value = 'all'
    selectedMatchId.value = null
    clearRealHistory()
  }
  function openMatchDetail(matchId: string) {
    if ((isDesktop && !accountKey.value) || !matchHistory.value.some((item) => item.id === matchId))
      return
    liveSettlement.value = null
    selectedMatchId.value = matchId
    ui.setActiveTab('match-detail')
  }
  function openLiveSettlement(gameId: string, accountKey: string) {
    cancelRequest()
    liveSettlement.value = { gameId, accountKey }
    ui.setActiveTab('match-detail')
  }
  onScopeDispose(cancelRequest)
  return {
    matchHistory,
    realMatches,
    historyFilter,
    selectedMatchId,
    selectedMatch,
    isLoading,
    hasLoaded,
    errorCode,
    accountKey,
    loadHistory,
    cancelRequest,
    clearRealHistory,
    setHistoryFilter,
    resetHistoryView,
    openMatchDetail,
    liveSettlement,
    openLiveSettlement,
  }
})
