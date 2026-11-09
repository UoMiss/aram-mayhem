<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import SettlementPlayerRow from './SettlementPlayerRow.vue'
import type { SettlementLayout, SettlementPlayer } from '@/types/match-detail'
import type { SizeParticipant } from '@/types/settlement-api'
defineProps<{
  participant: SizeParticipant
  player: SettlementPlayer
  layout: SettlementLayout
  finalized: boolean
  sending: boolean
}>()
const { t } = useI18n({ useScope: 'global' })
</script>
<template>
  <SettlementPlayerRow
    :player="player"
    :layout="layout"
    role="listitem"
    :show-rank="false"
    :highlight-team="player.teamId === 100 || player.teamId === 200"
  >
    <template #result>
      <div class="w-[54px] shrink-0 break-all text-right font-mono text-xs">
        <p
          v-if="participant.group"
          class="text-xs font-bold"
          :class="participant.group === 'big' ? 'text-danger-light' : 'text-info-light'"
        >
          {{ t(`damageSize.${participant.group}`) }}
          <span class="font-ink">{{ participant.damage?.slice(-1) }}</span>
        </p>
        <p
          class="text-[10px]"
          :class="finalized && sending ? 'text-danger-light' : 'text-text-muted'"
        >
          {{
            t(!finalized ? 'damageSize.unknown' : sending ? 'damageSize.send' : 'damageSize.exempt')
          }}
        </p>
      </div>
    </template>
  </SettlementPlayerRow>
</template>
