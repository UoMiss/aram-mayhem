import type { LobbyParticipant, ParticipantSnapshot } from '@/types/participants'
import { array, nullable, object, string, unsigned } from './contracts'
const id = (value: unknown): value is string =>
  string(value) && /^[A-Za-z0-9_-]{1,128}$/.test(value)
const participant = object<LobbyParticipant>({
  id,
  name: nullable(
    (value): value is string => string(value) && value.trim().length > 0 && value.length <= 641,
  ),
})
const snapshot = object<ParticipantSnapshot>({
  accountKey: id,
  lobbyKey: nullable(
    (value): value is string => string(value) && value.trim().length > 0 && value.length <= 256,
  ),
  status: (value): value is ParticipantSnapshot['status'] =>
    value === 'custom' ||
    value === 'party' ||
    value === 'champ_select' ||
    value === 'not_custom' ||
    value === 'no_lobby',
  players: (value): value is LobbyParticipant[] =>
    array(participant)(value) &&
    value.length <= 100 &&
    new Set(value.map((player) => player.id)).size === value.length,
  updatedAt: unsigned,
})
export function isParticipantSnapshot(value: unknown): value is ParticipantSnapshot {
  return (
    snapshot(value) &&
    ((value.status !== 'not_custom' && value.status !== 'no_lobby') || value.players.length === 0)
  )
}
