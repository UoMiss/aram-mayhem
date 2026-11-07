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
  if (stored && typeof stored === 'object') {
    if ('autoAccept' in stored && typeof stored.autoAccept === 'boolean')
      initial.autoAccept = stored.autoAccept
  }
  // Rewrite legacy preferences so removed switches cannot affect connection behavior.
  if (desktop && stored) writeLocalData(key, initial)
  const settings = ref<SettingsFlags>(initial)
  const autoAcceptReady = ref(!desktop)
  let initializingAutoAccept: Promise<void> | null = null
  function initializeAutoAccept(): Promise<void> {
    if (autoAcceptReady.value) return Promise.resolve()
    if (initializingAutoAccept) return initializingAutoAccept
    initializingAutoAccept = (async () => {
      const { tauriSettingsAdapter } = await import('@/adapters/tauri.adapter')
      settings.value.autoAccept = await tauriSettingsAdapter.setAutoAccept(
        settings.value.autoAccept,
      )
      autoAcceptReady.value = true
    })().finally(() => {
      initializingAutoAccept = null
    })
    return initializingAutoAccept
  }
  function setSetting(keyName: SettingKey, value: boolean) {
    settings.value[keyName] = value
    if (desktop) {
      const { autoAccept } = settings.value
      writeLocalData(key, { autoAccept })
    }
  }
  return { settings, setSetting, autoAcceptReady, initializeAutoAccept }
})
