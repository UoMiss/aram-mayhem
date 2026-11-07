import type { MatchMode } from '@/types/history'

interface ModeMetadata {
  queueId?: number | null
  gameMode?: string | null
  gameType?: string | null
  isCustomGame?: boolean | null
}

export function resolveGameMode(metadata: ModeMetadata): MatchMode | null {
  if (metadata.isCustomGame === true || metadata.gameType === 'CUSTOM_GAME') return 'custom'
  const queueId = metadata.queueId
  if (typeof queueId !== 'number' || !Number.isSafeInteger(queueId) || queueId < 0) return null
  // An explicit non-custom match type wins over the legacy queue-zero fallback.
  if (queueId === 0)
    return metadata.gameType || metadata.isCustomGame === false ? 'other' : 'custom'
  if (queueId === 2400) return 'hex'
  if (queueId === 450) return 'aram'
  return 'other'
}
