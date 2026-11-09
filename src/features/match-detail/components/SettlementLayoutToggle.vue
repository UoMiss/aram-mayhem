<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import type { SettlementLayout } from '@/types/match-detail'
defineProps<{ globalLabel: string }>()
const layout = defineModel<SettlementLayout>({ required: true })
const { t } = useI18n({ useScope: 'global' })
</script>

<template>
  <div class="flex rounded-xl border border-on-solid/5 bg-surface-base/50 p-1">
    <button
      v-for="value in ['group', 'global'] as const"
      :id="`btn-layout-${value}`"
      :key="value"
      type="button"
      :aria-pressed="layout === value"
      :aria-controls="`layout-${value}`"
      class="flex-1 cursor-pointer rounded-lg py-2 text-xs font-bold transition-all"
      :class="
        layout === value
          ? 'bg-brand-strong text-on-solid shadow-md shadow-brand-strong/30'
          : 'text-text-muted hover:text-on-solid'
      "
      @click="layout = value"
    >
      <i
        class="mr-1"
        :class="value === 'group' ? 'fa-solid fa-layer-group' : 'fa-solid fa-ranking-star'"
        aria-hidden="true"
      ></i>
      {{ value === 'group' ? t('matchDetail.group') : globalLabel }}
    </button>
  </div>
</template>
