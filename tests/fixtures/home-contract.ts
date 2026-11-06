import type { HomeSnapshot } from '../../src/types/home-api'
import type { GameflowSnapshot, LcuStatusDto } from '../../src/types/lcu'
export function testHomeSnapshot(overrides: Partial<HomeSnapshot> = {}): HomeSnapshot {
  return {
    accountKey: 'account-1',
    displayName: '真实玩家#CN1',
    summonerLevel: 321,
    updatedAt: 100,
    ...overrides,
  }
}
export function connectedStatus(overrides: Partial<LcuStatusDto> = {}): LcuStatusDto {
  return {
    status: 'connected',
    source: 'real',
    simulated: false,
    revision: 1,
    updatedAt: 1,
    monitoring: true,
    code: null,
    message: null,
    ...overrides,
  }
}
export function homeFlow(overrides: Partial<GameflowSnapshot> = {}): GameflowSnapshot {
  return {
    revision: 1,
    updatedAt: 100,
    connected: true,
    phase: 'lobby',
    rawPhase: 'Lobby',
    transport: 'polling',
    source: 'real',
    simulated: false,
    code: null,
    message: null,
    session: {
      sessionKey: 'session-1',
      connectionGeneration: 1,
      phase: 'lobby',
      startedAt: 100,
      updatedAt: 100,
      snapshotComplete: false,
      lobby: {
        lobbyId: 'lobby-1',
        queueId: 2400,
        gameMode: 'ARAM',
        memberCount: 3,
        updatedAt: 100,
      },
      championSelect: null,
    },
    ...overrides,
  }
}
