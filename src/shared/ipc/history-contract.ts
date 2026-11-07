import type { LcuHistoryMatch, MatchHistorySnapshot } from '@/types/history-api'
import { array, boolean, nullable, object, string, unsigned } from './contracts'

const positive = (value: unknown): value is number => unsigned(value) && value > 0
const id = (value: unknown): value is string =>
  string(value) && /^[0-9]{1,32}$/.test(value) && /[1-9]/.test(value)
export const isHistoryMatch = object<LcuHistoryMatch>({
  id,
  queueId: nullable(unsigned),
  mapId: nullable(positive),
  gameMode: nullable(string),
  gameType: nullable(string),
  createdAt: (value): value is number => positive(value) && value <= 8.64e15,
  durationSeconds: unsigned,
  championId: positive,
  championName: nullable(string),
  win: boolean,
  isFriend: (value): value is boolean | undefined => value === undefined || boolean(value),
  kills: unsigned,
  deaths: unsigned,
  assists: unsigned,
  damageDealt: nullable(unsigned),
  damageTaken: nullable(unsigned),
  goldEarned: nullable(unsigned),
})
export const isHistorySnapshot = object<MatchHistorySnapshot>({
  accountKey: (value): value is string => string(value) && value.length > 0 && value.length <= 128,
  displayName: nullable(string),
  matches: (value): value is LcuHistoryMatch[] =>
    array(isHistoryMatch)(value) &&
    value.length <= 20 &&
    new Set(value.map((item) => item.id)).size === value.length,
  updatedAt: unsigned,
})
