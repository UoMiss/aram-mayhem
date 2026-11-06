<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import RedPacketNotice from '@/features/match-detail/components/RedPacketNotice.vue'
import SettlementRanking from '@/features/match-detail/components/SettlementRanking.vue'
import SettlementTeamSection from '@/features/match-detail/components/SettlementTeamSection.vue'
import { MATCH_DETAIL_FIXTURE } from '@/mocks/match-detail'
import { captureAndDeliverScreenshot } from '@/services/image.service'
import { useUiStore } from '@/stores/ui'
import { useFeedbackStore } from '@/stores/feedback'
import { useConnectionStore } from '@/stores/connection'
import { useHistoryStore } from '@/stores/history'
import { useRulesStore } from '@/stores/rules'
import { useSettlementStore } from '@/stores/settlement'
import { MATCH_MODE_KEYS, SCORE_RULE_NAME_KEYS } from '@/i18n/labels'
import { formatDuration, matchMode } from '@/shared/lib/history-presentation'
import { redPacketSelection, settlementPlayers } from './settlement-presentation'
import type { SettlementRequest } from '@/types/settlement-api'
import type { SettlementLayout } from '@/types/match-detail'

const ui = useUiStore()
const feedback = useFeedbackStore()
const { t } = useI18n({ useScope: 'global' })
const connection = useConnectionStore()
const history = useHistoryStore()
const rules = useRulesStore()
const settlement = useSettlementStore()
const fixture = computed(() => (connection.isDesktopRuntime ? null : MATCH_DETAIL_FIXTURE))
const live = computed(() => (connection.isDesktopRuntime ? settlement.snapshot : null))
const active = computed(() => ui.activeTab === 'match-detail')
const target = computed(() => {
  if (history.liveSettlement) return history.liveSettlement
  if (!history.selectedMatchId || !history.accountKey) return null
  return { gameId: history.selectedMatchId, accountKey: history.accountKey }
})
const lockedRule = computed(() => live.value?.lockedRule === true)
const request = computed<SettlementRequest | null>(() =>
  target.value ? { ...target.value, rule: rules.currentRule } : null,
)
const canLoad = computed(
  () => connection.isRealLcuConnected && active.value && request.value !== null,
)
function reload() {
  if (canLoad.value && request.value) void settlement.load(request.value)
}
onMounted(() => {
  watch(
    [canLoad, request],
    () => {
      if (!connection.isDesktopRuntime) return
      if (canLoad.value) reload()
      else settlement.clear()
    },
    { immediate: true },
  )
  let retryGame: string | null = null
  let retries = 0
  watch(
    () => [history.liveSettlement?.gameId, settlement.errorCode, canLoad.value] as const,
    ([gameId, error, canRetry], _, onCleanup) => {
      if (gameId !== retryGame) {
        retryGame = gameId ?? null
        retries = 0
      }
      if (
        !gameId ||
        !canRetry ||
        !error ||
        retries >= 4 ||
        ![
          'lcu.http_status',
          'lcu.invalid_response',
          'lcu.timeout',
          'lcu.connection_refused',
          'lcu.settlement_failed',
        ].includes(error)
      )
        return
      const timer = setTimeout(() => {
        retries++
        reload()
      }, 2000)
      onCleanup(() => clearTimeout(timer))
    },
  )
})
const hasData = computed(() => live.value !== null || fixture.value !== null)
const queueLabel = computed(() =>
  live.value ? t(MATCH_MODE_KEYS[matchMode(live.value)]) : (fixture.value?.queueLabel ?? ''),
)
const duration = computed(() =>
  live.value ? formatDuration(live.value.durationSeconds) : (fixture.value?.duration ?? ''),
)
const ruleLabel = computed(() =>
  live.value?.appliedRule ? t(SCORE_RULE_NAME_KEYS[live.value.appliedRule]) : t('rules.none'),
)
const compactRuleLabel = computed(() =>
  live.value?.appliedRule ? t(`rules.${live.value.appliedRule}.shortName`) : t('rules.none'),
)
const luckyDigit = computed(() =>
  live.value?.appliedRule === 'lucky' ? live.value.luckyDigit : null,
)
const rankNote = computed(() => {
  switch (live.value?.rankingStatus) {
    case 'missing_lucky':
      return t('matchDetail.missingLucky')
    case 'missing_friends':
      return t('matchDetail.missingFriends')
    case 'missing_damage':
      return t('matchDetail.missingDamage')
    case 'no_rule':
      return t('matchDetail.noRule')
    default:
      return null
  }
})
const errorText = computed(() => {
  switch (settlement.errorCode) {
    case 'lcu.not_logged_in':
      return t('history.errors.login')
    case 'lcu.account_changed':
      return t('matchDetail.accountChanged')
    case 'lcu.invalid_response':
      return t('matchDetail.incomplete')
    default:
      return t('matchDetail.loadFailed')
  }
})
function goBack() {
  ui.setActiveTab(connection.isDesktopRuntime ? 'history' : 'home')
}

const layout = ref<SettlementLayout>('group')
const isCopying = ref(false)
const screenshotRef = ref<HTMLElement | null>(null)

const players = computed(() =>
  live.value
    ? settlementPlayers(live.value, (id) => t('matchDetail.unknownPlayer', { id }))
    : (fixture.value?.players ?? []),
)
const redPackets = computed(() => {
  const result = live.value ? redPacketSelection(live.value) : null
  if (!result) return null
  return {
    quota: result.quota,
    entries: result.entries.map((player) => ({
      rank: player.rank!,
      name: player.nickname ?? t('matchDetail.unknownPlayer', { id: player.id }),
    })),
  }
})
const redPlayers = computed(() => players.value.filter((player) => player.team === 'red'))
const bluePlayers = computed(() => players.value.filter((player) => player.team === 'blue'))
const redWin = computed(() => live.value?.players.find((player) => player.teamId === 200)?.win)
const isFriendsRanking = computed(
  () => live.value?.rankingStatus === 'ready' && !live.value.isCustom,
)
const blueWin = computed(() => live.value?.players.find((player) => player.teamId === 100)?.win)
const globalPlayers = computed(() =>
  players.value
    .filter((player) => live.value?.rankingStatus !== 'ready' || player.rank !== null)
    .sort((left, right) => (left.rank ?? 0) - (right.rank ?? 0)),
)
let copyGeneration = 0
watch([active, live], () => {
  copyGeneration++
  isCopying.value = false
})
onUnmounted(() => {
  copyGeneration++
  settlement.clear()
})

function layoutButtonClass(target: SettlementLayout): string {
  const base = 'flex-1 py-2 text-xs font-bold rounded-lg transition-all cursor-pointer'
  return layout.value === target
    ? `${base} bg-brand-strong text-on-solid shadow-md shadow-brand-strong/30`
    : `${base} text-text-muted hover:text-on-solid`
}

async function copyScreenshot() {
  if (isCopying.value || !hasData.value || !active.value) return

  const target = screenshotRef.value
  if (!target) {
    feedback.notify(t('toast.screenshotMissing'), 'error')
    return
  }

  const token = ++copyGeneration
  isCopying.value = true
  try {
    const result = await captureAndDeliverScreenshot(target, {
      fileNamePrefix: t('matchDetail.fileNamePrefix'),
    })
    if (token !== copyGeneration) return
    feedback.notify(
      result.status === 'copied' ? t('toast.screenshotCopied') : t('toast.screenshotDownloaded'),
      'success',
    )
  } catch {
    if (token === copyGeneration) feedback.notify(t('toast.screenshotFailed'), 'error')
  } finally {
    if (token === copyGeneration) isCopying.value = false
  }
}
</script>

<template>
  <section id="page-match-detail">
    <div class="space-y-3">
      <header class="flex items-center gap-2">
        <div class="flex shrink-0 items-center gap-2">
          <button
            type="button"
            :aria-label="
              t(connection.isDesktopRuntime ? 'matchDetail.backHistory' : 'common.backHome')
            "
            class="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-lg border border-on-solid/5 bg-surface-raised/80 text-text-secondary transition-all hover:bg-brand-strong/30 active:scale-90"
            @click="goBack"
          >
            <i class="fa-solid fa-chevron-left text-sm"></i>
          </button>
          <h2 class="text-base font-bold text-on-solid">
            {{ t('matchDetail.title') }}
          </h2>
        </div>
        <div
          v-if="hasData"
          id="settlement-meta"
          class="ml-auto flex min-w-0 flex-wrap items-center justify-end gap-1.5 text-[11px] whitespace-nowrap text-text-muted min-[400px]:text-xs [&>span]:rounded-full [&>span]:border [&>span]:border-on-solid/10 [&>span]:bg-surface-raised/60 [&>span]:px-2 [&>span]:py-1"
        >
          <span
            v-if="live"
            class="shrink-0 text-brand-light"
            :title="
              t(lockedRule ? 'matchDetail.lockedRule' : 'matchDetail.rule', { rule: ruleLabel })
            "
          >
            <span class="sr-only">
              {{
                t(lockedRule ? 'matchDetail.lockedRule' : 'matchDetail.rule', { rule: ruleLabel })
              }}
            </span>
            <span aria-hidden="true">{{ compactRuleLabel }}</span>
          </span>
          <span class="shrink-0">
            <span class="sr-only">{{ t('history.mode') }}</span
            >{{ queueLabel }}
          </span>
          <span class="shrink-0 tabular-nums">
            {{ t('history.duration', { duration }) }}
          </span>
        </div>
      </header>

      <p
        v-if="connection.isDesktopRuntime && settlement.isLoading"
        role="status"
        class="py-12 text-center text-sm text-text-muted"
      >
        {{ t('matchDetail.loading') }}
      </p>
      <div
        v-else-if="connection.isDesktopRuntime && settlement.errorCode"
        role="alert"
        class="glass-card space-y-3 rounded-xl p-5 text-center"
      >
        <p class="text-sm text-danger-light">{{ errorText }}</p>
        <button
          v-if="settlement.errorCode !== 'lcu.account_changed'"
          type="button"
          :disabled="!canLoad"
          class="rounded-lg bg-brand-strong px-4 py-2 text-xs text-on-solid"
          @click="reload"
        >
          {{ t('history.retry') }}
        </button>
        <button
          v-else
          type="button"
          class="rounded-lg bg-brand-strong px-4 py-2 text-xs text-on-solid"
          @click="goBack"
        >
          {{ t('matchDetail.backHistory') }}
        </button>
      </div>
      <p v-else-if="!hasData" role="status" class="py-12 text-center text-sm text-text-muted">
        {{ t(connection.isRealLcuConnected ? 'matchDetail.selectMatch' : 'history.connectFirst') }}
      </p>
      <template v-else>
        <button
          v-if="live?.rankingStatus === 'missing_friends'"
          type="button"
          class="rounded-lg border border-on-solid/10 px-3 py-1.5 text-xs text-brand-light"
          @click="reload"
        >
          {{ t('matchDetail.retryFriends') }}
        </button>
        <div
          id="screenshot-area"
          ref="screenshotRef"
          data-screenshot-root
          class="space-y-3 rounded-xl border border-on-solid/5 bg-shell p-3"
        >
          <div
            v-if="luckyDigit !== null"
            id="settlement-lucky-digit"
            class="flex items-center gap-3 rounded-xl border border-brand-bright/40 bg-linear-to-r from-brand-strong/25 to-surface-raised px-4 py-3"
          >
            <i class="fa-solid fa-dice text-xl text-brand-light" aria-hidden="true"></i>
            <span class="text-sm font-bold text-brand-soft">{{
              t('matchDetail.luckyDrawLabel')
            }}</span>
            <strong
              class="ml-auto grid size-12 place-items-center rounded-lg bg-brand-strong/35 font-ink text-3xl tabular-nums text-on-solid"
            >
              {{ luckyDigit }}
            </strong>
          </div>
          <RedPacketNotice v-if="fixture" :entries="fixture.redPacket.entries" />
          <RedPacketNotice
            v-else-if="redPackets"
            :entries="redPackets.entries"
            :quota="redPackets.quota"
            :preview="!lockedRule"
          />
          <div
            class="glass-card overflow-hidden rounded-2xl border border-on-solid/5 screenshot-mode"
          >
            <div class="border-b border-on-solid/5 bg-surface-sunken/50 p-2">
              <div class="flex rounded-xl border border-on-solid/5 bg-surface-base/50 p-1">
                <button
                  id="btn-layout-group"
                  type="button"
                  :aria-pressed="layout === 'group'"
                  :class="layoutButtonClass('group')"
                  @click="layout = 'group'"
                >
                  <i class="fa-solid fa-layer-group mr-1"></i> {{ t('matchDetail.group') }}
                </button>
                <button
                  id="btn-layout-global"
                  type="button"
                  :aria-pressed="layout === 'global'"
                  :class="layoutButtonClass('global')"
                  @click="layout = 'global'"
                >
                  <i class="fa-solid fa-ranking-star mr-1"></i>
                  {{
                    t(
                      live && live.rankingStatus !== 'ready'
                        ? 'matchDetail.allPlayers'
                        : isFriendsRanking
                          ? 'matchDetail.friendsRanking'
                          : 'matchDetail.global',
                    )
                  }}
                </button>
              </div>
              <div class="space-y-1 px-2 text-[11px] text-text-muted">
                <p v-if="fixture" class="pt-2">{{ t('matchDetail.demo') }}</p>
                <p v-else-if="!lockedRule" class="pt-2">{{ t('rules.previewOnly') }}</p>
                <p v-if="rankNote" class="pt-2">{{ rankNote }}</p>
                <p v-if="live?.rankingStatus === 'ready' && !redPackets" class="pt-2">
                  {{ t('matchDetail.redPacketCountUnsupported') }}
                </p>
              </div>
            </div>

            <div v-show="layout === 'group'" id="layout-group" class="space-y-3 p-3">
              <SettlementTeamSection side="red" :players="redPlayers" :win="redWin" />
              <SettlementTeamSection side="blue" :players="bluePlayers" :win="blueWin" />
            </div>

            <SettlementRanking
              v-show="layout === 'global'"
              id="layout-global"
              :players="globalPlayers"
            />
          </div>
        </div>
      </template>
    </div>

    <div v-if="hasData" class="mt-3 flex justify-center pt-2 pb-6">
      <button
        id="copyBtn"
        type="button"
        :disabled="isCopying"
        :aria-busy="isCopying"
        class="flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-brand-bright/30 bg-settlement px-6 py-2.5 text-sm font-bold tracking-wide text-brand-soft shadow-settlement transition-all hover:border-brand/50 hover:bg-settlement-raised hover:shadow-settlement-hover active:scale-[0.98]"
        :class="{ 'cursor-not-allowed opacity-70': isCopying }"
        @click="copyScreenshot"
      >
        <i
          :class="
            isCopying
              ? 'fa-solid fa-spinner fa-spin text-base'
              : 'fa-regular fa-copy text-base text-brand'
          "
        ></i>
        <span>{{ isCopying ? t('common.generating') : t('matchDetail.copyScreenshot') }}</span>
      </button>
    </div>
  </section>
</template>
