import type {
  DamageSizeResult,
  SizeOutcome,
  SizeParticipant,
  SizeReason,
} from '@/types/settlement-api'
import { array, nullable, object, string, unsigned } from './contracts'
const exact = (value: unknown): value is string =>
  typeof value === 'string' &&
  /^(0|[1-9]\d{0,19})$/.test(value) &&
  BigInt(value) <= 18446744073709551615n
const outcome = (value: unknown): value is SizeOutcome => value === 'big' || value === 'small'
const identity = (value: unknown): value is string =>
  string(value) && /^[A-Za-z0-9_-]{1,128}$/.test(value) && /[^0-]/.test(value)
const participant = object<SizeParticipant>({
  id: (value): value is string => exact(value) && value !== '0',
  identity,
  nickname: nullable(
    (value): value is string => string(value) && value.length > 0 && value.length <= 1025,
  ),
  damage: nullable(exact),
  group: nullable(outcome),
})
const shape = object<DamageSizeResult>({
  status: (value): value is DamageSizeResult['status'] =>
    string(value) && ['ready', 'preview', 'pending', 'unsupported', 'conflict'].includes(value),
  reason: nullable(
    (value): value is SizeReason =>
      string(value) &&
      [
        'missing_damage',
        'missing_friends',
        'identity_unverified',
        'end_unverified',
        'invalid_match',
        'unsupported_count',
        'unlocked',
        'data_conflict',
        'current_game_active',
      ].includes(value),
  ),
  outcome: nullable(outcome),
  participants: (value): value is SizeParticipant[] =>
    array(participant)(value) && value.length <= 100,
  redPacketPlayerIds: nullable(array(string)),
  frozenAt: nullable((value): value is number => unsigned(value) && value > 0 && value <= 8.64e15),
})
export function isDamageSizeResult(value: unknown): value is DamageSizeResult {
  if (!shape(value)) return false
  const players = value.participants
  if (
    new Set(players.map((p) => p.id)).size !== players.length ||
    new Set(players.map((p) => p.identity)).size !== players.length
  )
    return false
  if (
    players.some(
      (p) => p.group !== (p.damage === null ? null : BigInt(p.damage) % 10n < 5n ? 'small' : 'big'),
    )
  )
    return false
  if (value.status === 'ready' || value.status === 'conflict') {
    if (
      !players.length ||
      !value.outcome ||
      value.frozenAt === null ||
      value.redPacketPlayerIds === null ||
      players.some((p) => p.damage === null)
    )
      return false
    if (value.reason !== (value.status === 'conflict' ? 'data_conflict' : null)) return false
    const expected = players.filter((p) => p.group === value.outcome).map((p) => p.id)
    return (
      new Set(value.redPacketPlayerIds).size === value.redPacketPlayerIds.length &&
      expected.length === value.redPacketPlayerIds.length &&
      expected.every((id) => value.redPacketPlayerIds!.includes(id))
    )
  }
  return (
    value.outcome === null &&
    value.redPacketPlayerIds === null &&
    value.frozenAt === null &&
    value.reason !== null
  )
}
