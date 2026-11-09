import { describe, expect, it } from 'vitest'
import { isHomeSnapshot } from '@/shared/ipc/home-contract'
import { isGameflow } from '@/shared/ipc/contracts'
import { isHistorySnapshot } from '@/shared/ipc/history-contract'
import { isParticipantSnapshot } from '@/shared/ipc/participants-contract'
import { isSettlementSnapshot } from '@/shared/ipc/settlement-contract'
import {
  DEMO_ACCOUNT,
  configureDemo,
  demoFlow,
  demoHome,
  demoHistory,
  demoParticipants,
  demoSettlement,
  demoLockRule,
} from './client-demo'

describe('browser demo native-shaped data', () => {
  it.each([6, 8, 10])(
    'uses valid %i-player custom room data without claiming a real connection',
    (size) => {
      configureDemo({ size, custom: true })
      expect(isHomeSnapshot(demoHome())).toBe(true)
      expect(isGameflow(demoFlow())).toBe(true)
      expect(isHistorySnapshot(demoHistory())).toBe(true)
      expect(demoHistory().matches).toHaveLength(20)
      expect(demoFlow()).toMatchObject({ source: 'mock', simulated: true, phase: 'lobby' })
      expect(isParticipantSnapshot(demoParticipants())).toBe(true)
      expect(demoParticipants().players).toHaveLength(size)
      expect(demoFlow().session!.lobby!.memberCount).toBe(size)
    },
  )
  it('keeps each history card consistent with its settlement, including friend eligibility', () => {
    for (const match of demoHistory().matches) {
      const snapshot = demoSettlement({
        accountKey: DEMO_ACCOUNT,
        gameId: match.id,
        rule: 'damage',
      })
      expect(isSettlementSnapshot(snapshot)).toBe(true)
      expect(snapshot.id).toBe(match.id)
      expect(snapshot.durationSeconds).toBe(match.durationSeconds)
      const self = snapshot.players.find((p) => p.isSelf)!
      expect(self).toMatchObject({
        championId: match.championId,
        win: match.win,
        kills: match.kills,
        deaths: match.deaths,
        assists: match.assists,
        damage: String(match.damageDealt),
      })
      if (!snapshot.isCustom)
        expect(
          snapshot.appliedRule === 'damage_size'
            ? snapshot.damageSize?.participants
            : snapshot.players.filter((p) => p.rank !== null),
        ).toHaveLength(4)
    }
  })
  it('locks once and only draws lucky digits after stats are ready, retaining the same digit', () => {
    configureDemo({ size: 8, custom: true, phase: 'game_start' })
    const session = demoFlow().session!
    const choice = {
      sessionKey: session.sessionKey,
      gameId: session.gameId!,
      rule: 'lucky' as const,
    }
    expect(demoLockRule(choice).luckyDigit).toBeNull()
    expect(demoLockRule({ ...choice, rule: 'damage' }).rule).toBe('lucky')
    const request = { accountKey: DEMO_ACCOUNT, gameId: session.gameId!, rule: 'damage' as const }
    expect(demoSettlement(request).luckyDigit).toBeNull()
    configureDemo({ phase: 'end_of_game', delayed: true })
    expect(() => demoSettlement(request)).toThrow('Demo stats pending')
    expect(() => demoSettlement(request)).toThrow('Demo stats pending')
    const result = demoSettlement(request)
    expect(isSettlementSnapshot(result)).toBe(true)
    expect(result.luckyDigit).toBeGreaterThanOrEqual(0)
    expect(result.luckyDigit).toBeLessThan(10)
    expect(demoSettlement(request).luckyDigit).toBe(result.luckyDigit)
    expect(result.appliedRule).toBe('lucky')
    expect(demoHistory().matches[0]!.id).toBe(result.id)
    expect(demoHistory().matches).toHaveLength(20)
    configureDemo({ size: 6, custom: false })
    expect(demoSettlement(request)).toEqual(result)
    expect(demoSettlement(request).players).toHaveLength(8)
    expect(() => demoSettlement({ ...request, accountKey: 'other' })).toThrow(
      'Demo account changed',
    )
  })
})
