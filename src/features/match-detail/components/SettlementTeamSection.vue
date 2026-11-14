<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { TEAM_BADGE_KEYS } from '@/i18n/labels'
import SettlementPlayerRow from '@/features/match-detail/components/SettlementPlayerRow.vue'
import type { SettlementPlayer, TeamSide } from '@/types/match-detail'

const props = withDefaults(
  defineProps<{
    win?: boolean
    side?: TeamSide
    teamId: number
    players: readonly SettlementPlayer[]
  }>(),
  { win: undefined, side: undefined },
)
const { t } = useI18n({ useScope: 'global' })
const title = computed(() =>
  props.side ? t(TEAM_BADGE_KEYS[props.side]) : t('matchDetail.team', { id: props.teamId }),
)
const heading = computed(() =>
  props.win === undefined
    ? title.value
    : `${title.value} · ${t(props.win ? 'history.results.victory' : 'history.results.defeat')}`,
)

const teamTone = computed(() =>
  !props.side
    ? {
        border: 'border-l-border-strong',
        header: 'bg-surface-sunken/50',
        title: 'text-text-secondary',
      }
    : props.side === 'blue'
      ? {
          border: 'border-l-info-bright',
          header: 'bg-info-bright/10',
          title: 'text-info',
        }
      : {
          border: 'border-l-danger-bright',
          header: 'bg-danger-bright/10',
          title: 'text-danger',
        },
)

const totalKda = computed(() => {
  const total = props.players.reduce(
    (acc, player) => ({
      kills: acc.kills + player.kda.kills,
      deaths: acc.deaths + player.kda.deaths,
      assists: acc.assists + player.kda.assists,
    }),
    { kills: 0, deaths: 0, assists: 0 },
  )
  return `${total.kills} / ${total.deaths} / ${total.assists}`
})
</script>

<template>
  <div
    :data-team-section="side ?? title"
    class="overflow-hidden rounded-xl border-y border-on-solid/5"
  >
    <div
      class="flex items-center justify-between border-b border-l-4 border-on-solid/5 px-2 py-2 min-[400px]:px-4"
      :class="[teamTone.header, teamTone.border]"
    >
      <span class="text-xs font-bold" :class="teamTone.title">{{ heading }}</span>
      <span class="text-xs font-bold tracking-wider text-text-muted">{{ totalKda }}</span>
    </div>

    <div role="list">
      <SettlementPlayerRow
        v-for="player in players"
        :key="player.id"
        :player="player"
        layout="group"
        role="listitem"
      />
    </div>
  </div>
</template>
