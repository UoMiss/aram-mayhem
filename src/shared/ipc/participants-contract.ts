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
  completeness: (v): v is ParticipantSnapshot['completeness'] =>
    v === 'complete' || v === 'partial' || v === 'unknown',
  evidence: (v): v is ParticipantSnapshot['evidence'] =>
    v === 'custom_teams' || v === 'members' || v === 'none',
  issue: nullable((v): v is NonNullable<ParticipantSnapshot['issue']> =>
    ['missing_teams', 'unresolved_slots', 'conflicting_roster', 'missing_context'].includes(
      v as string,
    ),
  ),
  eligibleCount: unsigned,
  unresolvedCount: (v): v is number => unsigned(v) && v <= 400,
  context: nullable(
    object<NonNullable<ParticipantSnapshot['context']>>({
      sessionKey: (v): v is string => string(v) && v.trim().length > 0 && v.length <= 512,
      connectionGeneration: unsigned,
    }),
  ),
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
    value.eligibleCount === value.players.length &&
    (value.completeness !== 'complete' ||
      (value.status === 'custom' &&
        value.evidence === 'custom_teams' &&
        value.issue === null &&
        value.unresolvedCount === 0 &&
        value.context !== null &&
        value.lobbyKey !== null)) &&
    (value.status === 'custom' || value.context === null) &&
    ((value.status !== 'not_custom' && value.status !== 'no_lobby') || value.players.length === 0)
  )
}
