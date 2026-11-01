<script setup lang="ts">
import { computed, onUnmounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import MatchHistoryCard from '@/features/history/components/MatchHistoryCard.vue'
import { HISTORY_FILTER_KEYS } from '@/i18n/labels'
import { HISTORY_FILTERS } from '@/mocks/history'
import { useAppStore } from '@/stores/app'
import type { HistoryFilter } from '@/types/history'

const REFRESH_ANIMATION_MS = 800
const RECENT_MATCH_LIMIT = 20

const app = useAppStore()
const { t } = useI18n({ useScope: 'global' })
const isRefreshing = ref(false)
let refreshTimer: ReturnType<typeof setTimeout> | null = null

/** 筛选只改变展示集合，保持 MATCH_HISTORY 原始顺序。 */
const filteredMatches = computed(() => {
  if (app.historyFilter === 'all') return app.matchHistory
  return app.matchHistory.filter((match) => match.mode === app.historyFilter)
})

function filterLabel(filter: HistoryFilter): string {
  return t(HISTORY_FILTER_KEYS[filter])
}

function filterButtonClasses(filter: HistoryFilter): string {
  const base =
    'filter-btn px-4 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap cursor-pointer'
  return app.historyFilter === filter
    ? `${base} bg-purple-600 text-white shadow-md shadow-purple-600/30`
    : `${base} border border-white/5 bg-slate-800/80 text-slate-400 hover:text-white`
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
          :aria-pressed="app.historyFilter === filter"
          :class="filterButtonClasses(filter)"
          @click="app.setHistoryFilter(filter)"
        >
          {{ filterLabel(filter) }}
        </button>
      </div>

      <button
        type="button"
        :title="t('a11y.refreshHistory')"
        class="flex shrink-0 cursor-pointer items-center justify-center rounded-lg border border-white/5 bg-slate-800/80 p-2 text-slate-300 transition-all hover:bg-purple-600/30 hover:text-white active:scale-90"
        :aria-busy="isRefreshing"
        @click="refreshHistory"
      >
        <i class="fa-solid fa-arrows-rotate text-xs" :class="{ 'animate-spin': isRefreshing }"></i>
      </button>
    </div>

    <div
      class="flex items-center gap-1.5 rounded-xl border border-white/5 bg-slate-900/50 px-3 py-1.5 text-[11px] text-slate-400"
    >
      <i class="fa-solid fa-circle-info text-xs text-purple-400"></i>
      <span>{{ t('history.recentHint', { count: RECENT_MATCH_LIMIT }) }}</span>
    </div>

    <div id="historyList" class="space-y-2">
      <MatchHistoryCard
        v-for="match in filteredMatches"
        :key="match.id"
        :match="match"
        @select="app.openMatchDetail"
      />
    </div>
  </section>
</template>
