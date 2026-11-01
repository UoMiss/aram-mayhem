<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { PLAYER_RELATION_KEYS, STAT_LABEL_KEYS, TEAM_BADGE_KEYS } from '@/i18n/labels'
import type { SettlementLayout, SettlementPlayer, StatTone } from '@/types/match-detail'

const { t } = useI18n({ useScope: 'global' })

const props = defineProps<{
  player: SettlementPlayer
  layout: SettlementLayout
}>()

const toneClasses: Record<StatTone, { bar: string }> = {
  rose: { bar: 'bg-rose-500' },
  amber: { bar: 'bg-amber-500' },
  emerald: { bar: 'bg-emerald-500' },
}

const teamTone = computed(() =>
  props.player.team === 'blue'
    ? {
        border: 'border-l-cyan-500',
        tint: 'bg-cyan-500/[0.02] hover:bg-cyan-500/[0.05]',
        score: 'text-cyan-400',
        badge: 'badge-blue',
      }
    : {
        border: 'border-l-rose-500',
        tint: 'bg-rose-500/[0.02] hover:bg-rose-500/[0.05]',
        score: 'text-rose-500',
        badge: 'badge-red',
      },
)

const kdaLabel = computed(
  () => `${props.player.kda.kills} / ${props.player.kda.deaths} / ${props.player.kda.assists}`,
)

const relationTag = computed(() => ({
  label: t(PLAYER_RELATION_KEYS[props.player.relation]),
  className:
    props.player.relation === 'self' ? 'bg-amber-600/80 text-white' : 'bg-slate-700 text-slate-300',
}))
</script>

<template>
  <div
    :data-player-id="player.id"
    :data-layout="layout"
    class="flex items-center border-b border-white/5 px-4 py-3"
    :class="
      layout === 'group'
        ? 'last:border-0'
        : ['border-l-4 transition-colors last:border-b-0', teamTone.border, teamTone.tint]
    "
  >
    <div class="mr-3 flex w-[46px] shrink-0 flex-col items-center">
      <div class="relative h-11 w-11">
        <img
          :src="player.championImage"
          :alt="player.champion"
          class="h-full w-full rounded-full border-2 border-slate-700 object-cover"
        />
        <div
          class="absolute -right-1 -bottom-1 rounded-full border border-slate-600 bg-slate-900 px-1.5 text-[9px] text-white"
        >
          {{ player.level }}
        </div>
      </div>
      <div class="player-rank" :class="`rank-${player.rank}`">#{{ player.rank }}</div>
    </div>

    <div class="flex-1 overflow-hidden pr-2">
      <div class="mb-1 flex items-center gap-2">
        <span class="truncate text-sm font-medium text-slate-200">{{ player.nickname }}</span>

        <span
          v-if="layout === 'group'"
          class="shrink-0 rounded px-1 text-[10px]"
          :class="relationTag.className"
        >
          {{ relationTag.label }}
        </span>
        <span v-else class="shrink-0 rounded px-1.5 py-0.5 text-[10px]" :class="teamTone.badge">
          {{ t(TEAM_BADGE_KEYS[player.team]) }}
        </span>
      </div>

      <div class="mb-1.5 text-sm font-bold text-white">{{ kdaLabel }}</div>

      <div class="grid grid-cols-3 gap-2">
        <div v-for="stat in player.stats" :key="stat.key" class="w-full">
          <div class="flex justify-between text-[10px] text-slate-400">
            <span>{{ t(STAT_LABEL_KEYS[stat.key]) }}</span>
            <span>{{ stat.value }}</span>
          </div>
          <div class="stat-bar-bg">
            <div
              class="stat-bar"
              :class="toneClasses[stat.tone].bar"
              :style="{ width: `${stat.percent}%` }"
            ></div>
          </div>
        </div>
      </div>
    </div>

    <div class="w-[45px] shrink-0 text-right font-mono text-xl font-black" :class="teamTone.score">
      {{ player.score.toFixed(1) }}
    </div>
  </div>
</template>
