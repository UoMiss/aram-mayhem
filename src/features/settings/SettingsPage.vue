<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { isTauri } from '@tauri-apps/api/core'
import type { SettingKey } from '@/types/settings'
import { useDesktopStore } from '@/stores/desktop'
import { useI18n } from 'vue-i18n'
import { SETTING_LABEL_KEYS } from '@/i18n/labels'
import SettingToggle from '@/features/settings/components/SettingToggle.vue'
import { SETTINGS_OPTIONS } from '@/mocks/settings'
import { useSettingsStore } from '@/stores/settings'
import { useFeedbackStore } from '@/stores/feedback'
import ExitAppButton from '@/components/common/ExitAppButton.vue'

const settings = useSettingsStore()
const desktop = useDesktopStore()
const feedback = useFeedbackStore()
const { t } = useI18n({ useScope: 'global' })

const native = computed(() => isTauri())
const busy = ref<SettingKey | null>(null)
const checking = ref(false)
const startupReady = ref(false)
onMounted(async () => {
  if (!native.value) return
  busy.value = 'autoStart'
  try {
    const { tauriSettingsAdapter } = await import('@/adapters/tauri.adapter')
    settings.setSetting('autoStart', await tauriSettingsAdapter.autoStart())
    startupReady.value = true
  } catch {
    // Keep the persisted OS setting untouched until the user explicitly changes it.
  } finally {
    busy.value = null
  }
})
async function changeSetting(key: SettingKey, value: boolean) {
  if (!native.value || key === 'soundEffects') {
    settings.setSetting(key, value)
    return
  }
  if (busy.value) return
  busy.value = key
  try {
    const { tauriSettingsAdapter } = await import('@/adapters/tauri.adapter')
    if (key === 'autoStart') {
      settings.setSetting(key, await tauriSettingsAdapter.autoStart(value))
      startupReady.value = true
    } else {
      await tauriSettingsAdapter.setAutoRetry(value)
      settings.setSetting(key, value)
    }
  } catch {
    feedback.notify(t('settings.saveFailed'), 'error')
  } finally {
    busy.value = null
  }
}
async function checkForUpdates() {
  if (!native.value) {
    feedback.notify(t('settings.updateUnavailable'))
    return
  }
  if (checking.value) return
  checking.value = true
  try {
    const { tauriSettingsAdapter } = await import('@/adapters/tauri.adapter')
    const result = await tauriSettingsAdapter.checkUpdate()
    feedback.notify(
      t(
        !result.configured
          ? 'settings.updateUnconfigured'
          : result.latest === null
            ? 'settings.noPublishedRelease'
            : result.available
              ? 'settings.updateAvailable'
              : 'settings.upToDate',
        { version: result.latest },
      ),
    )
  } catch {
    feedback.notify(t('settings.updateFailed'), 'error')
  } finally {
    checking.value = false
  }
}
</script>

<template>
  <section id="page-settings" class="space-y-4">
    <div class="glass-card space-y-3 rounded-2xl p-4">
      <h3 class="text-xs font-bold tracking-wider text-brand uppercase">
        {{ t('settings.general') }}
      </h3>

      <SettingToggle
        v-for="(key, index) in SETTINGS_OPTIONS"
        :key="key"
        :label="t(SETTING_LABEL_KEYS[key])"
        :bordered="index < 2"
        :model-value="settings.settings[key]"
        :disabled="busy !== null && key !== 'soundEffects'"
        @update:model-value="changeSetting(key, $event)"
      />
      <p v-if="native && !startupReady && !busy" class="text-xs text-text-muted">
        {{ t('settings.startupUnknown') }}
      </p>
    </div>

    <div class="glass-card space-y-3 rounded-2xl p-4">
      <h3 class="text-xs font-bold tracking-wider text-brand uppercase">
        {{ t('settings.about') }}
      </h3>

      <div class="flex items-center justify-between text-sm text-text-secondary">
        <span>{{ t('settings.version') }}</span>
        <span class="text-text-subtle">v{{ desktop.appVersion }}</span>
      </div>

      <button
        type="button"
        class="w-full cursor-pointer rounded-xl border border-brand-bright/30 bg-brand-surface/30 py-2.5 text-xs text-brand-light transition-colors hover:bg-brand-deep/40"
        :disabled="checking"
        @click="checkForUpdates"
      >
        {{ t(checking ? 'settings.checking' : 'settings.checkUpdate') }}
      </button>
      <ExitAppButton class="w-full" />
    </div>
  </section>
</template>
