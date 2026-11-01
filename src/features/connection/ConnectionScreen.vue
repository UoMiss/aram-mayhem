<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useAppStore } from '@/stores/app'

const app = useAppStore()
const { t } = useI18n({ useScope: 'global' })

/** 原版每 5 秒循环的自动重试倒计时。 */
const retrySeconds = ref(5)
let retryTimer: ReturnType<typeof setInterval> | null = null

onMounted(() => {
  retryTimer = setInterval(() => {
    retrySeconds.value = retrySeconds.value <= 1 ? 5 : retrySeconds.value - 1
  }, 1000)
})

onUnmounted(() => {
  if (retryTimer) {
    clearInterval(retryTimer)
    retryTimer = null
  }
})
</script>

<template>
  <div class="absolute inset-0 z-50 overflow-y-auto no-scrollbar">
    <div class="flex min-h-full flex-col items-center justify-center p-4">
      <div class="relative my-2 flex items-center justify-center">
        <div class="absolute h-28 w-28 rounded-full bg-purple-600/20 animate-glow blur-xl"></div>
        <div
          class="relative z-10 flex h-20 w-20 items-center justify-center rounded-full border border-purple-500/30 bg-gradient-to-b from-purple-900/60 to-purple-950/90 shadow-2xl"
        >
          <div class="flex h-9 w-11 items-center justify-center rounded-md bg-amber-500 shadow-md">
            <div class="h-3 w-3 rounded-full bg-amber-300"></div>
          </div>
        </div>
      </div>

      <div class="mt-4 space-y-2 text-center">
        <h2 class="text-2xl font-black tracking-wide text-white">ARAM: Mayhem</h2>
        <p class="text-sm font-medium text-slate-300">{{ t('connection.waiting') }}</p>
      </div>

      <div class="mt-2 max-w-xs space-y-1 text-center text-xs leading-relaxed text-slate-400">
        <p>{{ t('connection.autoConnect') }}</p>
        <p>{{ t('connection.beforePick') }}</p>
      </div>

      <div class="mt-4 flex items-center justify-center gap-2 py-1">
        <span class="dot1 h-2.5 w-2.5 rounded-full bg-purple-500"></span>
        <span class="dot2 h-2.5 w-2.5 rounded-full bg-purple-500"></span>
        <span class="dot3 h-2.5 w-2.5 rounded-full bg-purple-500"></span>
      </div>

      <div class="mt-4 flex w-full max-w-xs items-center gap-3 pt-1">
        <button
          type="button"
          class="flex-1 cursor-pointer rounded-xl border border-purple-500/40 bg-purple-950/40 px-4 py-2.5 text-center text-sm font-medium text-purple-200 shadow-lg transition-all hover:bg-purple-900/50 active:scale-95 disabled:cursor-not-allowed disabled:opacity-70"
          :disabled="app.isConnecting"
          @click="app.connect()"
        >
          <i v-if="app.isConnecting" class="fa-solid fa-spinner fa-spin mr-2"></i>
          {{ app.isConnecting ? t('connection.connecting') : t('connection.reconnect') }}
        </button>
        <button
          type="button"
          class="flex-1 cursor-pointer rounded-xl border border-slate-700/50 bg-slate-900/60 px-4 py-2.5 text-center text-sm font-medium text-slate-200 transition-all hover:bg-slate-800/60 active:scale-95"
          @click="app.notify(t('toast.connectFirst'), 'error')"
        >
          {{ t('nav.settings') }}
        </button>
      </div>

      <div
        class="mt-2 w-full max-w-xs pt-1 text-center leading-none"
        :class="{ 'pb-0.5': !app.showDetails }"
      >
        <p class="text-xs text-slate-400">{{ t('connection.stillDisconnected') }}</p>

        <button
          type="button"
          class="mt-3 inline-flex cursor-pointer items-center gap-1.5 text-xs text-slate-400 transition-colors hover:text-purple-300"
          :aria-expanded="app.showDetails"
          aria-controls="connection-detail-panel"
          @click="app.toggleDetails()"
        >
          <i
            class="fa-solid fa-caret-right transition-transform duration-200"
            :class="{ 'rotate-90': app.showDetails }"
          ></i>
          <span>{{ t('connection.retryHint', { seconds: retrySeconds }) }}</span>
        </button>

        <div
          v-if="app.showDetails"
          id="connection-detail-panel"
          class="relative mt-3.5 overflow-hidden rounded-xl border border-emerald-500/30 bg-black/90 p-3 text-left font-mono text-[11px] leading-relaxed shadow-2xl"
        >
          <div
            class="mb-2 flex items-center justify-between border-b border-white/10 pb-2 text-[10px]"
          >
            <div class="flex items-center gap-1.5">
              <span class="inline-block h-2.5 w-2.5 rounded-full bg-rose-500/80"></span>
              <span class="inline-block h-2.5 w-2.5 rounded-full bg-amber-500/80"></span>
              <span class="inline-block h-2.5 w-2.5 rounded-full bg-emerald-500/80"></span>
            </div>
            <span class="text-slate-500 select-none">lcu-connector.sh</span>
          </div>
          <div class="space-y-1 text-slate-300">
            <p><span class="text-purple-400">[SYS]</span> Init LCU Client Listener...</p>
            <p>
              <span class="text-emerald-400">[PORT]</span> Target Port:
              <span class="text-amber-300">2999</span>
            </p>
            <p>
              <span class="text-blue-400">[POLL]</span> Status:
              <span class="text-amber-400">
                {{ app.isConnecting ? 'Connecting LCU API...' : 'Polling LCU API...' }}
              </span>
            </p>
            <p class="text-rose-400">
              <span class="text-rose-500">[ERR]</span> Process 'LeagueClient.exe' NOT found.
            </p>
            <p class="text-[10px] text-slate-500">
              $ retrying in <span>{{ retrySeconds }}</span
              >s...
              <span class="terminal-cursor font-bold text-emerald-400">_</span>
            </p>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
