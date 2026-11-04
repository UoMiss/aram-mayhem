import type { SettingKey, SettingsFlags } from '@/types/settings'

/** 原始设置页三行开关的业务 key，顺序保持不变；中文标签由 i18n 提供。 */
export const SETTINGS_OPTIONS: readonly SettingKey[] = ['autoStart', 'autoRetry', 'soundEffects']

/** 每次返回独立对象；刷新后恢复这三个默认值。 */
export function createDefaultSettings(): SettingsFlags {
  return {
    autoStart: true,
    autoRetry: true,
    soundEffects: true,
  }
}
