export type SettingKey = 'autoStart' | 'autoRetry' | 'soundEffects'

/** 设置页三个演示开关；仅保存在内存中，不接入系统或 LCU。 */
export interface SettingsFlags {
  autoStart: boolean
  autoRetry: boolean
  soundEffects: boolean
}
