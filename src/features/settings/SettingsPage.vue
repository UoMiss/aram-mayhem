<script setup lang="ts">
import { useDesktopStore } from '@/stores/desktop'
import { useI18n } from 'vue-i18n'
import { SETTING_LABEL_KEYS } from '@/i18n/labels'
import SettingToggle from '@/features/settings/components/SettingToggle.vue'
import { SETTINGS_OPTIONS } from '@/mocks/settings'
import { useSettingsStore } from '@/stores/settings'
import { useFeedbackStore } from '@/stores/feedback'

const settings = useSettingsStore()
const desktop = useDesktopStore()
const feedback = useFeedbackStore()
const { t } = useI18n({ useScope: 'global' })

function checkForUpdates() {
  feedback.notify(t('settings.updateUnavailable'))
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
        @update:model-value="settings.setSetting(key, $event)"
      />
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
        @click="checkForUpdates"
      >
        {{ t('settings.checkUpdate') }}
      </button>
    </div>
  </section>
</template>
