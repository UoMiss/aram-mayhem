<script setup lang="ts">
import { useFeedbackStore } from '@/stores/feedback'

const feedback = useFeedbackStore()
</script>

<template>
  <div
    class="app-toast"
    :class="{ show: feedback.toastVisible, 'app-toast-error': feedback.toastTone === 'error' }"
    role="status"
    aria-live="polite"
  >
    {{ feedback.toastMessage }}
  </div>
</template>
