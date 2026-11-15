<script setup lang="ts">
import { useGameInfo } from '@/composables/useGameInfo'
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import SettlementLayoutToggle from './components/SettlementLayoutToggle.vue'
import RedPacketNotice from '@/features/match-detail/components/RedPacketNotice.vue'
import SettlementRanking from '@/features/match-detail/components/SettlementRanking.vue'
import SettlementTeamSection from '@/features/match-detail/components/SettlementTeamSection.vue'
import { isRuntimeFlow } from '@/services/runtime-source'
import { captureAndDeliverScreenshot } from '@/services/image.service'
import { useUiStore } from '@/stores/ui'
import { useFeedbackStore } from '@/stores/feedback'
import { useConnectionStore } from '@/stores/connection'
import { useHistoryStore } from '@/stores/history'
import { useRulesStore } from '@/stores/rules'
import { useSettlementStore } from '@/stores/settlement'
import { SCORE_RULE_NAME_KEYS } from '@/i18n/labels'
import { formatDuration } from '@/shared/lib/history-presentation'
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
const live = computed(() => settlement.snapshot)
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
  () => connection.canReadAccountData && active.value && request.value !== null,
)
const isCurrentPostGame = computed(() => {
  const flow = connection.gameflowSnapshot
  return (
    canLoad.value &&
    flow &&
    isRuntimeFlow(flow) &&
    flow.connected &&
    !flow.code &&
    flow.session?.gameId === target.value?.gameId &&
    flow.phase === flow.session?.phase &&
    ['waiting_for_stats', 'pre_end_of_game', 'end_of_game'].includes(flow.session?.phase ?? '')
  )
})
const retryScope = computed(() => (canLoad.value ? JSON.stringify(request.value) : null))
const retries = ref(0)
const MAX_AUTO_RETRIES = 4
const canAutoRetry = computed(
  () =>
    isCurrentPostGame.value &&
    (settlement.status === 'pending' ||
      (settlement.status === 'error' &&
        ['lcu.timeout', 'lcu.connection_refused'].includes(settlement.errorCode ?? ''))),
)
function loadCurrent() {
  if (canLoad.value && request.value) void settlement.load(request.value, !!isCurrentPostGame.value)
}
function reload() {
  retries.value = 0
  loadCurrent()
}
onMounted(() => {
  watch(isCurrentPostGame, (value) => settlement.setPostGameContext(!!value), {
    immediate: true,
    flush: 'sync',
  })
  watch(
    retryScope,
    () => {
      retries.value = 0
      if (canLoad.value) loadCurrent()
      else settlement.clear()
    },
    { immediate: true, flush: 'sync' },
  )
  watch(
    [retryScope, canAutoRetry, () => settlement.status, () => settlement.errorCode],
    ([scope, retryable], _, onCleanup) => {
      if (!scope || !retryable || retries.value >= MAX_AUTO_RETRIES) return
      const timer = setTimeout(() => {
        if (retryScope.value !== scope || !canAutoRetry.value) return
        retries.value++
        loadCurrent()
      }, 2000)
      onCleanup(() => clearTimeout(timer))
    },
    { flush: 'sync' },
  )
})
const recoveryText = computed(() => {
  if (canAutoRetry.value)
    return t(
      retries.value >= MAX_AUTO_RETRIES
        ? 'matchDetail.retryExhausted'
        : 'matchDetail.retryScheduled',
    )
  if (live.value?.rankingStatus === 'missing_damage') return t('matchDetail.damageUnavailable')
  return null
})
const hasData = computed(() => live.value !== null)
const gameInfo = useGameInfo(live, () => live.value?.accountKey)
const queueLabel = computed(() => (live.value ? gameInfo.value.gameTypeLabel : ''))
const duration = computed(() => (live.value ? formatDuration(live.value.durationSeconds) : ''))
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
    case 'lcu.size_record_invalid':
      return t('damageSize.recordInvalid')
    case 'lcu.size_storage_failed':
      return t('damageSize.storageFailed')
    case 'lcu.size_random_failed':
      return t('damageSize.randomFailed')
    case 'lcu.settlement_pending':
      return t('matchDetail.pending')
    case 'lcu.settlement_unavailable':
      return t('matchDetail.unavailable')
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
  ui.setActiveTab('history')
}

const layout = ref<SettlementLayout>('group')
const isCopying = ref(false)
const screenshotRef = ref<HTMLElement | null>(null)

const players = computed(() =>
  live.value ? settlementPlayers(live.value, (id) => t('matchDetail.unknownPlayer', { id })) : [],
)
const sizeResult = computed(() => live.value?.damageSize)
const sizeOutcome = computed(() => sizeResult.value?.outcome ?? null)
const redPackets = computed(() => {
  const size = sizeResult.value
  if (size) {
    if (size.status !== 'ready' && size.status !== 'conflict') return null
    const senders = new Set(size.redPacketPlayerIds ?? [])
    const entries = size.participants
      .filter((player) => senders.has(player.id))
      .map((player) => player.nickname ?? t('matchDetail.unknownPlayer', { id: player.id }))
    return {
      entries,
      quota: undefined,
      notice: size.status === 'conflict' ? t('damageSize.conflict') : null,
    }
  }
  const result = live.value ? redPacketSelection(live.value) : null
  if (!result) return null
  return {
    quota: result.quota,
    notice: null,
    entries: result.entries.map(
      (player) => player.nickname ?? t('matchDetail.unknownPlayer', { id: player.id }),
    ),
  }
})
const packetStatus = computed(() => {
  if (redPackets.value) return null
  if (sizeResult.value) return t(`damageSize.${sizeResult.value.reason ?? 'pending'}`)
  return rankNote.value ?? t('matchDetail.redPacketCountUnsupported')
})
const teams = computed(() => {
  const ids = [...new Set(players.value.map((player) => player.teamId))]
  const order = (id: number) => (id === 200 ? 0 : id === 100 ? 1 : 2)
  return ids
    .sort((left, right) => order(left) - order(right))
    .map((id) => {
      const members = players.value.filter((player) => player.teamId === id)
      const sourceMembers = live.value?.players.filter((player) => player.teamId === id) ?? []
      const win = sourceMembers[0]?.win
      return {
        id,
        side: members[0]?.team ?? undefined,
        players: members,
        win: sourceMembers.every((player) => player.win === win) ? win : undefined,
      }
    })
})
const globalPlayers = computed(() => {
  if (sizeResult.value) {
    const order = { big: 0, small: 1 }
    return players.value
      .filter((player) => player.sizeResult !== undefined)
      .sort(
        (left, right) =>
          (left.sizeResult?.group ? order[left.sizeResult.group] : 2) -
          (right.sizeResult?.group ? order[right.sizeResult.group] : 2),
      )
  }
  return players.value
    .filter((player) => live.value?.rankingStatus !== 'ready' || player.rank !== null)
    .sort((left, right) => (left.rank ?? 0) - (right.rank ?? 0))
})
let copyGeneration = 0
let disposed = false
watch(
  [active, live, retryScope, layout, () => connection.canReadAccountData],
  () => {
    copyGeneration++
    isCopying.value = false
  },
  { flush: 'sync' },
)
onUnmounted(() => {
  disposed = true
  copyGeneration++
  settlement.clear()
})

async function copyScreenshot() {
  if (isCopying.value || !hasData.value || !active.value) return

  const target = screenshotRef.value
  if (!target) {
    feedback.notify(t('toast.screenshotMissing'), 'error')
    return
  }

  const token = ++copyGeneration
  const captured = live.value
  const scope = retryScope.value
  const capturedLayout = layout.value
  function isCurrent() {
    return (
      !disposed &&
      token === copyGeneration &&
      active.value &&
      hasData.value &&
      screenshotRef.value === target &&
      live.value === captured &&
      layout.value === capturedLayout &&
      canLoad.value &&
      !settlement.isLoading &&
      retryScope.value === scope &&
      captured !== null &&
      captured.accountKey === request.value?.accountKey &&
      captured.id === request.value?.gameId
    )
  }
  isCopying.value = true
  try {
    const result = await captureAndDeliverScreenshot(target, {
      fileNamePrefix: t('matchDetail.fileNamePrefix'),
      beforeDeliver: isCurrent,
    })
    if (!isCurrent()) return
    feedback.notify(
      result.status === 'copied' ? t('toast.screenshotCopied') : t('toast.screenshotDownloaded'),
      'success',
    )
  } catch {
    if (isCurrent()) feedback.notify(t('toast.screenshotFailed'), 'error')
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
            :aria-label="t('matchDetail.backHistory')"
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
          <span class="max-w-full truncate" :title="queueLabel">
            <span class="sr-only">{{ t('gameInfo.gameType') }}</span
            >{{ queueLabel }}
          </span>
          <span
            class="inline-flex shrink-0 items-center gap-1.5 tabular-nums"
            role="img"
            :aria-label="t('history.duration', { duration })"
            :title="t('history.duration', { duration })"
          >
            <i class="fa-regular fa-clock" aria-hidden="true"></i>
            <span aria-hidden="true">{{ duration }}</span>
          </span>
        </div>
      </header>

      <p
        v-if="recoveryText"
        id="settlement-recovery-status"
        role="status"
        class="text-center text-sm text-text-muted"
      >
        {{ recoveryText }}
      </p>
      <p
        v-if="settlement.isLoading"
        role="status"
        class="py-12 text-center text-sm text-text-muted"
      >
        {{ t('matchDetail.loading') }}
      </p>
      <div
        v-else-if="settlement.errorCode"
        :role="settlement.status === 'pending' ? 'status' : 'alert'"
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
        {{ t(connection.canReadAccountData ? 'matchDetail.selectMatch' : 'history.connectFirst') }}
      </p>
      <template v-else>
        <button
          v-if="
            live?.rankingStatus === 'missing_friends' ||
            live?.rankingStatus === 'missing_damage' ||
            live?.damageSize?.status === 'pending' ||
            live?.damageSize?.status === 'unsupported'
          "
          type="button"
          class="rounded-lg border border-on-solid/10 px-3 py-1.5 text-xs text-brand-light"
          @click="reload"
        >
          {{
            t(
              live?.rankingStatus === 'missing_friends'
                ? 'matchDetail.retryFriends'
                : 'history.retry',
            )
          }}
        </button>
        <div
          id="screenshot-area"
          ref="screenshotRef"
          data-screenshot-root
          class="space-y-3 rounded-xl border border-on-solid/5 bg-shell p-3"
        >
          <RedPacketNotice
            data-red-packet
            :entries="redPackets?.entries ?? []"
            :quota="redPackets?.quota"
            :preview="!lockedRule"
            :status="packetStatus"
            :notice="redPackets?.notice"
          >
            <template #outcome>
              <div
                v-if="luckyDigit !== null || sizeOutcome"
                id="settlement-outcome"
                class="flex shrink-0 items-center gap-1 rounded-md bg-brand-strong/25 px-2 py-0.5 text-[11px] text-brand-soft"
              >
                <i class="fa-solid fa-dice" aria-hidden="true"></i>
                <span>{{
                  t(luckyDigit !== null ? 'matchDetail.luckyDrawLabel' : 'damageSize.outcome')
                }}</span>
                <strong
                  class="min-w-4 text-center font-ink text-sm tabular-nums"
                  :class="
                    sizeOutcome === 'big'
                      ? 'text-danger-light'
                      : sizeOutcome === 'small'
                        ? 'text-info-light'
                        : 'text-on-solid'
                  "
                  >{{ luckyDigit ?? (sizeOutcome ? t(`damageSize.${sizeOutcome}`) : '') }}</strong
                >
              </div>
            </template>
          </RedPacketNotice>
          <div
            class="glass-card overflow-hidden rounded-2xl border border-on-solid/5 screenshot-mode"
          >
            <div class="border-b border-on-solid/5 bg-surface-sunken/50 p-2">
              <SettlementLayoutToggle v-model="layout" />
              <p
                v-if="connection.isPreview || !lockedRule"
                class="px-2 pt-2 text-[11px] text-text-muted"
              >
                {{ t(connection.isPreview ? 'matchDetail.demo' : 'rules.previewOnly') }}
              </p>
            </div>
            <div v-if="layout === 'group'" id="layout-group" class="space-y-3 py-3">
              <SettlementTeamSection
                v-for="team in teams"
                :key="team.id"
                :team-id="team.id"
                :side="team.side"
                :players="team.players"
                :win="team.win"
              />
            </div>
            <SettlementRanking
              v-else
              id="layout-global"
              :players="globalPlayers"
              :show-rank="!sizeResult"
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
