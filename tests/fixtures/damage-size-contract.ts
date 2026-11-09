import type { SettlementSnapshot, SizeOutcome } from '@/types/settlement-api'
import { testSettlement } from './settlement-contract'
export function testDamageSize(outcome: SizeOutcome = 'big'): SettlementSnapshot {
  const value = testSettlement({
    appliedRule: 'damage_size',
    rankingStatus: 'not_applicable',
    lockedRule: true,
  })
  value.players = value.players.map((p) => ({
    ...p,
    rank: null,
    ruleValue: null,
    damage: '18446744073709551615',
  }))
  value.damageSize = {
    status: 'ready',
    reason: null,
    outcome,
    participants: value.players.map((p) => ({
      id: p.id,
      identity: p.isSelf ? value.accountKey : `person-${p.id}`,
      nickname: p.nickname,
      damage: p.damage,
      group: 'big',
    })),
    redPacketPlayerIds: outcome === 'big' ? value.players.map((p) => p.id) : [],
    frozenAt: 1793760001000,
  }
  return value
}
