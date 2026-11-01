<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { RedPacketEntry } from '@/types/match-detail'

const props = defineProps<{ entries: readonly RedPacketEntry[] }>()
const { t } = useI18n({ useScope: 'global' })
const note = computed(() => t('matchDetail.redPacketNote', { count: props.entries.length }))
</script>

<template>
  <div
    class="relative flex flex-col items-center overflow-hidden rounded-xl border border-rose-500/30 bg-[#171526] p-4 shadow-[0_0_15px_rgba(225,29,72,0.1)]"
  >
    <div
      class="absolute top-0 left-0 h-[1px] w-full bg-gradient-to-r from-transparent via-rose-500 to-transparent opacity-60"
    ></div>

    <div class="mb-3 flex items-center gap-1.5">
      <i class="fa-solid fa-hand-holding-dollar text-sm text-rose-500"></i>
      <span class="text-sm font-bold tracking-wider text-rose-400">{{
        t('matchDetail.redPacketTitle')
      }}</span>
    </div>

    <div class="mb-3 flex w-full flex-wrap justify-center gap-2">
      <div
        v-for="entry in entries"
        :key="`${entry.name}-${entry.rank}`"
        class="flex items-center gap-1 rounded-lg border border-rose-500/40 bg-rose-950/80 px-2.5 py-1.5 text-xs font-bold text-rose-100 shadow-sm"
      >
        <span>{{ entry.name }}</span>
        <span class="text-[11px] font-black text-amber-400">#{{ entry.rank }}</span>
      </div>
    </div>

    <p class="text-xs font-bold text-rose-300/80 drop-shadow-md">{{ note }}</p>
  </div>
</template>
