<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue'
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
import { useAppStore } from '@/stores/app'

const app = useAppStore()

function diagnosticCode(error: unknown, fallback: string): string {
  return error instanceof LcuServiceError ? error.code : fallback
}

let lcuUnlisten: (() => void) | undefined
let gameflowUnlisten: (() => void) | undefined
let disposed = false

// Silent startup probes: health, connection and gameflow. No test-only UI is rendered.
onMounted(() => {
  void getAppHealth().catch(() => undefined)

  void (async () => {
    try {
      const unlisten = await subscribeLcuStatus((status) => app.setLcuStatus(status))
      if (disposed) {
        unlisten()
        return
      }
      lcuUnlisten = unlisten
      app.clearLcuError()
    } catch (error) {
      app.setLcuError(diagnosticCode(error, 'lcu.subscribe_failed'))
    }

    try {
      const status = await getLcuConnectionStatus()
      if (disposed) return
      app.setLcuStatus(status)
    } catch (error) {
      app.setLcuError(diagnosticCode(error, 'lcu.status_failed'))
    }

    try {
      const status = await startLcuMonitoring()
      if (disposed) {
        void stopLcuMonitoring().catch(() => undefined)
        return
      }
      app.setLcuStatus(status)
    } catch (error) {
      app.setLcuError(diagnosticCode(error, 'lcu.start_failed'))
    }
  })()

  void (async () => {
    try {
      const unlisten = await subscribeGameflow((event) => {
        if (event.type === 'updated') app.setGameflowSnapshot(event.snapshot)
      })
      if (disposed) {
        unlisten()
        return
      }
      gameflowUnlisten = unlisten
    } catch {
      // Gameflow subscription is optional; existing UI remains Mock-backed.
    }

    try {
      const snapshot = await getGameflowSnapshot()
      if (disposed) return
      app.setGameflowSnapshot(snapshot)
    } catch {
      // No gameflow snapshot is fabricated on unsupported platforms.
    }

    try {
      const snapshot = await startGameflowMonitoring()
      if (disposed) {
        void stopGameflowMonitoring().catch(() => undefined)
        return
      }
      app.setGameflowSnapshot(snapshot)
    } catch {
      // Gameflow monitoring is non-fatal; the last snapshot is retained.
    }
  })()
})

onUnmounted(() => {
  disposed = true
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
    <AppShell v-if="app.isConnected" />
    <ConnectionScreen v-else />
    <AppToast />
  </div>
</template>
