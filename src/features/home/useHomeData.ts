import { computed, onMounted, onUnmounted, shallowRef, watch } from 'vue'
import { getMatchHistory } from '@/services/history.service'
import { LcuServiceError, normalizeLcuError } from '@/services/desktop-error'
import { toHistoryItem } from '@/shared/lib/history-presentation'
import { useConnectionStore } from '@/stores/connection'
import { useHomeStore } from '@/stores/home'
import { useUiStore } from '@/stores/ui'
import type { MatchHistoryItem } from '@/types/history'

export const HOME_REFRESH_MS = 15000
export const HOME_RECENT_MATCH_LIMIT = 5

export interface HomeRecentMatch {
  match: MatchHistoryItem
}

type RecentMatchState =
  | { status: 'idle' | 'loading' | 'empty' }
  | { status: 'error'; code: string }
  | { status: 'ready'; entries: readonly HomeRecentMatch[] }

/** AppShell keeps pages mounted with v-show; poll only while home is visible and connected. */
export function useHomeData() {
  const connection = useConnectionStore()
  const home = useHomeStore()
  const ui = useUiStore()
  const active = computed(() => ui.activeTab === 'home' && connection.canReadAccountData)
  const account = computed(() => (active.value ? home.snapshot?.accountKey : undefined))
  const recent = shallowRef<RecentMatchState>({ status: 'idle' })
  let timer: ReturnType<typeof setTimeout> | undefined
  let generation = 0
  let recentGeneration = 0

  async function refreshRecent() {
    const accountKey = account.value
    if (!accountKey || recent.value.status === 'loading') return
    const request = ++recentGeneration
    recent.value = { status: 'loading' }
    try {
      const result = await getMatchHistory()
      if (request !== recentGeneration) return
      if (result.source !== 'real')
        throw new LcuServiceError('lcu.invalid_response', 'Unexpected history source')
      if (result.snapshot.accountKey !== accountKey)
        throw new LcuServiceError('lcu.account_changed', 'History account changed')
      const uniqueMatches = new Map(result.snapshot.matches.map((match) => [match.id, match]))
      const entries = [...uniqueMatches.values()]
        .sort((left, right) => right.createdAt - left.createdAt)
        .slice(0, HOME_RECENT_MATCH_LIMIT)
        .map((match) => ({
          match: toHistoryItem(match, accountKey),
        }))
      recent.value = entries.length ? { status: 'ready', entries } : { status: 'empty' }
    } catch (error) {
      if (request === recentGeneration)
        recent.value = {
          status: 'error',
          code: normalizeLcuError(error, 'lcu.history_failed').code,
        }
    }
  }

  function resetRecent() {
    recentGeneration++
    recent.value = { status: 'idle' }
  }

  async function refresh() {
    if (!active.value || !connection.isDesktopRuntime) return
    clearTimeout(timer)
    const request = ++generation
    await home.loadHome()
    if (request === generation && active.value)
      timer = setTimeout(() => {
        void refresh()
      }, HOME_REFRESH_MS)
  }
  function stop() {
    generation++
    clearTimeout(timer)
    timer = undefined
    home.clearRealHome()
  }
  onMounted(() => {
    watch(
      active,
      (visible) => {
        stop()
        if (visible) void refresh()
      },
      { immediate: true, flush: 'sync' },
    )
    watch(
      account,
      (accountKey) => {
        resetRecent()
        if (accountKey) void refreshRecent()
      },
      { immediate: true, flush: 'sync' },
    )
  })
  onUnmounted(() => {
    stop()
    resetRecent()
  })
  return { refresh, recent, refreshRecent }
}
