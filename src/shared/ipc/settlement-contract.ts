import type { LcuSettlementPlayer, SettlementSnapshot } from '@/types/settlement-api'
import { isDamageSizeResult } from './damage-size-contract'
import type { ScoreRule } from '@/types/home'
import { array, boolean, nullable, object, string, unsigned } from './contracts'
const exact = (value: unknown): value is string =>
  string(value) &&
  /^(0|[1-9]\d{0,19})$/.test(value) &&
  (value.length < 20 || value <= '18446744073709551615')
const positive = (value: unknown): value is number => unsigned(value) && value > 0
const rule = (value: unknown): value is ScoreRule =>
  value === 'damage' || value === 'tail' || value === 'lucky' || value === 'damage_size'
const player = object<LcuSettlementPlayer>({
  id: exact,
  teamId: positive,
  championId: positive,
  level: nullable(positive),
  nickname: nullable(
    (value): value is string => string(value) && value.trim().length > 0 && value.length <= 1025,
  ),
  isSelf: boolean,
  isFriend: boolean,
  win: boolean,
  kills: unsigned,
  deaths: unsigned,
  assists: unsigned,
  damage: nullable(exact),
  taken: nullable(exact),
  healing: nullable(exact),
  rank: nullable(positive),
  ruleValue: nullable(exact),
})
const snapshot = object<SettlementSnapshot>({
  damageSize: (value): value is SettlementSnapshot['damageSize'] =>
    value === undefined || isDamageSizeResult(value),
  id: (value): value is string => exact(value) && value !== '0',
  accountKey: (value): value is string => string(value) && /^[A-Za-z0-9_-]{1,128}$/.test(value),
  queueId: nullable(unsigned),
  mapId: nullable(positive),
  gameMode: nullable(string),
  gameType: nullable(string),
  createdAt: (value): value is number => positive(value) && value <= 8.64e15,
  durationSeconds: unsigned,
  appliedRule: nullable(rule),
  isCustom: boolean,
  rankingStatus: (value): value is SettlementSnapshot['rankingStatus'] =>
    value === 'not_applicable' ||
    value === 'ready' ||
    value === 'no_rule' ||
    value === 'missing_damage' ||
    value === 'missing_lucky' ||
    value === 'missing_friends',
  lockedRule: boolean,
  luckyDigit: nullable((value): value is number => unsigned(value) && value <= 9),
  players: (value): value is LcuSettlementPlayer[] =>
    array(player)(value) &&
    value.length >= 2 &&
    value.length <= 100 &&
    new Set(value.map((item) => item.id)).size === value.length,
  updatedAt: unsigned,
})
export function isSettlementSnapshot(value: unknown): value is SettlementSnapshot {
  if (!snapshot(value) || value.players.filter((player) => player.isSelf).length !== 1) return false
  if (value.appliedRule === 'damage_size') {
    const size = value.damageSize
    const eligible = value.players.filter((p) => value.isCustom || p.isSelf || p.isFriend)
    return (
      !!size &&
      value.rankingStatus === 'not_applicable' &&
      value.luckyDigit === null &&
      value.players.every((p) => p.rank === null && p.ruleValue === null) &&
      ((size.status !== 'ready' && size.status !== 'conflict') || value.lockedRule) &&
      size.participants.every((p) =>
        eligible.some(
          (player) =>
            player.id === p.id &&
            player.damage === p.damage &&
            player.nickname === p.nickname &&
            (!player.isSelf || p.identity === value.accountKey),
        ),
      ) &&
      ((size.status !== 'ready' && size.status !== 'conflict') ||
        size.participants.length === eligible.length) &&
      (!value.isCustom ||
        (size.status !== 'ready' && size.status !== 'conflict') ||
        (size.participants.length >= 3 && size.participants.length <= 10))
    )
  }
  if (
    value.damageSize !== undefined ||
    value.rankingStatus === 'not_applicable' ||
    value.players.some((p) => p.teamId !== 100 && p.teamId !== 200)
  )
    return false
  if (
    ![100, 200].every((teamId) => {
      const team = value.players.filter((player) => player.teamId === teamId)
      return team.length > 0 && team.every((player) => player.win === team[0]!.win)
    })
  )
    return false
  const eligible = value.players.filter(
    (player) => value.isCustom || player.isSelf || player.isFriend,
  )
  if (
    value.players.some(
      (player) => !eligible.includes(player) && (player.rank !== null || player.ruleValue !== null),
    )
  )
    return false
  if (value.rankingStatus === 'ready')
    return (
      value.appliedRule !== null &&
      (value.appliedRule !== 'lucky' || value.luckyDigit !== null) &&
      eligible.every(
        (player) =>
          player.rank !== null && player.rank <= eligible.length && player.damage !== null,
      )
    )
  if (!value.players.every((player) => player.rank === null)) return false
  if (value.rankingStatus === 'no_rule') return value.appliedRule === null
  if (value.rankingStatus === 'missing_lucky')
    return value.appliedRule === 'lucky' && value.luckyDigit === null
  if (value.rankingStatus === 'missing_friends')
    return (
      !value.isCustom &&
      (value.appliedRule === 'tail' ||
        value.appliedRule === 'damage' ||
        (value.appliedRule === 'lucky' && value.luckyDigit !== null))
    )
  return (
    (value.appliedRule === 'tail' ||
      value.appliedRule === 'damage' ||
      (value.appliedRule === 'lucky' && value.luckyDigit !== null)) &&
    eligible.some((player) => player.damage === null)
  )
}
