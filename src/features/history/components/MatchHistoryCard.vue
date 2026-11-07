<script setup lang="ts">
import { computed } from 'vue'
import { useGameInfo } from '@/composables/useGameInfo'
import { useI18n } from 'vue-i18n'
import { formatMatchTime } from '@/shared/lib/history-presentation'
import { MATCH_MODE_KEYS, MATCH_RESULT_KEYS } from '@/i18n/labels'
import type { MatchHistoryItem } from '@/types/history'

const props = defineProps<{ match: MatchHistoryItem }>()
const emit = defineEmits<{ select: [id: string] }>()
const { t } = useI18n({ useScope: 'global' })
const gameInfo = useGameInfo(
  () => props.match.gameInfo ?? null,
  () => props.match.accountKey,
)

const resultLabel = computed(() => t(MATCH_RESULT_KEYS[props.match.result]))
const modeLabel = computed(() =>
  props.match.gameInfo ? gameInfo.value.gameTypeLabel : t(MATCH_MODE_KEYS[props.match.mode]),
)
const kdaLabel = computed(
  () => `${props.match.kda.kills}/${props.match.kda.deaths}/${props.match.kda.assists}`,
)

const outcomeClasses = computed(() =>
  props.match.result === 'victory'
    ? { text: 'text-info', border: 'border-l-info-bright' }
    : { text: 'text-danger-bright', border: 'border-l-danger-bright' },
)

function select() {
  emit('select', props.match.id)
}
</script>

<template>
  <div
    :data-match-id="match.id"
    :data-mode="match.mode"
    class="history-item glass-card flex cursor-pointer items-center justify-between rounded-2xl border-l-4 px-3.5 py-3 transition-all hover:border-brand-bright/40"
    :class="outcomeClasses.border"
    role="button"
    tabindex="0"
    @click="select"
    @keydown.enter.prevent="select"
    @keydown.space.prevent="select"
  >
    <div class="flex min-w-0 items-center gap-3">
      <img
        v-if="match.championImage"
        :src="match.championImage"
        :alt="match.champion"
        class="h-11 w-11 shrink-0 rounded-xl object-cover ring-1 ring-on-solid/10"
      />
      <span
        v-else
        role="img"
        :aria-label="match.champion"
        :title="match.champion"
        class="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-surface-raised text-text-muted"
        ><i class="fa-solid fa-user"></i
      ></span>
      <div class="min-w-0 space-y-0.5">
        <div class="text-sm font-bold" :class="outcomeClasses.text">{{ resultLabel }}</div>
        <div class="truncate text-xs text-text-muted" :title="modeLabel">{{ modeLabel }}</div>
      </div>
    </div>

    <div class="flex shrink-0 items-center gap-3">
      <div class="space-y-1 text-right">
        <div class="text-sm font-bold tracking-wide text-on-solid">{{ kdaLabel }}</div>
        <div class="flex items-center justify-end gap-1.5 text-[11px] text-text-muted">
          <span
            v-if="match.isFriend"
            class="rounded bg-link-bright/20 px-1 py-0.2 text-[10px] font-medium text-blue-300"
          >
            {{ t('common.friend') }}
          </span>
          <span>{{ match.createdAt ? formatMatchTime(match.createdAt) : match.timeLabel }}</span>
        </div>
      </div>
      <i class="fa-solid fa-chevron-right text-xs text-text-subtle"></i>
    </div>
  </div>
</template>
