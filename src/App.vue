<script setup lang="ts">
import { onMounted } from 'vue'
import AppShell from '@/components/layout/AppShell.vue'
import AppToast from '@/components/feedback/AppToast.vue'
import ConnectionScreen from '@/features/connection/ConnectionScreen.vue'
import { getAppHealth } from '@/services/app.service'
import { useAppStore } from '@/stores/app'

const app = useAppStore()

// Silent startup probe: verifies the desktop IPC bridge without adding UI.
onMounted(() => {
  void getAppHealth().catch(() => undefined)
})
</script>

<template>
  <div class="app-viewport">
    <AppShell v-if="app.isConnected" />
    <ConnectionScreen v-else />
    <AppToast />
  </div>
</template>
