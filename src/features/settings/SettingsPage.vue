<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { SETTING_LABEL_KEYS } from '@/i18n/labels'
import SettingToggle from '@/features/settings/components/SettingToggle.vue'
import { SETTINGS_OPTIONS, SETTINGS_VERSION } from '@/mocks/settings'
import { useAppStore } from '@/stores/app'

const app = useAppStore()
const { t } = useI18n({ useScope: 'global' })

function checkForUpdates() {
  app.notify(t('settings.updateLatest'))
}
</script>

<template>
  <section id="page-settings" class="space-y-4">
    <div class="glass-card space-y-3 rounded-2xl p-4">
      <h3 class="text-xs font-bold tracking-wider text-purple-400 uppercase">
        {{ t('settings.general') }}
      </h3>

      <SettingToggle
        v-for="(key, index) in SETTINGS_OPTIONS"
        :key="key"
        :label="t(SETTING_LABEL_KEYS[key])"
        :bordered="index < 2"
        :model-value="app.settings[key]"
        @update:model-value="app.setSetting(key, $event)"
      />
    </div>

    <div class="glass-card space-y-3 rounded-2xl p-4">
      <h3 class="text-xs font-bold tracking-wider text-purple-400 uppercase">
        {{ t('settings.about') }}
      </h3>

      <div class="flex items-center justify-between text-sm text-slate-300">
        <span>{{ t('settings.version') }}</span>
        <span class="text-slate-500">{{ SETTINGS_VERSION }}</span>
      </div>

      <button
        type="button"
        class="w-full cursor-pointer rounded-xl border border-purple-500/30 bg-purple-900/30 py-2.5 text-xs text-purple-300 transition-colors hover:bg-purple-800/40"
        @click="checkForUpdates"
      >
        {{ t('settings.checkUpdate') }}
      </button>
    </div>
  </section>
</template>
