<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import RedPacketNotice from '@/features/match-detail/components/RedPacketNotice.vue'
import SettlementRanking from '@/features/match-detail/components/SettlementRanking.vue'
import SettlementTeamSection from '@/features/match-detail/components/SettlementTeamSection.vue'
import { MATCH_DETAIL_FIXTURE } from '@/mocks/match-detail'
import { captureAndDeliverScreenshot } from '@/services/image.service'
import { useAppStore } from '@/stores/app'
import type { SettlementLayout } from '@/types/match-detail'

const app = useAppStore()
const { t } = useI18n({ useScope: 'global' })
const fixture = MATCH_DETAIL_FIXTURE

const layout = ref<SettlementLayout>('group')
const isCopying = ref(false)
const screenshotRef = ref<HTMLElement | null>(null)

const redPlayers = computed(() => fixture.players.filter((player) => player.team === 'red'))
const bluePlayers = computed(() => fixture.players.filter((player) => player.team === 'blue'))

/** 全局排行保留原始 rank 顺序，不按评分重新排序。 */
const globalPlayers = computed(() =>
  [...fixture.players].sort((left, right) => left.rank - right.rank),
)

function layoutButtonClass(target: SettlementLayout): string {
  const base = 'flex-1 py-2 text-xs font-bold rounded-lg transition-all cursor-pointer'
  return layout.value === target
    ? `${base} bg-purple-600 text-white shadow-md shadow-purple-600/30`
    : `${base} text-slate-400 hover:text-white`
}

async function copyScreenshot() {
  if (isCopying.value) return

  const target = screenshotRef.value
  if (!target) {
    app.notify(t('toast.screenshotMissing'), 'error')
    return
  }

  isCopying.value = true
  try {
    const result = await captureAndDeliverScreenshot(target, {
      fileNamePrefix: t('matchDetail.fileNamePrefix'),
    })
    app.notify(
      result.status === 'copied' ? t('toast.screenshotCopied') : t('toast.screenshotDownloaded'),
      'success',
    )
  } catch {
    app.notify(t('toast.screenshotFailed'), 'error')
  } finally {
    isCopying.value = false
  }
}
</script>

<template>
  <section id="page-match-detail" class="space-y-3">
    <div class="flex items-center gap-3">
      <button
        type="button"
        :aria-label="t('common.backHome')"
        class="flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg border border-white/5 bg-slate-800/80 text-slate-300 transition-all hover:bg-purple-600/30 active:scale-90"
        @click="app.setActiveTab('home')"
      >
        <i class="fa-solid fa-chevron-left text-sm"></i>
      </button>
      <h2 class="text-base font-bold text-white">{{ t('matchDetail.title') }}</h2>
      <div class="ml-auto flex items-center gap-1.5 text-[10px] text-slate-400">
        <span class="rounded-md border border-white/5 bg-slate-800/60 px-2 py-1">
          {{ fixture.queueLabel }}
        </span>
        <span
          class="flex items-center gap-1 rounded-md border border-white/5 bg-slate-800/60 px-2 py-1"
        >
          <i class="fa-regular fa-clock text-[9px]"></i>
          {{ fixture.duration }}
        </span>
      </div>
    </div>

    <div
      id="screenshot-area"
      ref="screenshotRef"
      data-screenshot-root
      class="space-y-3 rounded-xl border border-white/5 bg-[#0c0b14] p-3"
    >
      <RedPacketNotice :entries="fixture.redPacket.entries" />

      <div class="glass-card overflow-hidden rounded-2xl border border-white/5 screenshot-mode">
        <div class="border-b border-white/5 bg-slate-900/50 p-2">
          <div class="flex rounded-xl border border-white/5 bg-slate-950/50 p-1">
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
              <i class="fa-solid fa-ranking-star mr-1"></i> {{ t('matchDetail.global') }}
            </button>
          </div>
        </div>

        <div v-show="layout === 'group'" id="layout-group" class="space-y-3 p-3">
          <SettlementTeamSection side="red" :players="redPlayers" />
          <SettlementTeamSection side="blue" :players="bluePlayers" />
        </div>

        <SettlementRanking
          v-show="layout === 'global'"
          id="layout-global"
          :players="globalPlayers"
        />
      </div>
    </div>

    <div class="flex justify-center pt-2 pb-6">
      <button
        id="copyBtn"
        type="button"
        :disabled="isCopying"
        :aria-busy="isCopying"
        class="flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-purple-500/30 bg-[#1a1625] px-6 py-2.5 text-sm font-bold tracking-wide text-purple-100 shadow-[0_0_20px_rgba(168,85,247,0.15)] transition-all hover:border-purple-400/50 hover:bg-[#252035] hover:shadow-[0_0_25px_rgba(168,85,247,0.25)] active:scale-[0.98]"
        :class="{ 'cursor-not-allowed opacity-70': isCopying }"
        @click="copyScreenshot"
      >
        <i
          :class="
            isCopying
              ? 'fa-solid fa-spinner fa-spin text-base'
              : 'fa-regular fa-copy text-base text-purple-400'
          "
        ></i>
        <span>{{ isCopying ? t('common.generating') : t('matchDetail.copyScreenshot') }}</span>
      </button>
    </div>
  </section>
</template>
