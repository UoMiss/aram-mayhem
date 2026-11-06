<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { TEAM_BADGE_KEYS, TEAM_TITLE_KEYS } from '@/i18n/labels'
import SettlementPlayerRow from '@/features/match-detail/components/SettlementPlayerRow.vue'
import type { SettlementPlayer, TeamSide } from '@/types/match-detail'

const props = defineProps<{
  win?: boolean
  side: TeamSide
  players: readonly SettlementPlayer[]
}>()
const { t } = useI18n({ useScope: 'global' })

const teamTone = computed(() =>
  props.side === 'blue'
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
    :data-team-section="side"
    class="overflow-hidden rounded-xl border border-on-solid/5 border-l-4"
    :class="[teamTone.border, side === 'blue' ? 'mt-3' : '']"
  >
    <div
      class="flex items-center justify-between border-b border-on-solid/5 px-4 py-2"
      :class="teamTone.header"
    >
      <span class="text-xs font-bold" :class="teamTone.title">{{
        win === undefined
          ? t(TEAM_TITLE_KEYS[side])
          : `${t(TEAM_BADGE_KEYS[side])} · ${t(win ? 'history.results.victory' : 'history.results.defeat')}`
      }}</span>
      <span class="text-xs font-bold tracking-wider text-text-muted">{{ totalKda }}</span>
    </div>

    <SettlementPlayerRow
      v-for="player in players"
      :key="player.id"
      :player="player"
      layout="group"
    />
  </div>
</template>
