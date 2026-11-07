import type { AppHealth } from '@/types/desktop'
import type {
  ChampionSelectPlayer,
  ChampionSelectSnapshot,
  GameflowPhase,
  GameflowSnapshot,
  GameSessionContext,
  LcuSource,
  LcuStatusDto,
  LobbySnapshot,
  ModeContext,
  ReadyCheckStatus,
} from '@/types/lcu'
import { LcuServiceError } from '@/services/desktop-error'

type Guard<T> = (value: unknown) => value is T
const string: Guard<string> = (value): value is string => typeof value === 'string'
const boolean: Guard<boolean> = (value): value is boolean => typeof value === 'boolean'
const integer: Guard<number> = (value): value is number => Number.isSafeInteger(value)
export const positive: Guard<number> = (value): value is number => integer(value) && value > 0
const unsigned: Guard<number> = (value): value is number => integer(value) && value >= 0
const nullable =
  <T>(guard: Guard<T>): Guard<T | null> =>
  (value): value is T | null =>
    value === null || guard(value)
const array =
  <T>(guard: Guard<T>): Guard<T[]> =>
  (value): value is T[] =>
    Array.isArray(value) && value.every(guard)
const oneOf =
  <T extends string>(values: readonly T[]): Guard<T> =>
  (value): value is T =>
    string(value) && values.some((item) => item === value)
function object<T>(shape: { [K in keyof T]-?: Guard<T[K]> }): Guard<T> {
  return (value): value is T => {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
    const record = value as Record<string, unknown>
    return (Object.keys(shape) as (keyof T)[]).every((key) => shape[key](record[String(key)]))
  }
}
const source = oneOf<LcuSource>(['real', 'unavailable', 'mock'])
const phase = oneOf<GameflowPhase>([
  'none',
  'lobby',
  'matchmaking',
  'ready_check',
  'champ_select',
  'game_start',
  'in_progress',
  'reconnect',
  'waiting_for_stats',
  'pre_end_of_game',
  'end_of_game',
  'terminated_in_error',
  'unknown',
])
export const isAppHealth = object<AppHealth>({
  status: oneOf(['ok', 'degraded']),
  runtime: oneOf(['browser', 'tauri']),
  appName: string,
  appVersion: string,
  platform: string,
  simulated: boolean,
})
export const isLcuStatus = object<LcuStatusDto>({
  status: oneOf([
    'unsupported_platform',
    'not_running',
    'discovering',
    'connecting',
    'connected',
    'disconnected',
    'reconnecting',
    'error',
  ]),
  code: nullable(string),
  message: nullable(string),
  source,
  simulated: boolean,
  revision: unsigned,
  updatedAt: unsigned,
  monitoring: boolean,
})
export const isLobby = object<LobbySnapshot>({
  lobbyId: nullable(string),
  queueId: nullable(integer),
  mapId: nullable(positive),
  gameMode: nullable(string),
  isCustomGame: (value): value is boolean | null | undefined =>
    value === undefined || nullable(boolean)(value),
  memberCount: nullable(unsigned),
  updatedAt: unsigned,
})
const isPlayer = object<ChampionSelectPlayer>({
  playerId: nullable(string),
  championId: nullable(integer),
  team: oneOf(['my_team', 'their_team']),
  cellId: nullable(integer),
  assignedPosition: nullable(string),
})
export const isChampionSelect = object<ChampionSelectSnapshot>({
  gameId: nullable(string),
  myTeam: array(isPlayer),
  theirTeam: array(isPlayer),
  localPlayerCellId: nullable(integer),
  complete: boolean,
  updatedAt: unsigned,
})
export const isModeContext = object<ModeContext>({
  queueId: nullable(unsigned),
  mapId: nullable(positive),
  gameMode: nullable(string),
  isCustomGame: nullable(boolean),
  source: oneOf(['lobby', 'gameflow']),
})
export const isSession = object<GameSessionContext>({
  modeContext: nullable(isModeContext),
  sessionKey: string,
  gameId: (value): value is string | null | undefined =>
    value === undefined || nullable(string)(value),
  game: (value): value is LobbySnapshot | null | undefined =>
    value === undefined || nullable(isLobby)(value),
  connectionGeneration: unsigned,
  phase,
  startedAt: unsigned,
  updatedAt: unsigned,
  lobby: nullable(isLobby),
  championSelect: nullable(isChampionSelect),
  snapshotComplete: boolean,
})
export const isGameflow = object<GameflowSnapshot>({
  readyCheckStatus: nullable(
    oneOf<ReadyCheckStatus>(['waiting', 'accepting', 'accepted', 'declined', 'failed']),
  ),
  revision: unsigned,
  updatedAt: unsigned,
  connected: boolean,
  phase: nullable(phase),
  rawPhase: nullable(string),
  transport: oneOf(['websocket', 'polling', 'disconnected']),
  source,
  simulated: boolean,
  session: nullable(isSession),
  code: nullable(string),
  message: nullable(string),
})
export { nullable, object, array, unsigned, string, boolean }

/** All native replies/events enter as unknown and are checked before reaching Pinia. */
export function parseContract<T>(value: unknown, guard: Guard<T>): T {
  if (!guard(value))
    throw new LcuServiceError('lcu.invalid_response', '客户端返回的数据格式不正确，请重试')
  return value
}
