export type SettingKey = 'autoAccept'

export interface SettingsFlags {
  autoAccept: boolean
}

export const UPDATE_PHASES = [
  'idle',
  'checking',
  'up_to_date',
  'available',
  'downloading',
  'verifying',
  'ready',
  'installing',
  'error',
] as const
export type UpdatePhase = (typeof UPDATE_PHASES)[number]
export interface UpdateSnapshot {
  revision: number
  phase: UpdatePhase
  latest: string | null
  notes: string | null
  downloaded: number
  total: number | null
  canDownload: boolean
  canInstall: boolean
  errorCode: string | null
}
