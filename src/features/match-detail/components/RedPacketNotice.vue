<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

const props = defineProps<{
  entries: readonly string[]
  quota?: number
  preview?: boolean
  status?: string | null
  notice?: string | null
}>()
const { t } = useI18n({ useScope: 'global' })
const note = computed(() => {
  if (props.status) return props.status
  const count = props.entries.length
  const message =
    count === 0
      ? t('matchDetail.redPacketEmpty')
      : props.quota !== undefined && count > props.quota
        ? t('matchDetail.redPacketTie', { quota: props.quota, count })
        : null
  return [message, props.notice].filter(Boolean).join(' · ')
})
</script>

<template>
  <div class="space-y-2 rounded-xl border border-danger-bright/20 bg-card p-3">
    <div class="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
      <h3 class="flex items-center gap-1.5 text-sm font-bold text-danger">
        <i class="fa-solid fa-hand-holding-dollar text-danger-bright" aria-hidden="true"></i>
        <span>{{
          t(
            status
              ? 'matchDetail.redPacketUnavailableTitle'
              : preview
                ? 'matchDetail.redPacketPreviewTitle'
                : 'matchDetail.redPacketTitle',
          )
        }}</span>
        <span v-if="!status" class="shrink-0 text-xs font-medium text-text-muted">{{
          t('matchDetail.redPacketPeople', { count: entries.length })
        }}</span>
      </h3>
      <slot name="outcome" />
    </div>

    <ul v-if="entries.length" class="flex flex-wrap gap-1.5">
      <li
        v-for="(name, index) in entries"
        :key="index"
        class="max-w-full rounded-lg border border-danger-bright/25 bg-danger-base/50 px-2 py-1 text-xs font-semibold wrap-anywhere text-danger-soft"
      >
        {{ name }}
      </li>
    </ul>

    <p v-if="note" :role="status || notice ? 'status' : undefined" class="text-xs text-text-muted">
      {{ note }}
    </p>
  </div>
</template>
