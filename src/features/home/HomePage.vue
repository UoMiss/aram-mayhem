<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { HOME_GAME_MODE_KEYS, HOME_ROOM_PHASE_KEYS, SCORE_RULE_NAME_KEYS } from '@/i18n/labels'
import { useConnectionStore } from '@/stores/connection'
import { useHistoryStore } from '@/stores/history'
import { useHomeStore } from '@/stores/home'
import { useMatchRulesStore } from '@/stores/match-rules'
import { useRulesStore } from '@/stores/rules'
import RecentMatchCard from './components/RecentMatchCard.vue'
import { HOME_RECENT_MATCH_LIMIT, useHomeData } from './useHomeData'
import type { HomeRecentMatch } from './useHomeData'

const connection = useConnectionStore()
const history = useHistoryStore()
const home = useHomeStore()
const rules = useRulesStore()
const matchRules = useMatchRulesStore()
const { refresh, recent, refreshRecent } = useHomeData()
const { t } = useI18n({ useScope: 'global' })

const currentMatch = computed(() => {
  const gameId = connection.gameflowSnapshot?.session?.gameId
  const account = home.snapshot?.accountKey
  return gameId && account ? matchRules.find(account, gameId) : undefined
})
const displayedRule = computed(() =>
  currentMatch.value ? currentMatch.value.rule : rules.currentRule,
)
const ruleLabel = computed(() =>
  displayedRule.value ? t(SCORE_RULE_NAME_KEYS[displayedRule.value]) : t('rules.none'),
)
const memberCount = computed(() => home.lobby?.memberCount ?? home.liveGame?.memberCount)
const roomPhase = computed(() => home.homeView.roomPhase)
const roomPhaseLabel = computed(() => {
  const phase = roomPhase.value
  if (phase === 'none') return t('home.noMatch')
  return phase ? t(HOME_ROOM_PHASE_KEYS[phase]) : t('home.statusUnavailable')
})
const gameModeLabel = computed(() =>
  home.homeView.gameMode ? t(HOME_GAME_MODE_KEYS[home.homeView.gameMode]) : null,
)
const errorText = computed(() =>
  t(
    home.errorCode === 'lcu.not_logged_in'
      ? 'home.loginRequired'
      : home.errorCode === 'lcu.account_changed'
        ? 'home.accountChanged'
        : 'home.loadFailed',
  ),
)
const recentMatches = computed<readonly HomeRecentMatch[]>(() => {
  if (!connection.isDesktopRuntime) {
    return history.matchHistory.slice(0, HOME_RECENT_MATCH_LIMIT).map((match) => ({ match }))
  }
  return recent.value.status === 'ready' ? recent.value.entries : []
})

function openRecent(matchId: string) {
  if (!connection.isDesktopRuntime) {
    history.openMatchDetail(matchId)
  } else if (recent.value.status === 'ready' && home.snapshot && connection.isRealLcuConnected) {
    history.openLiveSettlement(matchId, home.snapshot.accountKey)
  }
}
</script>

<template>
  <section
    id="page-home"
    class="flex min-h-full flex-col justify-center gap-3 pb-3 min-[400px]:gap-4"
  >
    <section
      aria-labelledby="home-account"
      class="glass-card flex min-h-16 items-center gap-3 rounded-xl px-3 py-2.5"
      :aria-busy="home.isLoading"
    >
      <span class="grid size-9 shrink-0 place-items-center rounded-lg bg-brand/15 text-brand-light">
        <i class="fa-solid fa-user" aria-hidden="true"></i>
      </span>

      <div class="min-w-0 flex-1">
        <h2 id="home-account" class="text-[11px] font-medium text-text-muted">
          {{ t('home.currentAccount') }}
        </h2>
        <p
          v-if="home.isLoading && !home.snapshot"
          role="status"
          class="mt-0.5 text-xs text-text-muted"
        >
          {{ t('home.loading') }}
        </p>
        <div v-else-if="home.errorCode" role="alert" class="mt-0.5">
          <p class="text-xs text-danger-light">{{ errorText }}</p>
          <button
            type="button"
            class="mt-1 cursor-pointer text-xs text-brand-light underline"
            @click="refresh"
          >
            {{ t('history.retry') }}
          </button>
        </div>
        <div v-else class="mt-0.5 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <p class="break-all text-sm font-semibold text-text-soft">
            {{ home.homeView.summonerName ?? t('home.nameUnavailable') }}
          </p>
          <span
            v-if="home.snapshot?.summonerLevel != null"
            class="text-xs whitespace-nowrap text-text-muted"
          >
            {{ t('home.level', { level: home.snapshot.summonerLevel }) }}
          </span>
        </div>
      </div>

      <button
        v-if="connection.isRealLcuConnected && !home.errorCode"
        type="button"
        :aria-label="t('home.refresh')"
        :title="t('home.refresh')"
        :disabled="home.isLoading"
        class="grid size-9 shrink-0 cursor-pointer place-items-center rounded-lg border border-on-solid/10 text-brand-light hover:bg-brand/20 disabled:cursor-not-allowed disabled:opacity-50"
        @click="refresh"
      >
        <i class="fa-solid fa-arrows-rotate text-xs" aria-hidden="true"></i>
      </button>
    </section>

    <section
      aria-labelledby="home-current-match"
      class="overflow-hidden rounded-2xl border border-brand/30 bg-card"
    >
      <div
        class="bg-linear-to-br from-brand-surface/65 to-card px-4 py-3 min-[400px]:px-5 min-[400px]:py-4"
      >
        <div class="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
          <h2 id="home-current-match" class="text-xs font-semibold tracking-wide text-brand-light">
            {{ t('home.currentMatch') }}
          </h2>
          <span
            v-if="connection.isDesktopRuntime && roomPhase"
            class="flex items-center gap-1.5 rounded-full bg-brand/15 px-2 py-0.5 text-[11px] text-brand-pale"
          >
            <span class="size-1.5 rounded-full bg-brand-light" aria-hidden="true"></span>
            {{ t('home.liveBadge') }}
          </span>
          <span v-else-if="!connection.isDesktopRuntime" class="text-[11px] text-text-muted">
            {{ t('connection.demoData') }}
          </span>
        </div>
        <p class="mt-2 text-3xl font-bold tracking-wide text-on-solid" role="status">
          {{ roomPhaseLabel }}
        </p>
        <p
          v-if="home.readyCheckStatus"
          class="mt-1 text-xs text-text-secondary"
          role="status"
          aria-live="polite"
        >
          {{ t(`gameflow.readyCheck.${home.readyCheckStatus}`) }}
        </p>
      </div>

      <dl class="divide-y divide-on-solid/5 border-t border-brand/20 px-4 min-[400px]:px-5">
        <div class="flex items-baseline justify-between gap-3 py-2 min-[400px]:py-2.5">
          <dt class="flex shrink-0 items-center gap-2 text-xs text-text-muted">
            <i class="fa-solid fa-map w-4 text-center text-brand-light" aria-hidden="true"></i>
            {{ t('gameInfo.map') }}
          </dt>
          <dd class="min-w-0 break-words text-right text-sm font-semibold text-text-soft">
            {{ home.gameInfo.mapLabel }}
          </dd>
        </div>
        <div class="flex items-baseline justify-between gap-3 py-2 min-[400px]:py-2.5">
          <dt class="flex shrink-0 items-center gap-2 text-xs text-text-muted">
            <i class="fa-solid fa-gamepad w-4 text-center text-brand-light" aria-hidden="true"></i>
            {{ t('gameInfo.gameType') }}
          </dt>
          <dd class="min-w-0 break-words text-right text-sm font-semibold text-text-soft">
            {{ connection.isDesktopRuntime ? home.gameInfo.gameTypeLabel : gameModeLabel }}
          </dd>
        </div>
        <div
          v-if="memberCount != null"
          class="flex items-baseline justify-between gap-3 py-2 min-[400px]:py-2.5"
        >
          <dt class="flex shrink-0 items-center gap-2 text-xs text-text-muted">
            <i class="fa-solid fa-users w-4 text-center text-brand-light" aria-hidden="true"></i>
            {{ t(home.lobby ? 'home.roomSize' : 'home.gameSize') }}
          </dt>
          <dd class="text-right text-sm font-semibold tabular-nums text-text-soft">
            {{ t('home.peopleCount', { count: memberCount }) }}
          </dd>
        </div>
        <div class="flex items-baseline justify-between gap-3 py-2 min-[400px]:py-2.5">
          <dt class="flex shrink-0 items-center gap-2 text-xs text-text-muted">
            <i
              class="fa-solid fa-calculator w-4 text-center text-brand-light"
              aria-hidden="true"
            ></i>
            {{ t(currentMatch ? 'home.lockedRule' : 'home.scoreRule') }}
          </dt>
          <dd
            id="home-rule-text"
            class="min-w-0 break-words text-right text-sm font-semibold text-text-soft"
          >
            {{ ruleLabel }}
          </dd>
        </div>
      </dl>
    </section>

    <section aria-labelledby="home-recent-title" class="space-y-2">
      <h2 id="home-recent-title" class="text-xs font-semibold text-text-secondary">
        {{ t('home.recentMatches') }}
      </h2>
      <ul v-if="recentMatches.length" class="space-y-2">
        <li v-for="entry in recentMatches" :key="entry.match.id">
          <RecentMatchCard :match="entry.match" @open="openRecent(entry.match.id)" />
        </li>
      </ul>
      <div v-else class="glass-card rounded-xl p-3 text-xs text-text-muted">
        <div v-if="recent.status === 'error'" role="alert">
          <p class="text-danger-light">
            {{
              t(recent.code === 'lcu.account_changed' ? 'home.accountChanged' : 'home.recentFailed')
            }}
          </p>
          <button
            type="button"
            class="mt-1 cursor-pointer text-xs text-brand-light underline"
            @click="refreshRecent"
          >
            {{ t('history.retry') }}
          </button>
        </div>
        <p v-else role="status">
          {{
            t(
              recent.status === 'loading' || home.isLoading
                ? 'history.loading'
                : recent.status === 'empty'
                  ? 'home.recentEmpty'
                  : 'home.recentPending',
            )
          }}
        </p>
      </div>
    </section>
  </section>
</template>
