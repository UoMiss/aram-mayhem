<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { exitApp } from '@/services/app.service'
import { useConnectionStore } from '@/stores/connection'
import { useFeedbackStore } from '@/stores/feedback'

const connection = useConnectionStore()
const feedback = useFeedbackStore()
const { t } = useI18n({ useScope: 'global' })
const exiting = ref(false)

async function quit() {
  if (exiting.value) return
  exiting.value = true
  try {
    if (connection.isDesktopRuntime) await exitApp()
    else connection.disconnect()
  } catch {
    feedback.notify(t('settings.exitFailed'), 'error')
  } finally {
    exiting.value = false
  }
}
</script>

<template>
  <button
    type="button"
    class="cursor-pointer rounded-xl border border-on-solid/10 px-4 py-2 text-xs text-text-muted hover:text-on-solid disabled:cursor-not-allowed disabled:opacity-50"
    :disabled="exiting"
    @click="quit"
  >
    {{ t('settings.exitApp') }}
  </button>
</template>
