import type { ParticipantSnapshot } from '../../src/types/participants'
export function testParticipants(
  count = 10,
  overrides: Partial<ParticipantSnapshot> = {},
): ParticipantSnapshot {
  return {
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
