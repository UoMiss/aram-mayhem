import { computed, onScopeDispose, ref, shallowRef } from 'vue'
import { isTauri } from '@tauri-apps/api/core'
import { defineStore } from 'pinia'
import { MATCH_HISTORY } from '@/mocks/history'
import { getMatchHistory } from '@/services/history.service'
import { normalizeLcuError, LcuServiceError } from '@/services/desktop-error'
import { toHistoryItem } from '@/shared/lib/history-presentation'
import type { HistoryFilter, MatchHistoryItem } from '@/types/history'
import type { LcuHistoryMatch } from '@/types/history-api'
import { useUiStore } from './ui'

export const useHistoryStore = defineStore('history', () => {
  const ui = useUiStore()
  const isDesktop = isTauri()
  const matchHistory = shallowRef<readonly MatchHistoryItem[]>(isDesktop ? [] : MATCH_HISTORY)
  const realMatches = shallowRef<readonly LcuHistoryMatch[]>([])
  const historyFilter = ref<HistoryFilter>('all')
  const selectedMatchId = ref<string | null>(null)
  const selectedMatch = computed(
    () => matchHistory.value.find((item) => item.id === selectedMatchId.value) ?? null,
  )
  const liveSettlement = shallowRef<{ gameId: string; accountKey: string } | null>(null)
  const nextOffset = ref<number | null>(null)
  const loadingMore = ref(false)
  const moreError = ref(false)
  const isLoading = ref(false)
  const hasLoaded = ref(!isDesktop)
  const errorCode = ref<string | null>(null)
  const accountKey = ref<string | null>(null)
  let generation = 0
  let pending: Promise<void> | null = null

  function cancelRequest() {
    generation++
    isLoading.value = false
    loadingMore.value = false
    pending = null
  }
  function clearRealHistory() {
    cancelRequest()
    if (isDesktop) {
      matchHistory.value = []
      realMatches.value = []
      nextOffset.value = null
      moreError.value = false
      hasLoaded.value = false
      selectedMatchId.value = null
      liveSettlement.value = null
      accountKey.value = null
      errorCode.value = null
    }
  }
  function loadHistory(append = false): Promise<void> {
    if (pending) return pending
    const offset = append ? nextOffset.value : 0
    if (offset === null) return Promise.resolve()
    const request = ++generation
    const priorAccount = accountKey.value
    isLoading.value = true
    loadingMore.value = append
    moreError.value = false
    errorCode.value = null
    if (isDesktop && !append) {
      hasLoaded.value = false
      nextOffset.value = null
      matchHistory.value = []
      realMatches.value = []
      selectedMatchId.value = null
      liveSettlement.value = null
      accountKey.value = null
    }
    pending = (async () => {
      try {
        const result = await getMatchHistory(offset)
        if (request !== generation) return
        if (isDesktop && result.source !== 'real')
          throw new LcuServiceError('lcu.invalid_response', 'Unexpected history source')
        if (result.source === 'real') {
          if (append && result.snapshot.accountKey !== priorAccount) {
            throw new LcuServiceError('lcu.account_changed', 'History account changed')
          }
          const rows = append
            ? [...realMatches.value, ...result.snapshot.matches]
            : result.snapshot.matches
          realMatches.value = [...new Map(rows.map((row) => [row.id, row])).values()].sort(
            (left, right) => right.createdAt - left.createdAt,
          )
          matchHistory.value = realMatches.value.map(toHistoryItem)
          nextOffset.value = result.snapshot.nextOffset ?? null
          accountKey.value = result.snapshot.accountKey
        } else {
          matchHistory.value = result.matches
        }
        hasLoaded.value = true
      } catch (error) {
        if (request !== generation) return
        const code = normalizeLcuError(error, 'lcu.history_failed').code
        if (append && code !== 'lcu.account_changed' && code !== 'lcu.not_logged_in') {
          moreError.value = true
        } else {
          clearRealHistory()
          errorCode.value = code
        }
      } finally {
        if (request === generation) {
          isLoading.value = false
          loadingMore.value = false
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
    nextOffset,
    loadingMore,
    moreError,
    cancelRequest,
    clearRealHistory,
    setHistoryFilter,
    resetHistoryView,
    openMatchDetail,
    liveSettlement,
    openLiveSettlement,
  }
})
