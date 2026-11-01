<script setup lang="ts">
import SettlementPlayerRow from '@/features/match-detail/components/SettlementPlayerRow.vue'
import type { SettlementPlayer } from '@/types/match-detail'

defineProps<{ players: readonly SettlementPlayer[] }>()
</script>

<template>
  <div data-layout-view="global">
    <SettlementPlayerRow
      v-for="player in players"
      :key="player.id"
      :player="player"
      layout="global"
    />
  </div>
</template>
