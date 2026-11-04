<script setup lang="ts">
import { computed, onUnmounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import MatchHistoryCard from '@/features/history/components/MatchHistoryCard.vue'
import { HISTORY_FILTER_KEYS } from '@/i18n/labels'
import { HISTORY_FILTERS } from '@/mocks/history'
import { useHistoryStore } from '@/stores/history'
import type { HistoryFilter } from '@/types/history'

const REFRESH_ANIMATION_MS = 800
const RECENT_MATCH_LIMIT = 20

const history = useHistoryStore()
const { t } = useI18n({ useScope: 'global' })
const isRefreshing = ref(false)
let refreshTimer: ReturnType<typeof setTimeout> | null = null

/** 筛选只改变展示集合，保持 MATCH_HISTORY 原始顺序。 */
const filteredMatches = computed(() => {
  if (history.historyFilter === 'all') return history.matchHistory
  return history.matchHistory.filter((match) => match.mode === history.historyFilter)
})

function filterLabel(filter: HistoryFilter): string {
  return t(HISTORY_FILTER_KEYS[filter])
}

function filterButtonClasses(filter: HistoryFilter): string {
  const base =
    'filter-btn px-4 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap cursor-pointer'
  return history.historyFilter === filter
    ? `${base} bg-brand-strong text-on-solid shadow-md shadow-brand-strong/30`
    : `${base} border border-on-solid/5 bg-surface-raised/80 text-text-muted hover:text-on-solid`
}

/** 原版 800ms 旋转动画；重复点击被忽略，不修改 Mock 数据。 */
function refreshHistory() {
  if (isRefreshing.value) return

  isRefreshing.value = true
  refreshTimer = setTimeout(() => {
    isRefreshing.value = false
    refreshTimer = null
  }, REFRESH_ANIMATION_MS)
}

onUnmounted(() => {
  if (refreshTimer) {
    clearTimeout(refreshTimer)
    refreshTimer = null
  }
})
</script>

<template>
  <section id="page-history" class="space-y-3">
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
        class="flex shrink-0 cursor-pointer items-center justify-center rounded-lg border border-on-solid/5 bg-surface-raised/80 p-2 text-text-secondary transition-all hover:bg-brand-strong/30 hover:text-on-solid active:scale-90"
        :aria-busy="isRefreshing"
        @click="refreshHistory"
      >
        <i class="fa-solid fa-arrows-rotate text-xs" :class="{ 'animate-spin': isRefreshing }"></i>
      </button>
    </div>

    <div
      class="flex items-center gap-1.5 rounded-xl border border-on-solid/5 bg-surface-sunken/50 px-3 py-1.5 text-[11px] text-text-muted"
    >
      <i class="fa-solid fa-circle-info text-xs text-brand"></i>
      <span>{{ t('history.recentHint', { count: RECENT_MATCH_LIMIT }) }}</span>
    </div>

    <div id="historyList" class="space-y-2">
      <MatchHistoryCard
        v-for="match in filteredMatches"
        :key="match.id"
        :match="match"
        @select="history.openMatchDetail"
      />
    </div>
  </section>
</template>
