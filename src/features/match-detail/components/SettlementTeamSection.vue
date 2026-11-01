<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { TEAM_TITLE_KEYS } from '@/i18n/labels'
import SettlementPlayerRow from '@/features/match-detail/components/SettlementPlayerRow.vue'
import type { SettlementPlayer, TeamSide } from '@/types/match-detail'

const props = defineProps<{
  side: TeamSide
  players: readonly SettlementPlayer[]
}>()
const { t } = useI18n({ useScope: 'global' })

const teamTone = computed(() =>
  props.side === 'blue'
    ? {
        border: 'border-l-cyan-500',
        header: 'bg-cyan-500/10',
        title: 'text-cyan-400',
      }
    : {
        border: 'border-l-rose-500',
        header: 'bg-rose-500/10',
        title: 'text-rose-400',
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
    class="overflow-hidden rounded-xl border border-white/5 border-l-4"
    :class="[teamTone.border, side === 'blue' ? 'mt-3' : '']"
  >
    <div
      class="flex items-center justify-between border-b border-white/5 px-4 py-2"
      :class="teamTone.header"
    >
      <span class="text-xs font-bold" :class="teamTone.title">{{ t(TEAM_TITLE_KEYS[side]) }}</span>
      <span class="text-xs font-bold tracking-wider text-slate-400">{{ totalKda }}</span>
    </div>

    <SettlementPlayerRow
      v-for="player in players"
      :key="player.id"
      :player="player"
      layout="group"
    />
  </div>
</template>
