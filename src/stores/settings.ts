import { ref } from 'vue'
import { defineStore } from 'pinia'
import { isTauri } from '@tauri-apps/api/core'
import { createDefaultSettings } from '@/mocks/settings'
import { readLocalData, writeLocalData } from '@/shared/lib/local-data'
import type { SettingKey, SettingsFlags } from '@/types/settings'
const key = 'aram.settings.v1'
export const useSettingsStore = defineStore('settings', () => {
  const initial = createDefaultSettings()
  const desktop = isTauri()
  const stored = desktop ? readLocalData(key) : null
  if (desktop) initial.autoStart = false
  if (stored && typeof stored === 'object') {
    if ('autoRetry' in stored && typeof stored.autoRetry === 'boolean')
      initial.autoRetry = stored.autoRetry
    if ('soundEffects' in stored && typeof stored.soundEffects === 'boolean')
      initial.soundEffects = stored.soundEffects
  }
  const settings = ref<SettingsFlags>(initial)
  function setSetting(keyName: SettingKey, value: boolean) {
    settings.value[keyName] = value
    if (desktop) {
      const { autoRetry, soundEffects } = settings.value
      writeLocalData(key, { autoRetry, soundEffects })
    }
  }
  return { settings, setSetting }
})
