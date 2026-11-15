<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { HOME_ROOM_PHASE_KEYS, SCORE_RULE_NAME_KEYS } from '@/i18n/labels'
import { useConnectionStore } from '@/stores/connection'
import { useHistoryStore } from '@/stores/history'
import { useHomeStore } from '@/stores/home'
import { useMatchRulesStore } from '@/stores/match-rules'
import { useRulesStore } from '@/stores/rules'
import RecentMatchCard from './components/RecentMatchCard.vue'
import { useHomeData } from './useHomeData'
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
const roomPhase = computed(() => home.homeView.roomPhase)
const roomPhaseLabel = computed(() => {
  const phase = roomPhase.value
  if (phase === 'none') return t('home.noMatch')
  return phase ? t(HOME_ROOM_PHASE_KEYS[phase]) : t('home.statusUnavailable')
})
const errorText = computed(() =>
  t(
    home.errorCode === 'lcu.not_logged_in'
      ? 'home.loginRequired'
      : home.errorCode === 'lcu.account_changed'
        ? 'home.accountChanged'
        : 'home.loadFailed',
  ),
)
const recentMatches = computed<readonly HomeRecentMatch[]>(() =>
  recent.value.status === 'ready' ? recent.value.entries : [],
)
function openRecent(matchId: string) {
  if (recent.value.status === 'ready' && home.snapshot && connection.canReadAccountData)
    history.openLiveSettlement(matchId, home.snapshot.accountKey)
}
</script>

<template>
  <section id="page-home" class="flex flex-col gap-5 pb-3">
    <div class="overflow-hidden rounded-2xl border border-brand/30 bg-card">
      <section
        :aria-label="t('home.currentAccount')"
        :aria-busy="home.isLoading"
        class="flex min-h-16 flex-col justify-center border-b border-brand/20 px-4 py-3 min-[400px]:px-5"
      >
        <p v-if="home.isLoading && !home.snapshot" role="status" class="text-sm text-text-muted">
          {{ t('home.loading') }}
        </p>
        <div v-else-if="home.errorCode" role="alert" class="flex flex-wrap items-center gap-2">
          <p class="text-sm text-danger-light">{{ errorText }}</p>
          <button
            type="button"
            class="cursor-pointer rounded px-1 py-1 text-xs font-medium text-brand-light underline focus-visible:outline-2 focus-visible:outline-ring"
            @click="refresh"
          >
            {{ t('history.retry') }}
          </button>
        </div>
        <div v-else class="space-y-0.5">
          <p class="text-base leading-snug font-semibold break-words text-text-soft">
            {{ home.homeView.summonerName ?? t('home.nameUnavailable') }}
          </p>
          <p v-if="home.snapshot?.summonerLevel != null" class="text-xs text-text-muted">
            {{ t('home.level', { level: home.snapshot.summonerLevel }) }}
          </p>
        </div>
      </section>

      <section
        aria-labelledby="home-current-match"
        class="bg-linear-to-br from-brand-surface/40 to-card px-4 py-4 min-[400px]:px-5"
      >
        <div class="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
          <h2 id="home-current-match" class="text-xs font-semibold tracking-wide text-brand-light">
            {{ t('home.currentMatch') }}
          </h2>
          <span v-if="connection.isPreview" class="text-[11px] text-text-muted">
            {{ t('connection.demoData') }}
          </span>
        </div>
        <p
          class="mt-1 flex items-center gap-2.5 text-2xl leading-tight font-bold text-on-solid min-[400px]:text-[26px]"
          role="status"
        >
          <span
            v-if="roomPhase && roomPhase !== 'none' && roomPhase !== 'unknown'"
            class="size-2 shrink-0 rounded-full bg-brand ring-4 ring-brand/15"
            aria-hidden="true"
          ></span>
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
        <dl class="mt-4 grid grid-cols-2 gap-x-3 gap-y-2 min-[400px]:grid-cols-3">
          <div class="min-w-0 space-y-0.5">
            <dt class="text-xs text-text-muted">{{ t('gameInfo.map') }}</dt>
            <dd class="text-sm font-semibold break-words text-text-soft">
              {{ home.gameInfo.mapLabel }}
            </dd>
          </div>
          <div class="min-w-0 space-y-0.5">
            <dt class="text-xs text-text-muted">{{ t('gameInfo.gameType') }}</dt>
            <dd class="text-sm font-semibold break-words text-text-soft">
              {{ home.gameInfo.gameTypeLabel }}
            </dd>
          </div>
          <div class="col-span-2 min-w-0 space-y-0.5 min-[400px]:col-span-1">
            <dt class="text-xs text-text-muted">
              {{ t(currentMatch ? 'home.lockedRule' : 'home.scoreRule') }}
            </dt>
            <dd id="home-rule-text" class="text-sm font-semibold break-words text-text-soft">
              {{ ruleLabel }}
            </dd>
          </div>
        </dl>
      </section>
    </div>

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
