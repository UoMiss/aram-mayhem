import { expect, it } from 'vitest'
import { testSettlement } from '../../../tests/fixtures/settlement-contract'
import { redPacketSelection } from './settlement-presentation'

it('includes all tied players at the red-packet cutoff and counts eligible ranks only', () => {
  const snapshot = testSettlement()
  const player = snapshot.players[0]!
  snapshot.players = [1, 2, 2, null].map((rank, index) => ({
    ...player,
    id: String(index + 1),
    rank,
  }))
  expect(redPacketSelection(snapshot)).toMatchObject({
    quota: 1,
    entries: [{ id: '2' }, { id: '3' }],
  })
  snapshot.players = Array.from({ length: 10 }, (_, index) => ({
    ...player,
    id: String(index + 1),
    rank: index + 1,
  }))
  expect(redPacketSelection(snapshot)).toBeNull()
  snapshot.isCustom = true
  expect(redPacketSelection(snapshot)?.entries.map((player) => player.rank)).toEqual([
    6, 7, 8, 9, 10,
  ])
})
