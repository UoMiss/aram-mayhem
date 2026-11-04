<script setup lang="ts">
import { useDesktopStore } from '@/stores/desktop'
import { useI18n } from 'vue-i18n'
import { useConnectionStore } from '@/stores/connection'

const connection = useConnectionStore()
const desktop = useDesktopStore()
const { t } = useI18n({ useScope: 'global' })
</script>

<template>
  <header
    class="glass-card sticky top-0 z-header flex items-center justify-between border-b border-on-solid/5 bg-surface-base/80 px-4 py-3"
  >
    <div class="flex items-center gap-2.5">
      <div
        class="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-tr from-warning-bright to-reward shadow-lg shadow-warning-bright/20"
      >
        <i class="fa-solid me-0.5 fa-wallet text-sm text-surface-base"></i>
      </div>
      <div>
        <h1 class="text-base font-bold leading-tight tracking-wide text-on-solid">ARAM: Mayhem</h1>
        <p class="text-[10px] text-text-muted">Mayhem Assistant v{{ desktop.appVersion }}</p>
      </div>
    </div>
    <div
      class="flex items-center gap-1.5 rounded-full border border-success-bright/20 bg-success-bright/10 px-2.5 py-1 text-xs text-success"
      role="status"
      :aria-label="t('a11y.connectionStatus')"
    >
      <span class="h-2 w-2 rounded-full bg-success-bright"></span>
      <span>{{
        connection.isConnected ? t('connection.connected') : t('connection.pending')
      }}</span>
    </div>
  </header>
</template>
