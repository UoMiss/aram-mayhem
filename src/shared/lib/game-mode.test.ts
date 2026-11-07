import { describe, expect, it } from 'vitest'
import { resolveGameMode } from './game-mode'
import { matchMode } from './history-presentation'
import { isModeContext, isSession } from '@/shared/ipc/contracts'
import { homeFlow } from '../../../tests/fixtures/home-contract'

describe('shared mode resolution', () => {
  it.each([
    [2400, 'hex'],
    [450, 'aram'],
    [0, 'custom'],
    [420, 'other'],
    [9999, 'other'],
    [null, null],
    [undefined, null],
    [-1, null],
    [1.5, null],
    [NaN, null],
    [Number.MAX_SAFE_INTEGER + 1, null],
  ])('classifies queue %s without guessing from ARAM', (queueId, mode) => {
    expect(resolveGameMode({ queueId, gameMode: 'ARAM' })).toBe(mode)
    expect(matchMode({ queueId: queueId ?? null, gameMode: 'ARAM', gameType: null })).toBe(
      mode ?? 'other',
    )
  })
  it('uses explicit custom evidence and respects a non-custom game type over queue zero', () => {
    expect(resolveGameMode({ queueId: 450, gameType: 'CUSTOM_GAME' })).toBe('custom')
    expect(resolveGameMode({ queueId: 2400, isCustomGame: true })).toBe('custom')
    expect(resolveGameMode({ queueId: 0, gameType: 'MATCHED_GAME' })).toBe('other')
    expect(resolveGameMode({ queueId: 0, isCustomGame: false })).toBe('other')
  })
  it('requires explicit mode context and rejects old sessions', () => {
    const session = homeFlow().session!
    expect(isSession(session)).toBe(true)
    const { modeContext, ...legacy } = session
    expect(isSession(legacy)).toBe(false)
    expect(isSession({ ...session, modeContext: null })).toBe(true)
    expect(isModeContext({ ...modeContext, queueId: -1 })).toBe(false)
    expect(isModeContext({ ...modeContext, source: 'guess' })).toBe(false)
    expect(isModeContext({ ...modeContext, isCustomGame: 'true' })).toBe(false)
  })
})
