<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import RedPacketNotice from './RedPacketNotice.vue'
import DamageSizePlayerRow from './DamageSizePlayerRow.vue'
import SettlementTeamSection from './SettlementTeamSection.vue'
import SettlementLayoutToggle from './SettlementLayoutToggle.vue'
import type { SettlementLayout, SettlementPlayer, TeamSide } from '@/types/match-detail'
import type { DamageSizeResult } from '@/types/settlement-api'

const props = defineProps<{
  result: DamageSizeResult
  players: readonly SettlementPlayer[]
}>()
const layout = defineModel<SettlementLayout>('layout', { required: true })
const { t } = useI18n({ useScope: 'global' })
const finalized = computed(
  () => props.result.status === 'ready' || props.result.status === 'conflict',
)
const senderIds = computed(() => new Set(props.result.redPacketPlayerIds ?? []))
const senders = computed(() =>
  props.result.participants
    .filter((p) => senderIds.value.has(p.id))
    .map((p) => ({
      name: p.nickname ?? t('matchDetail.unknownPlayer', { id: p.id }),
      rank: null,
    })),
)
const rows = computed(() => {
  const players = new Map(props.players.map((p) => [p.id, p]))
  return props.result.participants.flatMap((participant) => {
    const player = players.get(participant.id)
    return player ? [{ participant, player }] : []
  })
})
const teams = computed(() => {
  const ids = [...new Set(rows.value.map(({ player }) => player.teamId))]
  // Match the existing settlement view: red first, then blue; other teams retain their order.
  const order = (id: number | undefined) => (id === 200 ? 0 : id === 100 ? 1 : 2)
  ids.sort((left, right) => order(left) - order(right))
  return ids.map((id) => ({
    id,
    side: (id === 100 ? 'blue' : id === 200 ? 'red' : undefined) as TeamSide | undefined,
    title:
      id === 100
        ? t('matchDetail.badges.blue')
        : id === 200
          ? t('matchDetail.badges.red')
          : t('damageSize.team', { id: id ?? '—' }),
    rows: rows.value.filter(({ player }) => player.teamId === id),
  }))
})
const senderNote = computed(() => {
  if (senders.value.length === 0) return t('damageSize.nobody')
  const count = t('damageSize.count', { count: senders.value.length })
  return senders.value.length === props.result.participants.length
    ? `${count} · ${t('damageSize.everyone')}`
    : count
})
</script>

<template>
  <section data-damage-size class="space-y-3">
    <div
      data-size-draw-card
      class="flex items-center gap-3 rounded-xl border border-brand-bright/40 bg-linear-to-r from-brand-strong/25 to-surface-raised px-4 py-3"
    >
      <i class="fa-solid fa-dice-two text-xl text-brand-light" aria-hidden="true"></i>
      <h3 class="text-sm font-bold text-brand-soft">{{ t('damageSize.title') }}</h3>
      <strong
        v-if="result.outcome"
        class="ml-auto grid size-12 shrink-0 place-items-center rounded-lg bg-brand-strong/35 font-ink text-3xl"
        :class="result.outcome === 'big' ? 'text-danger-light' : 'text-info-light'"
        :aria-label="`${t('damageSize.outcome')}：${t(`damageSize.${result.outcome}`)}`"
        >{{ t(`damageSize.${result.outcome}`) }}</strong
      >
    </div>

    <p v-if="result.reason" role="status" class="text-xs text-text-muted">
      {{ t(`damageSize.${result.reason}`) }}
    </p>

    <RedPacketNotice v-if="finalized" data-size-senders :entries="senders">
      <template #note>{{ senderNote }}</template>
    </RedPacketNotice>

    <div class="glass-card overflow-hidden rounded-2xl border border-on-solid/5 screenshot-mode">
      <div class="border-b border-on-solid/5 bg-surface-sunken/50 p-2">
        <SettlementLayoutToggle v-model="layout" :global-label="t('matchDetail.global')" />
      </div>
      <div v-if="layout === 'group'" id="layout-group" class="space-y-3 p-3">
        <SettlementTeamSection
          v-for="team in teams"
          :key="team.id ?? 'unknown'"
          :side="team.side"
          :title="team.title"
          :players="team.rows.map(({ player }) => player)"
        >
          <div role="list">
            <DamageSizePlayerRow
              v-for="{ participant, player } in team.rows"
              :key="participant.id"
              :participant="participant"
              :player="player"
              :layout="layout"
              :finalized="finalized"
              :sending="senderIds.has(participant.id)"
            />
          </div>
        </SettlementTeamSection>
      </div>
      <div v-else id="layout-global" role="list">
        <DamageSizePlayerRow
          v-for="{ participant, player } in rows"
          :key="participant.id"
          :participant="participant"
          :player="player"
          :layout="layout"
          :finalized="finalized"
          :sending="senderIds.has(participant.id)"
        />
      </div>
    </div>
  </section>
</template>
