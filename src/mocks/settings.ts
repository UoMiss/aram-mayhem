import type { SettingKey, SettingsFlags } from '@/types/settings'

export const SETTINGS_OPTIONS: readonly SettingKey[] = ['autoAccept']

export function createDefaultSettings(): SettingsFlags {
  return { autoAccept: false }
}
