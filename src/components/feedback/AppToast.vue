<script setup lang="ts">
import { useAppStore } from '@/stores/app'

const app = useAppStore()
</script>

<template>
  <div
    class="app-toast"
    :class="{ show: app.toastVisible, 'app-toast-error': app.toastTone === 'error' }"
    role="status"
    aria-live="polite"
  >
    {{ app.toastMessage }}
  </div>
</template>
