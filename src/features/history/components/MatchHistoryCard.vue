<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { MATCH_MODE_KEYS, MATCH_RESULT_KEYS } from '@/i18n/labels'
import type { MatchHistoryItem } from '@/types/history'

const props = defineProps<{ match: MatchHistoryItem }>()
const emit = defineEmits<{ select: [id: string] }>()
const { t } = useI18n({ useScope: 'global' })

const resultLabel = computed(() => t(MATCH_RESULT_KEYS[props.match.result]))
const modeLabel = computed(() => t(MATCH_MODE_KEYS[props.match.mode]))
const kdaLabel = computed(
  () => `${props.match.kda.kills}/${props.match.kda.deaths}/${props.match.kda.assists}`,
)

const outcomeClasses = computed(() =>
  props.match.result === 'victory'
    ? { text: 'text-cyan-400', border: 'border-l-cyan-500' }
    : { text: 'text-rose-500', border: 'border-l-rose-500' },
)

function select() {
  emit('select', props.match.id)
}
</script>

<template>
  <div
    :data-match-id="match.id"
    :data-mode="match.mode"
    class="history-item glass-card flex cursor-pointer items-center justify-between rounded-2xl border-l-4 px-3.5 py-3 transition-all hover:border-purple-500/40"
    :class="outcomeClasses.border"
    role="button"
    tabindex="0"
    @click="select"
    @keydown.enter.prevent="select"
    @keydown.space.prevent="select"
  >
    <div class="flex items-center gap-3">
      <img
        :src="match.championImage"
        :alt="match.champion"
        class="h-11 w-11 rounded-xl object-cover ring-1 ring-white/10"
      />
      <div class="space-y-0.5">
        <div class="text-sm font-bold" :class="outcomeClasses.text">{{ resultLabel }}</div>
        <div class="text-xs text-slate-400">{{ modeLabel }}</div>
      </div>
    </div>

    <div class="flex items-center gap-3">
      <div class="space-y-1 text-right">
        <div class="text-sm font-bold tracking-wide text-white">{{ kdaLabel }}</div>
        <div class="flex items-center justify-end gap-1.5 text-[11px] text-slate-400">
          <span
            v-if="match.isFriend"
            class="rounded bg-blue-500/20 px-1 py-0.2 text-[10px] font-medium text-blue-300"
          >
            {{ t('common.friend') }}
          </span>
          <span>{{ match.timeLabel }}</span>
        </div>
      </div>
      <i class="fa-solid fa-chevron-right text-xs text-slate-500"></i>
    </div>
  </div>
</template>
