<script setup lang="ts">
import { computed, onMounted, onUnmounted, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import MatchHistoryCard from './components/MatchHistoryCard.vue'
import { HISTORY_FILTER_KEYS } from '@/i18n/labels'
import { HISTORY_FILTERS } from '@/mocks/history'
import { useHistoryStore, HISTORY_MATCH_LIMIT } from '@/stores/history'
import { useConnectionStore } from '@/stores/connection'
import { useUiStore } from '@/stores/ui'
import type { HistoryFilter } from '@/types/history'

const history = useHistoryStore()
const connection = useConnectionStore()
const ui = useUiStore()
const { t } = useI18n({ useScope: 'global' })
const filteredMatches = computed(() =>
  history.historyFilter === 'all'
    ? history.matchHistory
    : history.matchHistory.filter((match) => match.mode === history.historyFilter),
)
const canLoad = computed(() => !connection.isDesktopRuntime || connection.canReadAccountData)
const errorText = computed(() => {
  switch (history.errorCode) {
    case 'lcu.not_logged_in':
      return t('history.errors.login')
    case 'lcu.account_changed':
      return t('history.errors.accountChanged')
    case 'lcu.authentication_failed':
      return t('history.errors.authentication')
    case 'lcu.timeout':
      return t('history.errors.timeout')
    case 'lcu.invalid_response':
      return t('history.errors.invalidResponse')
    case 'lcu.unsupported_platform':
      return t('connection.unsupported')
    default:
      return t('history.errors.unavailable')
  }
})
function filterLabel(filter: HistoryFilter) {
  return t(HISTORY_FILTER_KEYS[filter])
}
function filterButtonClasses(filter: HistoryFilter) {
  const base =
    'filter-btn px-4 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap cursor-pointer'
  return history.historyFilter === filter
    ? `${base} bg-brand-strong text-on-solid shadow-md shadow-brand-strong/30`
    : `${base} border border-on-solid/5 bg-surface-raised/80 text-text-muted hover:text-on-solid`
}
function refreshHistory() {
  if (canLoad.value) void history.loadHistory()
}
onMounted(() => {
  watch(
    () => [ui.activeTab === 'history', connection.canReadAccountData] as const,
    ([active, connected]) => {
      if (connection.isDesktopRuntime && !connected) {
        history.clearRealHistory()
        return
      }
      if (active) refreshHistory()
      else history.cancelRequest()
    },
    { immediate: true, flush: 'sync' },
  )
})
onUnmounted(() => history.clearRealHistory())
</script>

<template>
  <section id="page-history" class="space-y-3" :aria-busy="history.isLoading">
    <div class="flex items-center justify-between gap-2 py-0.5">
      <div
        class="no-scrollbar flex items-center gap-2 overflow-x-auto"
        role="group"
        :aria-label="t('a11y.historyFilters')"
      >
        <button
          v-for="filter in HISTORY_FILTERS"
          :key="filter"
          type="button"
          :data-filter="filter"
          :aria-pressed="history.historyFilter === filter"
          :class="filterButtonClasses(filter)"
          @click="history.setHistoryFilter(filter)"
        >
          {{ filterLabel(filter) }}
        </button>
      </div>
      <button
        type="button"
        :title="t('a11y.refreshHistory')"
        :aria-label="t('a11y.refreshHistory')"
        class="flex shrink-0 cursor-pointer items-center justify-center rounded-lg border border-on-solid/5 bg-surface-raised/80 p-2 text-text-secondary transition-all hover:bg-brand-strong/30 hover:text-on-solid active:scale-90 disabled:cursor-not-allowed disabled:opacity-50"
        :disabled="history.isLoading || !canLoad"
        :aria-busy="history.isLoading"
        @click="refreshHistory"
      >
        <i
          class="fa-solid fa-arrows-rotate text-xs"
          :class="{ 'animate-spin': history.isLoading }"
        ></i>
      </button>
    </div>
    <div
      class="flex items-center gap-1.5 rounded-xl border border-on-solid/5 bg-surface-sunken/50 px-3 py-1.5 text-[11px] text-text-muted"
    >
      <i class="fa-solid fa-circle-info text-xs text-brand"></i>
      <span>{{
        t(connection.isDesktopRuntime ? 'history.realHint' : 'history.recentHint', {
          count: HISTORY_MATCH_LIMIT,
        })
      }}</span>
    </div>
    <p v-if="!connection.isDesktopRuntime" class="text-center text-[10px] text-text-subtle">
      {{ t('history.demoHint') }}
    </p>
    <p v-if="history.isLoading" role="status" class="py-12 text-center text-sm text-text-muted">
      {{ t('history.loading') }}
    </p>
    <div
      v-else-if="history.errorCode"
      role="alert"
      class="glass-card space-y-3 rounded-xl p-5 text-center"
    >
      <p class="text-sm text-danger-light">{{ errorText }}</p>
      <button
        type="button"
        class="rounded-lg bg-brand-strong px-4 py-2 text-xs text-on-solid"
        :disabled="!canLoad"
        @click="refreshHistory"
      >
        {{ t('history.retry') }}
      </button>
    </div>
    <p v-else-if="!canLoad" role="status" class="py-12 text-center text-sm text-text-muted">
      {{ t('history.connectFirst') }}
    </p>
    <p
      v-else-if="history.hasLoaded && filteredMatches.length === 0"
      role="status"
      class="py-12 text-center text-sm text-text-muted"
    >
      {{ t(history.matchHistory.length ? 'history.emptyFilter' : 'history.empty') }}
    </p>
    <div v-else id="historyList" class="space-y-2">
      <MatchHistoryCard
        v-for="match in filteredMatches"
        :key="match.id"
        :match="match"
        @select="history.openMatchDetail"
      />
    </div>
  </section>
</template>
