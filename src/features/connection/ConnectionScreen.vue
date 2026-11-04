<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { LcuServiceError } from '@/services/desktop-error'
import { startLcuMonitoring } from '@/services/lcu.service'
import { useUiStore } from '@/stores/ui'
import { useConnectionStore } from '@/stores/connection'
import { useFeedbackStore } from '@/stores/feedback'

const ui = useUiStore()
const connection = useConnectionStore()
const feedback = useFeedbackStore()
const { t } = useI18n({ useScope: 'global' })

/** 原版每 5 秒循环的自动重试倒计时；桌面模式由 Rust 自动重试。 */
const retrySeconds = ref(5)
let retryTimer: ReturnType<typeof setInterval> | null = null

const isDesktop = computed(() => connection.isDesktopRuntime)

const statusText = computed(() => {
  if (!isDesktop.value) return t('connection.waiting')
  switch (connection.lcuStatus?.status) {
    case 'not_running':
      return t('connection.notRunning')
    case 'discovering':
      return t('connection.discovering')
    case 'connecting':
    case 'reconnecting':
      return t('connection.connecting')
    case 'disconnected':
      return t('connection.disconnected')
    case 'error':
      return t('connection.error')
    case 'unsupported_platform':
      return t('connection.unsupported')
    case 'connected':
      return t('connection.connected')
    default:
      return t('connection.discovering')
  }
})

const buttonLabel = computed(() => {
  if (connection.isConnecting) return t('connection.connecting')
  return isDesktop.value ? t('connection.retryDesktop') : t('connection.reconnect')
})

const hintText = computed(() =>
  isDesktop.value ? t('connection.desktopHint') : t('connection.stillDisconnected'),
)

const retryHint = computed(() =>
  isDesktop.value
    ? t('connection.autoDetect')
    : t('connection.retryHint', { seconds: retrySeconds.value }),
)

function diagnosticCode(error: unknown): string {
  return error instanceof LcuServiceError ? error.code : 'lcu.retry_failed'
}

async function onReconnect() {
  if (!isDesktop.value) {
    connection.connect()
    return
  }

  connection.clearLcuError()
  try {
    const status = await startLcuMonitoring()
    connection.setLcuStatus(status)
  } catch (error) {
    connection.setLcuError(diagnosticCode(error))
  }
}

onMounted(() => {
  if (isDesktop.value) return
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
  <div class="absolute inset-0 z-modal overflow-y-auto no-scrollbar">
    <div class="flex min-h-full flex-col items-center justify-center p-4">
      <div class="relative my-2 flex items-center justify-center">
        <div class="absolute h-28 w-28 rounded-full bg-brand-strong/20 animate-glow blur-xl"></div>
        <div
          class="relative z-raised flex h-20 w-20 items-center justify-center rounded-full border border-brand-bright/30 bg-gradient-to-b from-brand-surface/60 to-brand-base/90 shadow-2xl"
        >
          <div
            class="flex h-9 w-11 items-center justify-center rounded-md bg-warning-bright shadow-md"
          >
            <div class="h-3 w-3 rounded-full bg-warning-light"></div>
          </div>
        </div>
      </div>

      <div class="mt-4 space-y-2 text-center">
        <h2 class="text-2xl font-ink tracking-wide text-on-solid">ARAM: Mayhem</h2>
        <p class="text-sm font-medium text-text-secondary">{{ statusText }}</p>
      </div>

      <div class="mt-2 max-w-xs space-y-1 text-center text-xs leading-relaxed text-text-muted">
        <p>{{ t('connection.autoConnect') }}</p>
        <p>{{ t('connection.beforePick') }}</p>
        <p v-if="connection.lcuBridgeError" class="text-danger-light">
          {{ t('connection.error') }} · {{ connection.lcuBridgeError }}
        </p>
      </div>

      <div class="mt-4 flex items-center justify-center gap-2 py-1">
        <span class="dot1 h-2.5 w-2.5 rounded-full bg-brand-bright"></span>
        <span class="dot2 h-2.5 w-2.5 rounded-full bg-brand-bright"></span>
        <span class="dot3 h-2.5 w-2.5 rounded-full bg-brand-bright"></span>
      </div>

      <div class="mt-4 flex w-full max-w-xs items-center gap-3 pt-1">
        <button
          type="button"
          class="flex-1 cursor-pointer rounded-xl border border-brand-bright/40 bg-brand-base/40 px-4 py-2.5 text-center text-sm font-medium text-brand-pale shadow-lg transition-all hover:bg-brand-surface/50 active:scale-95 disabled:cursor-not-allowed disabled:opacity-70"
          :disabled="connection.isConnecting"
          @click="onReconnect"
        >
          <i v-if="connection.isConnecting" class="fa-solid fa-spinner fa-spin mr-2"></i>
          {{ buttonLabel }}
        </button>
        <button
          type="button"
          class="flex-1 cursor-pointer rounded-xl border border-border-strong/50 bg-surface-sunken/60 px-4 py-2.5 text-center text-sm font-medium text-text-soft transition-all hover:bg-surface-raised/60 active:scale-95"
          @click="feedback.notify(t('toast.connectFirst'), 'error')"
        >
          {{ t('nav.settings') }}
        </button>
      </div>

      <div
        class="mt-2 w-full max-w-xs pt-1 text-center leading-none"
        :class="{ 'pb-0.5': !ui.showDetails }"
      >
        <p class="text-xs text-text-muted">{{ hintText }}</p>

        <button
          type="button"
          class="mt-3 inline-flex cursor-pointer items-center gap-1.5 text-xs text-text-muted transition-colors hover:text-brand-light"
          :aria-expanded="ui.showDetails"
          aria-controls="connection-detail-panel"
          @click="ui.toggleDetails()"
        >
          <i
            class="fa-solid fa-caret-right transition-transform duration-200"
            :class="{ 'rotate-90': ui.showDetails }"
          ></i>
          <span>{{ retryHint }}</span>
        </button>

        <div
          v-if="ui.showDetails"
          id="connection-detail-panel"
          class="relative mt-3.5 overflow-hidden rounded-xl border border-success-bright/30 bg-ink/90 p-3 text-left font-mono text-[11px] leading-relaxed shadow-2xl"
        >
          <div
            class="mb-2 flex items-center justify-between border-b border-on-solid/10 pb-2 text-[10px]"
          >
            <div class="flex items-center gap-1.5">
              <span class="inline-block h-2.5 w-2.5 rounded-full bg-danger-bright/80"></span>
              <span class="inline-block h-2.5 w-2.5 rounded-full bg-warning-bright/80"></span>
              <span class="inline-block h-2.5 w-2.5 rounded-full bg-success-bright/80"></span>
            </div>
            <span class="text-text-subtle select-none">lcu-connector.sh</span>
          </div>
          <div v-if="isDesktop" class="space-y-1 text-text-secondary">
            <p><span class="text-brand">[SYS]</span> Real LCU status listener...</p>
            <p>
              <span class="text-success">[SOURCE]</span>
              <span class="text-warning-light">{{
                connection.lcuStatus?.source ?? 'unknown'
              }}</span>
            </p>
            <p>
              <span class="text-link">[STATUS]</span>
              <span class="text-warning">{{ statusText }}</span>
            </p>
            <p v-if="connection.lcuStatus?.code">
              <span class="text-danger">[CODE]</span>
              <span class="text-danger-light">{{ connection.lcuStatus.code }}</span>
            </p>
            <p v-if="connection.lcuBridgeError">
              <span class="text-danger">[BRIDGE]</span>
              <span class="text-danger-light">{{ connection.lcuBridgeError }}</span>
            </p>
            <p class="text-[10px] text-text-subtle">
              $ {{ t('connection.autoDetect') }}
              <span class="terminal-cursor font-bold text-success">_</span>
            </p>
          </div>
          <div v-else class="space-y-1 text-text-secondary">
            <p><span class="text-brand">[MOCK]</span> Browser demo connection</p>
            <p>
              <span class="text-link">[STATE]</span>
              <span class="text-warning">{{ connection.connectionPhase }}</span>
            </p>
            <p class="text-[10px] text-text-subtle">
              Mock only; no real LCU request is sent.
              <span class="terminal-cursor font-bold text-success">_</span>
            </p>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
