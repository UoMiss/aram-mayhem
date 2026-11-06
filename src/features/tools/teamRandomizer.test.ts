import { describe, expect, it } from 'vitest'
import { TEAM_DRAW_PLAYERS } from '@/mocks/tools'
import { formatBeijingTime, shufflePlayers, splitTeams } from './teamRandomizer'

function seededRandom(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0
    return state / 2 ** 32
  }
}

function names(players: readonly { name: string }[]): string[] {
  return players.map((player) => player.name)
}

describe('team randomizer', () => {
  it('splits eight players into two four-player groups without loss or duplicates', () => {
    for (let seed = 1; seed <= 30; seed += 1) {
      const split = splitTeams(TEAM_DRAW_PLAYERS, seededRandom(seed))
      const allNames = [...names(split.groupA), ...names(split.groupB)]

      expect(split.groupA).toHaveLength(4)
      expect(split.groupB).toHaveLength(4)
      expect(new Set(allNames).size).toBe(8)
      expect([...allNames].sort()).toEqual([...names(TEAM_DRAW_PLAYERS)].sort())
    }
  })

  it('preserves all participants for ten-player and odd-sized lobbies', () => {
    for (const count of [0, 1, 2, 9, 10, 16]) {
      const players = Array.from({ length: count }, (_, index) => ({
        id: String(index),
        name: String(index),
      }))
      const split = splitTeams(players, seededRandom(7))
      expect(split.groupA.length + split.groupB.length).toBe(count)
      expect(Math.abs(split.groupA.length - split.groupB.length)).toBeLessThanOrEqual(1)
      expect(new Set([...split.groupA, ...split.groupB].map((player) => player.id)).size).toBe(
        count,
      )
    }
  })

  it('does not mutate the original player array', () => {
    const before = names(TEAM_DRAW_PLAYERS)
    const shuffled = shufflePlayers(TEAM_DRAW_PLAYERS, seededRandom(7))
    splitTeams(TEAM_DRAW_PLAYERS, seededRandom(11))

    expect(names(TEAM_DRAW_PLAYERS)).toEqual(before)
    expect(names(shuffled)).toHaveLength(8)
    expect(names(shuffled)).not.toBe(before)
  })

  it('uses Fisher-Yates ordering with a controlled random source', () => {
    const rotated = shufflePlayers(TEAM_DRAW_PLAYERS, () => 0)
    expect(names(rotated)).toEqual([
      '洞爷湖',
      '黛乃奈昭姿',
      'Faker',
      '湘川苦茶子',
      '奢谨筱箅栗',
      '翻斗花园牛爷爷',
      '召唤师52395',
      'Ezreal',
    ])
  })

  it('formats Beijing time independently of the system timezone', () => {
    expect(formatBeijingTime(new Date('2026-11-01T07:04:05Z'))).toBe('2026/11/01 15:04:05')
    expect(formatBeijingTime(new Date('2026-12-31T16:00:00Z'))).toBe('2027/01/01 00:00:00')
  })
})
