import type { ParticipantSnapshot } from '../../src/types/participants'
export function testParticipants(
  count = 10,
  overrides: Partial<ParticipantSnapshot> = {},
): ParticipantSnapshot {
  return {
    completeness: overrides.status && overrides.status !== 'custom' ? 'unknown' : 'complete',
    evidence: 'custom_teams',
    issue: null,
    eligibleCount: count,
    unresolvedCount: 0,
    context:
      overrides.status && overrides.status !== 'custom'
        ? null
        : { sessionKey: 'session-1', connectionGeneration: 1 },
    accountKey: 'account-1',
    lobbyKey: 'room-1',
    status: 'custom',
    updatedAt: 100,
    players: Array.from({ length: count }, (_, index) => ({
      id: `player-${index + 1}`,
      name: `真实玩家${index + 1}`,
    })),
    ...overrides,
  }
}
