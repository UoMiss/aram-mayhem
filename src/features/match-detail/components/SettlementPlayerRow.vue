<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { PLAYER_RELATION_KEYS, STAT_LABEL_KEYS } from '@/i18n/labels'
import type { SettlementLayout, SettlementPlayer, StatTone } from '@/types/match-detail'

const { t } = useI18n({ useScope: 'global' })

const props = withDefaults(
  defineProps<{
    player: SettlementPlayer
    layout: SettlementLayout
    showRank?: boolean
  }>(),
  { showRank: true },
)

const toneClasses: Record<StatTone, { bar: string }> = {
  rose: { bar: 'bg-danger-bright' },
  amber: { bar: 'bg-warning-bright' },
  emerald: { bar: 'bg-success-bright' },
}

const teamTone = computed(() =>
  props.player.team === null
    ? { border: 'border-l-transparent', tint: '' }
    : props.player.team === 'blue'
      ? {
          border: 'border-l-info-bright',
          tint: 'bg-info-bright/[0.02] hover:bg-info-bright/[0.05]',
        }
      : {
          border: 'border-l-danger-bright',
          tint: 'bg-danger-bright/[0.02] hover:bg-danger-bright/[0.05]',
        },
)

const resultValue = computed(() => {
  const { sizeResult, score, ruleValue } = props.player
  if (sizeResult) return sizeResult.group ? t(`damageSize.${sizeResult.group}`) : '—'
  return score?.toFixed(1) ?? ruleValue ?? '—'
})

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
    class="flex items-center border-b border-l-4 border-on-solid/5 px-2 py-3 transition-colors last:border-b-0 min-[400px]:px-4"
    :class="[teamTone.border, teamTone.tint]"
  >
    <div class="mr-2 flex min-h-[67px] w-[46px] shrink-0 flex-col items-center min-[400px]:mr-3">
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
          data-player-level
          class="absolute -right-1 -bottom-1 rounded-full border border-text-faint bg-surface-sunken px-1.5 text-[9px] text-on-solid"
        >
          {{ player.level }}
        </div>
      </div>
      <div
        v-if="layout === 'global' && showRank"
        class="player-rank"
        :class="player.rank === null ? undefined : `rank-${player.rank}`"
      >
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

      <div class="grid grid-cols-3 gap-1 min-[400px]:gap-2">
        <div v-for="stat in player.stats" :key="stat.key" class="w-full">
          <div
            class="flex flex-col text-[10px] text-text-muted min-[400px]:flex-row min-[400px]:justify-between"
          >
            <span>{{ t(STAT_LABEL_KEYS[stat.key]) }}</span>
            <span class="break-all min-[400px]:text-right">{{ stat.value ?? '—' }}</span>
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
      :data-player-result="layout === 'global' ? '' : undefined"
      class="w-11 shrink-0 text-right font-mono text-xs font-semibold text-on-solid tabular-nums min-[400px]:w-[54px]"
    >
      <p v-if="layout === 'global'" class="truncate" :title="resultValue">{{ resultValue }}</p>
    </div>
  </div>
</template>
