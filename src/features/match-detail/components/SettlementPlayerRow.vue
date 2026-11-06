<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { PLAYER_RELATION_KEYS, STAT_LABEL_KEYS } from '@/i18n/labels'
import type { SettlementLayout, SettlementPlayer, StatTone } from '@/types/match-detail'

const { t } = useI18n({ useScope: 'global' })

const props = defineProps<{
  player: SettlementPlayer
  layout: SettlementLayout
}>()

const toneClasses: Record<StatTone, { bar: string }> = {
  rose: { bar: 'bg-danger-bright' },
  amber: { bar: 'bg-warning-bright' },
  emerald: { bar: 'bg-success-bright' },
}

const teamTone = computed(() =>
  props.player.team === 'blue'
    ? {
        border: 'border-l-info-bright',
        tint: 'bg-info-bright/[0.02] hover:bg-info-bright/[0.05]',
        score: 'text-info',
      }
    : {
        border: 'border-l-danger-bright',
        tint: 'bg-danger-bright/[0.02] hover:bg-danger-bright/[0.05]',
        score: 'text-danger-bright',
      },
)

const kdaLabel = computed(
  () => `${props.player.kda.kills} / ${props.player.kda.deaths} / ${props.player.kda.assists}`,
)

const relationTag = computed(() =>
  props.player.relation
    ? {
        label: t(PLAYER_RELATION_KEYS[props.player.relation]),
        className:
          props.player.relation === 'self'
            ? 'bg-warning-strong/80 text-on-solid'
            : 'bg-border-strong text-text-secondary',
      }
    : null,
)
</script>

<template>
  <div
    :data-player-id="player.id"
    :data-layout="layout"
    class="flex items-center border-b border-on-solid/5 px-4 py-3"
    :class="
      layout === 'group'
        ? 'last:border-0'
        : ['border-l-4 transition-colors last:border-b-0', teamTone.border, teamTone.tint]
    "
  >
    <div class="mr-3 flex w-[46px] shrink-0 flex-col items-center">
      <div class="relative h-11 w-11">
        <img
          v-if="player.championImage"
          :src="player.championImage"
          :alt="player.champion"
          class="h-full w-full rounded-full border-2 border-border-strong object-cover"
        />
        <span
          v-else
          role="img"
          :aria-label="player.champion"
          class="flex h-full w-full items-center justify-center rounded-full border border-border-strong text-xs text-text-muted"
          >?</span
        >
        <div
          v-if="player.level !== null"
          class="absolute -right-1 -bottom-1 rounded-full border border-text-faint bg-surface-sunken px-1.5 text-[9px] text-on-solid"
        >
          {{ player.level }}
        </div>
      </div>
      <div class="player-rank" :class="player.rank === null ? undefined : `rank-${player.rank}`">
        {{ player.rank === null ? '—' : `#${player.rank}` }}
      </div>
    </div>

    <div class="flex-1 overflow-hidden pr-2">
      <div class="mb-1 flex items-center gap-2">
        <span class="truncate text-sm font-medium text-text-soft">{{ player.nickname }}</span>

        <span
          v-if="relationTag"
          data-player-relation
          class="shrink-0 rounded px-1 text-[10px]"
          :class="relationTag.className"
        >
          {{ relationTag.label }}
        </span>
      </div>

      <div class="mb-1.5 text-sm font-bold text-on-solid">{{ kdaLabel }}</div>

      <div class="grid grid-cols-3 gap-2">
        <div v-for="stat in player.stats" :key="stat.key" class="w-full">
          <div class="flex justify-between text-[10px] text-text-muted">
            <span>{{ t(STAT_LABEL_KEYS[stat.key]) }}</span>
            <span class="break-all text-right">{{ stat.value ?? '—' }}</span>
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

    <div
      v-if="player.score !== null"
      class="w-[45px] shrink-0 text-right font-mono text-xl font-ink"
      :class="teamTone.score"
    >
      {{ player.score.toFixed(1) }}
    </div>
    <div
      v-else-if="player.ruleValue != null"
      class="w-[54px] shrink-0 break-all text-right font-mono text-xs"
      :class="teamTone.score"
      :title="t('matchDetail.ruleValue')"
    >
      {{ player.ruleValue }}
    </div>
  </div>
</template>
