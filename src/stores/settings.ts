import { ref } from 'vue'
import { defineStore } from 'pinia'
import { createDefaultSettings } from '@/mocks/settings'
import type { SettingKey, SettingsFlags } from '@/types/settings'
export const useSettingsStore = defineStore('settings', () => {
  const settings = ref<SettingsFlags>(createDefaultSettings())
  function setSetting(key: SettingKey, value: boolean) {
    settings.value[key] = value
  }
  return { settings, setSetting }
})
