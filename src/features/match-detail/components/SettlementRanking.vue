<script setup lang="ts">
import SettlementPlayerRow from '@/features/match-detail/components/SettlementPlayerRow.vue'
import type { SettlementPlayer } from '@/types/match-detail'

defineProps<{ players: readonly SettlementPlayer[]; showRank: boolean }>()
</script>

<template>
  <div data-layout-view="global" role="list">
    <SettlementPlayerRow
      v-for="player in players"
      :key="player.id"
      :player="player"
      :show-rank="showRank"
      layout="global"
      role="listitem"
    />
  </div>
</template>
