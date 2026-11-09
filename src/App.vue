<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue'
import { useSettingsStore } from '@/stores/settings'
import { useMatchLifecycle } from '@/composables/useMatchLifecycle'
import BrowserDemoControls from '@/features/demo/BrowserDemoControls.vue'
import AppShell from '@/components/layout/AppShell.vue'
import AppToast from '@/components/feedback/AppToast.vue'
import ConnectionScreen from '@/features/connection/ConnectionScreen.vue'
import { getAppHealth } from '@/services/app.service'
import { LcuServiceError } from '@/services/desktop-error'
import {
  getGameflowSnapshot,
  getLcuConnectionStatus,
  startGameflowMonitoring,
  startLcuMonitoring,
  stopGameflowMonitoring,
  stopLcuMonitoring,
  subscribeGameflow,
  subscribeLcuStatus,
} from '@/services/lcu.service'
import { useDesktopStore } from '@/stores/desktop'
import { useConnectionStore } from '@/stores/connection'

const connection = useConnectionStore()
const desktop = useDesktopStore()
const lifecycle = useMatchLifecycle()
const settings = useSettingsStore()

function diagnosticCode(error: unknown, fallback: string): string {
  return error instanceof LcuServiceError ? error.code : fallback
}

let lcuUnlisten: (() => void) | undefined
let gameflowUnlisten: (() => void) | undefined
let disposed = false
let lcuRetryTimer: ReturnType<typeof setTimeout> | undefined
let gameflowRetryTimer: ReturnType<typeof setTimeout> | undefined

async function subscribeConnection() {
  let fallback = 'lcu.subscribe_failed'
  try {
    if (!lcuUnlisten) {
      const unlisten = await subscribeLcuStatus(
        (status) => {
          if (disposed) return
          connection.setLcuStatus(status)
          connection.clearLcuError()
        },
        (error) => {
          if (!disposed) connection.setLcuError(error.code)
        },
      )
      if (disposed) {
        unlisten()
        return
      }
      lcuUnlisten = unlisten
    }
    fallback = 'lcu.status_failed'
    // Re-read after every successful subscription, including recovery: an event
    // may have been emitted while the frontend was temporarily unsubscribed.
    const status = await getLcuConnectionStatus()
    if (disposed) return
    connection.setLcuStatus(status)
    connection.clearLcuError()
  } catch (error) {
    if (disposed) return
    connection.setLcuError(diagnosticCode(error, fallback))
    lcuRetryTimer = setTimeout(() => {
      void subscribeConnection()
    }, 2000)
  }
}

async function subscribeFlow() {
  try {
    if (!gameflowUnlisten) {
      const unlisten = await subscribeGameflow((event) => {
        if (disposed) return
        if (event.type === 'updated') connection.setGameflowSnapshot(event.snapshot)
        if (event.type === 'session-ended') void lifecycle.finish(event.session)
      })
      if (disposed) {
        unlisten()
        return
      }
      gameflowUnlisten = unlisten
    }
    const snapshot = await getGameflowSnapshot()
    if (!disposed) connection.setGameflowSnapshot(snapshot)
  } catch {
    if (!disposed)
      gameflowRetryTimer = setTimeout(() => {
        void subscribeFlow()
      }, 2000)
  }
}

// Silent startup probes: health, connection and gameflow. Desktop has no demo controls.
onMounted(() => {
  void getAppHealth()
    .then((health) => {
      if (!disposed) desktop.setAppVersion(health.appVersion)
    })
    .catch(() => undefined)

  void (async () => {
    await subscribeConnection()

    if (disposed) return
    try {
      const status = await startLcuMonitoring()
      if (disposed) {
        void stopLcuMonitoring().catch(() => undefined)
        return
      }
      connection.setLcuStatus(status)
    } catch (error) {
      if (disposed) return
      connection.setLcuError(diagnosticCode(error, 'lcu.start_failed'))
    }
  })()

  void (async () => {
    await subscribeFlow()

    if (disposed) return
    try {
      if (connection.isDesktopRuntime) {
        await settings.initializeAutoAccept().catch(() => undefined)
        if (disposed) return
      }
      const snapshot = await startGameflowMonitoring()
      if (disposed) {
        void stopGameflowMonitoring().catch(() => undefined)
        return
      }
      connection.setGameflowSnapshot(snapshot)
    } catch {
      // Gameflow monitoring is non-fatal; the last snapshot is retained.
    }
  })()
})

onUnmounted(() => {
  disposed = true
  clearTimeout(lcuRetryTimer)
  clearTimeout(gameflowRetryTimer)
  lcuUnlisten?.()
  lcuUnlisten = undefined
  gameflowUnlisten?.()
  gameflowUnlisten = undefined
  void stopLcuMonitoring().catch(() => undefined)
  void stopGameflowMonitoring().catch(() => undefined)
})
</script>

<template>
  <div class="app-viewport">
    <AppShell v-if="connection.isConnected" />
    <ConnectionScreen v-else />
    <AppToast />
    <BrowserDemoControls v-if="!connection.isDesktopRuntime" />
  </div>
</template>
