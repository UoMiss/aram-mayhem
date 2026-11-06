<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import AppLogo from '@/components/common/AppLogo.vue'
import { useConnectionStore } from '@/stores/connection'
import { useSettingsStore } from '@/stores/settings'
import { connectionErrorKey } from './errors'

const connection = useConnectionStore()
const settings = useSettingsStore()
const { t } = useI18n({ useScope: 'global' })

const statusText = computed(() => {
  if (!connection.isDesktopRuntime)
    return t(connection.isConnecting ? 'connection.connecting' : 'connection.waiting')

  switch (connection.lcuStatus?.status) {
    case 'not_running':
      return t('connection.notRunning')
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

const unsupported = computed(() => connection.lcuStatus?.status === 'unsupported_platform')
const errorText = computed(() => {
  const status = connection.lcuStatus
  const code = connection.lcuBridgeError ?? (status?.status === 'error' ? status.code : null)
  return code ? t(connectionErrorKey(code)) : null
})
</script>

<template>
  <div class="no-scrollbar absolute inset-0 z-modal overflow-y-auto">
    <div class="flex min-h-full flex-col items-center justify-center p-4">
      <div class="relative my-2 flex items-center justify-center">
        <div
          class="animate-glow absolute h-28 w-28 rounded-full bg-brand-strong/20 blur-xl motion-reduce:animate-none"
          aria-hidden="true"
        ></div>
        <AppLogo class="relative z-raised h-20 w-20" />
      </div>

      <h2 class="mt-4 text-2xl font-black tracking-wide text-on-solid">ARAM: Mayhem</h2>

      <section
        id="connection-detail-panel"
        aria-labelledby="connection-detail-title"
        class="relative mt-4 w-full max-w-xs overflow-hidden rounded-xl border border-success-bright/30 bg-ink/90 p-3 text-left font-mono text-[11px] leading-relaxed shadow-2xl"
      >
        <header
          class="mb-2 flex items-center justify-between border-b border-on-solid/10 pb-2 text-[10px]"
        >
          <h3 id="connection-detail-title" class="sr-only">{{ t('connection.details') }}</h3>
          <div class="flex items-center gap-1.5" aria-hidden="true">
            <span class="h-2.5 w-2.5 rounded-full bg-danger-bright/80"></span>
            <span class="h-2.5 w-2.5 rounded-full bg-warning-bright/80"></span>
            <span class="h-2.5 w-2.5 rounded-full bg-success-bright/80"></span>
          </div>
          <span class="text-text-subtle select-none">
            {{ connection.isDesktopRuntime ? 'lcu-connector.sh' : t('connection.demoBadge') }}
          </span>
        </header>

        <div class="space-y-1 text-text-secondary">
          <template v-if="connection.isDesktopRuntime">
            <p><span class="text-brand">[SYS]</span> Real LCU status listener...</p>
            <p>
              <span class="text-success">[SOURCE]</span>
              <span class="text-warning-light">{{
                connection.lcuStatus?.source ?? 'unknown'
              }}</span>
            </p>
          </template>
          <p v-else><span class="text-brand">[MOCK]</span> Browser demo connection</p>
          <p role="status">
            <span class="text-link" aria-hidden="true">[STATUS]</span>
            <span class="text-warning">{{ statusText }}</span>
          </p>
          <p v-if="connection.lcuStatus?.code">
            <span class="text-danger">[CODE]</span>
            <code class="break-all text-danger-light">{{ connection.lcuStatus.code }}</code>
          </p>
          <p v-if="connection.lcuBridgeError">
            <span class="text-danger">[BRIDGE]</span>
            <code class="break-all text-danger-light">{{ connection.lcuBridgeError }}</code>
          </p>
          <p v-if="errorText" role="alert" class="text-danger-light">{{ errorText }}</p>
          <p v-if="connection.isDesktopRuntime" class="text-[10px] text-text-subtle">
            <span aria-hidden="true">$</span>
            {{
              t(
                unsupported
                  ? 'connection.unsupportedIntro'
                  : settings.settings.autoRetry
                    ? 'connection.autoDetect'
                    : 'connection.manualDetect',
              )
            }}
            <span
              class="terminal-cursor font-bold text-success motion-reduce:animate-none"
              aria-hidden="true"
              >_</span
            >
          </p>
        </div>
      </section>

      <button
        v-if="!connection.isDesktopRuntime"
        type="button"
        class="mt-4 cursor-pointer rounded-xl border border-brand-bright/40 bg-brand-base/40 px-4 py-2 text-sm font-medium text-brand-pale hover:bg-brand-surface/50 disabled:cursor-not-allowed disabled:opacity-70"
        :disabled="connection.isConnecting"
        @click="connection.connect()"
      >
        {{ t('connection.enterDemo') }}
      </button>
    </div>
  </div>
</template>
