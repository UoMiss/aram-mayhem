/** Sanitized current-account profile; credentials and raw LCU JSON never cross IPC. */
export interface HomeSnapshot {
  accountKey: string
  displayName: string | null
  summonerLevel: number | null
  updatedAt: number
}
