<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { MATCH_MODE_KEYS, MATCH_RESULT_KEYS } from '@/i18n/labels'
import { formatMatchTime } from '@/shared/lib/history-presentation'
import type { MatchHistoryItem } from '@/types/history'

const props = defineProps<{ match: MatchHistoryItem; duration?: string }>()
const emit = defineEmits<{ open: [] }>()
const { t } = useI18n({ useScope: 'global' })
const time = computed(() =>
  props.match.createdAt != null ? formatMatchTime(props.match.createdAt) : props.match.timeLabel,
)
</script>

<template>
  <button
    type="button"
    class="glass-card flex w-full cursor-pointer items-center gap-2 rounded-xl p-2.5 text-left hover:border-brand/50"
    :aria-label="t('home.openRecent', { champion: match.champion, time })"
    @click="emit('open')"
  >
    <img
      v-if="match.championImage"
      :src="match.championImage"
      alt=""
      width="44"
      height="44"
      class="size-11 shrink-0 rounded-lg object-cover"
    />
    <span
      v-else
      class="grid size-11 shrink-0 place-items-center rounded-lg bg-surface-raised text-text-muted"
    >
      <i class="fa-solid fa-user" aria-hidden="true"></i>
    </span>
    <span class="min-w-0 flex-1 space-y-0.5">
      <span class="flex flex-wrap items-center gap-1.5">
        <strong class="break-all text-sm text-text-soft">{{ match.champion }}</strong>
        <span
          class="rounded px-1.5 py-0.5 text-[11px]"
          :class="
            match.result === 'victory'
              ? 'bg-success-base text-success-light'
              : 'bg-danger-base text-danger-light'
          "
        >
          {{ t(MATCH_RESULT_KEYS[match.result]) }}
        </span>
      </span>
      <span class="block text-xs text-text-muted">{{ t(MATCH_MODE_KEYS[match.mode]) }}</span>
    </span>
    <span class="shrink-0 space-y-0.5 text-right tabular-nums">
      <strong class="block text-sm text-text-soft">
        {{ match.kda.kills }} / {{ match.kda.deaths }} / {{ match.kda.assists }}
      </strong>
      <span class="block text-xs text-text-muted">{{ duration ?? match.timeLabel }}</span>
    </span>
    <i
      class="fa-solid fa-chevron-right shrink-0 text-[10px] text-brand-light"
      aria-hidden="true"
    ></i>
  </button>
</template>
