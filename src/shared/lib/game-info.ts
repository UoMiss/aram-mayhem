import { i18n } from '@/i18n'
import type { GameInfoInput, GameMetadata } from '@/types/game-info'
import { resolveGameMode } from './game-mode'

const queues: Record<number, string> = {
  2400: 'history.modes.hex',
  450: 'history.modes.aram',
  420: 'gameInfo.rankedSolo',
  440: 'gameInfo.rankedFlex',
}
const maps: Record<number, string> = {
  11: 'gameInfo.summonersRift',
  12: 'gameInfo.howlingAbyss',
  14: 'gameInfo.butchersBridge',
}
export const validMapId = (id: unknown): id is number => Number.isSafeInteger(id) && Number(id) > 0
export const validQueueId = (id: unknown): id is number =>
  Number.isSafeInteger(id) && Number(id) >= 0 && Number(id) <= 2147483647
function localizedName(name: string | null | undefined) {
  const trimmed = name?.trim()
  return trimmed &&
    trimmed.length <= 160 &&
    !/\p{Cc}/u.test(trimmed) &&
    /\p{Script=Han}/u.test(trimmed)
    ? trimmed
    : null
}
export function resolveGameInfo(input: GameInfoInput | null, metadata?: GameMetadata | null) {
  const t = i18n.global.t
  if (!input)
    return {
      gameTypeLabel: '—',
      mapLabel: '—',
      queueNameSource: 'unknown',
      mapNameSource: 'unknown',
    } as const
  const queueId = validQueueId(input.queueId) ? input.queueId : null
  const mapId = validMapId(input.mapId) ? input.mapId : null
  const custom = resolveGameMode(input) === 'custom'
  const queueName =
    queueId !== null && metadata?.queueId === queueId ? localizedName(metadata.queueName) : null
  const mapName =
    mapId !== null && metadata?.mapId === mapId ? localizedName(metadata.mapName) : null
  const queueKey = custom ? 'history.modes.custom' : queueId !== null ? queues[queueId] : undefined
  const mapKey = mapId !== null ? maps[mapId] : undefined
  return {
    gameTypeLabel: custom
      ? t('history.modes.custom')
      : (queueName ??
        t(queueKey ?? (queueId === null ? 'gameInfo.pending' : 'gameInfo.unknownQueue'))),
    mapLabel: mapName ?? t(mapKey ?? (mapId === null ? 'gameInfo.pending' : 'gameInfo.unknownMap')),
    queueNameSource: custom ? 'fallback' : queueName ? 'client' : queueKey ? 'fallback' : 'unknown',
    mapNameSource: mapName ? 'client' : mapKey ? 'fallback' : 'unknown',
  } as const
}
