import { describe, expect, it } from 'vitest'
import { testDamageSize } from '../../../tests/fixtures/damage-size-contract'
import { isSettlementSnapshot } from './settlement-contract'
import { isDamageSizeResult } from './damage-size-contract'
describe('non-ranking size IPC', () => {
  it.each(['big', 'small'] as const)('accepts exact u64, null ranks and %s outcome', (outcome) => {
    expect(isSettlementSnapshot(testDamageSize(outcome))).toBe(true)
  })
  it.each([
    (v: ReturnType<typeof testDamageSize>) => {
      v.damageSize!.redPacketPlayerIds = null
    },
    (v: ReturnType<typeof testDamageSize>) => {
      v.damageSize!.redPacketPlayerIds = ['stranger']
    },
    (v: ReturnType<typeof testDamageSize>) => {
      v.damageSize!.redPacketPlayerIds = ['1', '1']
    },
    (v: ReturnType<typeof testDamageSize>) => {
      v.damageSize!.participants[0]!.group = 'small'
    },
    (v: ReturnType<typeof testDamageSize>) => {
      v.damageSize!.participants[0]!.damage = '18446744073709551616'
    },
    (v: ReturnType<typeof testDamageSize>) => {
      v.damageSize!.participants[0]!.damage = '1e3'
    },
    (v: ReturnType<typeof testDamageSize>) => {
      v.damageSize!.participants[0]!.identity = v.damageSize!.participants[1]!.identity
    },
    (v: ReturnType<typeof testDamageSize>) => {
      v.lockedRule = false
    },
    (v: ReturnType<typeof testDamageSize>) => {
      v.players[0]!.isFriend = false
    },
    (v: ReturnType<typeof testDamageSize>) => {
      v.rankingStatus = 'ready'
    },
    (v: ReturnType<typeof testDamageSize>) => {
      v.players[0]!.rank = 1
    },
  ])('rejects inconsistent formal results (%#)', (mutate) => {
    const value = testDamageSize()
    mutate(value)
    expect(isSettlementSnapshot(value)).toBe(false)
  })
  it('separates a pending/unlocked result from a formal empty sender list', () => {
    const value = testDamageSize('small')
    Object.assign(value.damageSize!, {
      status: 'preview',
      reason: 'unlocked',
      outcome: null,
      redPacketPlayerIds: null,
      frozenAt: null,
    })
    value.lockedRule = false
    expect(isSettlementSnapshot(value)).toBe(true)
    value.damageSize!.redPacketPlayerIds = []
    expect(isSettlementSnapshot(value)).toBe(false)
  })
  it('allows verified conflict snapshots but not malformed saved data', () => {
    const size = testDamageSize().damageSize!
    size.status = 'conflict'
    size.reason = 'data_conflict'
    expect(isDamageSizeResult(size)).toBe(true)
    size.outcome = null
    expect(isDamageSizeResult(size)).toBe(false)
  })
})
