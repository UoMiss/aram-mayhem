import type { LcuHistoryMatch, MatchHistorySnapshot } from '@/types/history-api'

/** Synthetic contract data; no live account information. */
export const TEST_HISTORY_MATCH: LcuHistoryMatch = {
  id: '18446744073709551615',
  queueId: 2400,
  mapId: null,
  gameMode: 'ARAM',
  gameType: 'MATCHED_GAME',
  createdAt: 1793760000000,
  durationSeconds: 1204,
  championId: 221,
  championName: '泽丽',
  win: true,
  kills: 12,
  deaths: 4,
  assists: 18,
  damageDealt: 34567,
  damageTaken: 18000,
  goldEarned: 12000,
}
export function testHistorySnapshot(
  matches: LcuHistoryMatch[] = [TEST_HISTORY_MATCH],
): MatchHistorySnapshot {
  return {
    accountKey: 'test-current-account',
    displayName: 'Test player',
    updatedAt: 1793760001000,
    matches,
  }
}
