export interface LcuHistoryMatch {
  id: string
  queueId: number | null
  mapId: number | null
  gameMode: string | null
  gameType: string | null
  createdAt: number
  durationSeconds: number
  championId: number
  championName: string | null
  win: boolean
  isFriend?: boolean
  kills: number
  deaths: number
  assists: number
  damageDealt: number | null
  damageTaken: number | null
  goldEarned: number | null
}
export interface MatchHistorySnapshot {
  accountKey: string
  displayName: string | null
  matches: LcuHistoryMatch[]
  updatedAt: number
}
