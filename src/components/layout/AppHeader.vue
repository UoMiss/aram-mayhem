<script setup lang="ts">
import AppLogo from '@/components/common/AppLogo.vue'
import { useDesktopStore } from '@/stores/desktop'
import { useI18n } from 'vue-i18n'
import { useConnectionStore } from '@/stores/connection'
import { computed } from 'vue'
import { CONNECTION_STATUS_KEYS } from '@/i18n/labels'

const connection = useConnectionStore()
const desktop = useDesktopStore()
const { t } = useI18n({ useScope: 'global' })
const statusLabel = computed(() => {
  if (connection.isDesktopRuntime)
    return t(CONNECTION_STATUS_KEYS[connection.lcuStatus?.status ?? 'discovering'])
  return t(
    connection.isConnected
      ? 'connection.connected'
      : connection.isConnecting
        ? 'connection.connecting'
        : 'connection.pending',
  )
})
</script>

<template>
  <header
    class="glass-card sticky top-0 z-header flex items-center justify-between border-b border-on-solid/5 bg-surface-base/80 px-4 py-3"
  >
    <div class="flex items-center gap-2.5">
      <AppLogo class="h-8 w-8 shrink-0" />
      <div>
        <h1 class="text-base font-bold leading-tight tracking-wide text-on-solid">ARAM: Mayhem</h1>
        <p class="text-[10px] text-text-muted">Mayhem Assistant v{{ desktop.appVersion }}</p>
      </div>
    </div>
    <div
      class="flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs"
      :class="
        connection.isConnected
          ? 'border-success-bright/20 bg-success-bright/10 text-success'
          : 'border-on-solid/10 bg-surface-raised text-text-secondary'
      "
      role="status"
      :aria-label="t('a11y.connectionStatus')"
    >
      <span class="h-2 w-2 rounded-full bg-current" aria-hidden="true"></span>
      <span>{{ statusLabel }}</span>
    </div>
  </header>
</template>
