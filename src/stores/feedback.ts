import { onScopeDispose, ref } from 'vue'
import { defineStore } from 'pinia'
export const TOAST_DURATION_MS = 2500
export type ToastTone = 'success' | 'error'
export const useFeedbackStore = defineStore('feedback', () => {
  const toastMessage = ref('')
  const toastTone = ref<ToastTone>('success')
  const toastVisible = ref(false)

  let toastTimer: ReturnType<typeof setTimeout> | null = null
  function hideToast() {
    if (toastTimer) {
      clearTimeout(toastTimer)
      toastTimer = null
    }
    toastVisible.value = false
  }

  function notify(message: string, tone: ToastTone = 'success') {
    toastMessage.value = message
    toastTone.value = tone
    toastVisible.value = true
    if (toastTimer) clearTimeout(toastTimer)
    toastTimer = setTimeout(() => {
      toastTimer = null
      toastVisible.value = false
    }, TOAST_DURATION_MS)
  }

  onScopeDispose(hideToast)
  return { toastMessage, toastTone, toastVisible, hideToast, notify }
})
