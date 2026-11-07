export interface GameInfoInput {
  queueId: number | null
  mapId: number | null
  gameMode?: string | null
  gameType?: string | null
  isCustomGame?: boolean | null
}
export interface GameMetadata {
  queueId: number | null
  mapId: number | null
  queueName: string | null
  mapName: string | null
}
export interface GameMetadataRequest {
  accountKey: string
  queueId: number | null
  mapId: number | null
}
