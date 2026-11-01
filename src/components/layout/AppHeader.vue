<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { useAppStore } from '@/stores/app'

const app = useAppStore()
const { t } = useI18n({ useScope: 'global' })
</script>

<template>
  <header
    class="glass-card sticky top-0 z-40 flex items-center justify-between border-b border-white/5 bg-slate-950/80 px-4 py-3"
  >
    <div class="flex items-center gap-2.5">
      <div
        class="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-tr from-amber-500 to-orange-400 shadow-lg shadow-amber-500/20"
      >
        <i class="fa-solid me-0.5 fa-wallet text-sm text-slate-950"></i>
      </div>
      <div>
        <h1 class="text-base font-bold leading-tight tracking-wide text-white">ARAM: Mayhem</h1>
        <p class="text-[10px] text-slate-400">Mayhem Assistant v2.4</p>
      </div>
    </div>
    <div
      class="flex items-center gap-1.5 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-1 text-xs text-emerald-400"
      role="status"
      :aria-label="t('a11y.connectionStatus')"
    >
      <span class="h-2 w-2 rounded-full bg-emerald-500"></span>
      <span>{{ app.isConnected ? t('connection.connected') : t('connection.pending') }}</span>
    </div>
  </header>
</template>
