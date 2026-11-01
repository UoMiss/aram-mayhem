<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue'
import AppShell from '@/components/layout/AppShell.vue'
import AppToast from '@/components/feedback/AppToast.vue'
import ConnectionScreen from '@/features/connection/ConnectionScreen.vue'
import { getAppHealth } from '@/services/app.service'
import {
  getLcuConnectionStatus,
  startLcuMonitoring,
  stopLcuMonitoring,
  subscribeLcuStatus,
} from '@/services/lcu.service'
import { useAppStore } from '@/stores/app'

const app = useAppStore()
let lcuUnlisten: (() => void) | undefined
let disposed = false

// Silent startup probes: health + LCU status, with no permanent test UI.
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
    } catch {
      // A failed desktop subscription is non-fatal; existing UI stays on Mock state.
    }

    try {
      const status = await getLcuConnectionStatus()
      if (disposed) return
      app.setLcuStatus(status)
    } catch {
      // No connected status is fabricated when the underlying source is unavailable.
    }

    try {
      const status = await startLcuMonitoring()
      if (disposed) {
        void stopLcuMonitoring().catch(() => undefined)
        return
      }
      app.setLcuStatus(status)
    } catch {
      // Monitoring failure is non-fatal; the last real status is retained.
    }
  })()
})

onUnmounted(() => {
  disposed = true
  lcuUnlisten?.()
  lcuUnlisten = undefined
  void stopLcuMonitoring().catch(() => undefined)
})
</script>

<template>
  <div class="app-viewport">
    <AppShell v-if="app.isConnected" />
    <ConnectionScreen v-else />
    <AppToast />
  </div>
</template>
