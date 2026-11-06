import type { MatchHistoryItem, MatchMode } from '@/types/history'
import type { LcuHistoryMatch } from '@/types/history-api'
import { getChampionImage, getChampionName } from './champions'

export function matchMode(
  match: Pick<LcuHistoryMatch, 'queueId' | 'gameMode' | 'gameType'>,
): MatchMode {
  if (match.gameType === 'CUSTOM_GAME' || match.queueId === 0) return 'custom'
  // Riot's published queue metadata identifies 2400 as ARAM: Mayhem.
  if (match.queueId === 2400) return 'hex'
  if (match.gameMode === 'ARAM' || match.queueId === 450) return 'aram'
  return 'other'
}
export function toHistoryItem(match: LcuHistoryMatch): MatchHistoryItem {
  return {
    id: match.id,
    mode: matchMode(match),
    result: match.win ? 'victory' : 'defeat',
    champion:
      match.championName?.trim() || getChampionName(match.championId) || `#${match.championId}`,
    championImage: getChampionImage(match.championId),
    kda: { kills: match.kills, deaths: match.deaths, assists: match.assists },
    isFriend: match.isFriend === true,
    timeLabel: '',
    createdAt: match.createdAt,
  }
}
export function formatDuration(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
}
export function formatMatchTime(timestamp: number): string {
  if (!Number.isFinite(timestamp) || Math.abs(timestamp) > 8.64e15) return '—'
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(timestamp)
}
