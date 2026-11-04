export type LcuConnectionStatus =
  | 'unsupported_platform'
  | 'not_running'
  | 'discovering'
  | 'connecting'
  | 'connected'
  | 'disconnected'
  | 'reconnecting'
  | 'error'

export type LcuSource = 'real' | 'unavailable' | 'mock'

/** Typed payload shared by Rust, Tauri events and the browser Mock. */
export interface LcuStatusDto {
  status: LcuConnectionStatus
  code: string | null
  message: string | null
  source: LcuSource
  simulated: boolean
  revision: number
  updatedAt: number
  monitoring: boolean
}

export type LcuStatusListener = (status: LcuStatusDto) => void
export type LcuErrorListener = (error: { code: string; message: string }) => void
export type LcuUnlisten = () => void

export interface LcuAdapter {
  getConnectionStatus(): Promise<LcuStatusDto>
  startMonitoring(): Promise<LcuStatusDto>
  stopMonitoring(): Promise<LcuStatusDto>
  subscribe(listener: LcuStatusListener, onError?: LcuErrorListener): Promise<LcuUnlisten>
}

export const LCU_STATUS_EVENT = 'lcu://connection-status'

// --- Phase 10.2 gameflow contract -------------------------------------------------

export type GameflowPhase =
  | 'none'
  | 'lobby'
  | 'matchmaking'
  | 'ready_check'
  | 'champ_select'
  | 'game_start'
  | 'in_progress'
  | 'reconnect'
  | 'waiting_for_stats'
  | 'pre_end_of_game'
  | 'end_of_game'
  | 'terminated_in_error'
  | 'unknown'

export type GameflowTransport = 'websocket' | 'polling' | 'disconnected'

export interface LobbySnapshot {
  lobbyId: string | null
  queueId: number | null
  gameMode: string | null
  memberCount: number | null
  updatedAt: number
}

export interface ChampionSelectPlayer {
  playerId: string | null
  championId: number | null
  team: 'my_team' | 'their_team'
  cellId: number | null
  assignedPosition: string | null
}

export interface ChampionSelectSnapshot {
  gameId: string | null
  myTeam: ChampionSelectPlayer[]
  theirTeam: ChampionSelectPlayer[]
  localPlayerCellId: number | null
  complete: boolean
  updatedAt: number
}

export interface GameSessionContext {
  sessionKey: string
  connectionGeneration: number
  phase: GameflowPhase
  startedAt: number
  updatedAt: number
  lobby: LobbySnapshot | null
  championSelect: ChampionSelectSnapshot | null
  snapshotComplete: boolean
}

export interface GameflowSnapshot {
  revision: number
  updatedAt: number
  connected: boolean
  phase: GameflowPhase | null
  rawPhase: string | null
  transport: GameflowTransport
  source: LcuSource
  simulated: boolean
  session: GameSessionContext | null
  code: string | null
  message: string | null
}

export type GameflowEvent =
  | { type: 'updated'; snapshot: GameflowSnapshot }
  | { type: 'lobby'; lobby: LobbySnapshot | null }
  | { type: 'champ-select'; championSelect: ChampionSelectSnapshot | null }
  | { type: 'session-ended'; session: GameSessionContext | null }

export type GameflowEventListener = (event: GameflowEvent) => void

export interface GameflowAdapter {
  getSnapshot(): Promise<GameflowSnapshot>
  startMonitoring(): Promise<GameflowSnapshot>
  stopMonitoring(): Promise<GameflowSnapshot>
  subscribe(listener: GameflowEventListener, onError?: LcuErrorListener): Promise<LcuUnlisten>
}

export const GAMEFLOW_UPDATED_EVENT = 'lcu://gameflow-updated'
export const GAMEFLOW_LOBBY_EVENT = 'lcu://lobby-updated'
export const GAMEFLOW_CHAMP_SELECT_EVENT = 'lcu://champ-select-updated'
export const GAMEFLOW_SESSION_ENDED_EVENT = 'lcu://session-ended'
