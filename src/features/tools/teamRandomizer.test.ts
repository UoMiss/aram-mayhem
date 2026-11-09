import { describe, expect, it, vi } from 'vitest'
import { useTeamShuffle } from './useTeamShuffle'
import { TEAM_DRAW_PLAYERS } from '@/mocks/tools'
import { formatBeijingTime, shufflePlayers, splitTeams, splitCustomTeams } from './teamRandomizer'

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

describe('strict custom-room draw', () => {
  it.each([6, 8, 10])('splits %i players exactly once with stable seeded results', (count) => {
    const players = Array.from({ length: count }, (_, i) => ({ id: `p${i}`, name: 'same name' }))
    const before = structuredClone(players)
    const first = splitCustomTeams(players, seededRandom(3))
    expect(first.groupA).toHaveLength(count / 2)
    expect(first.groupB).toHaveLength(count / 2)
    expect(new Set([...first.groupA, ...first.groupB].map((p) => p.id)).size).toBe(count)
    expect(splitCustomTeams(players, seededRandom(3))).toEqual(first)
    expect(players).toEqual(before)
  })
  it.each([0, 1, 2, 3, 4, 5, 7, 9, 11, 12])('rejects unsupported size %i', (count) => {
    expect(() =>
      splitCustomTeams(Array.from({ length: count }, (_, i) => ({ id: `p${i}`, name: 'p' }))),
    ).toThrow('unsupported_team_size')
  })
  it('rejects duplicate/invalid IDs and invalid injected random values', () => {
    const players = [...TEAM_DRAW_PLAYERS]
    expect(() => splitCustomTeams([...players.slice(1), players[1]!])).toThrow(
      'duplicate_player_id',
    )
    expect(() => splitCustomTeams(players.map((p) => ({ ...p, id: ' ' })))).toThrow(
      'invalid_player_id',
    )
    for (const value of [1, -1, NaN, Infinity])
      expect(() => splitCustomTeams(players, () => value)).toThrow('invalid_random_value')
  })
  it('does not resample the final result during the animation', () => {
    vi.useFakeTimers()
    try {
      const random = vi.fn(seededRandom(12))
      const draw = useTeamShuffle(TEAM_DRAW_PLAYERS, { random })
      expect(draw.start()).toBe(true)
      const frozen = splitCustomTeams(TEAM_DRAW_PLAYERS, seededRandom(12))
      expect(random).toHaveBeenCalledTimes(7)
      vi.advanceTimersByTime(3000)
      expect(random).toHaveBeenCalledTimes(7)
      expect(draw.groupA.value).toEqual(frozen.groupA)
      expect(draw.groupB.value).toEqual(frozen.groupB)
      draw.reset()
      expect(vi.getTimerCount()).toBe(0)
    } finally {
      vi.useRealTimers()
    }
  })
})

it('uses rejection sampling for the system random source without falling back to Math.random', () => {
  let calls = 0
  const getRandomValues = vi.fn((buffer: Uint32Array) => {
    buffer[0] = calls++ === 0 ? 0xffffffff : 0
    return buffer
  })
  vi.stubGlobal('crypto', { getRandomValues })
  try {
    const result = splitCustomTeams(TEAM_DRAW_PLAYERS.slice(0, 6))
    expect(getRandomValues).toHaveBeenCalledTimes(6)
    expect(result.groupA).toHaveLength(3)
    expect(result.groupB).toHaveLength(3)
  } finally {
    vi.unstubAllGlobals()
  }
})

it.each([6, 8, 10])(
  'has the expected teammate frequency for %i players under fixed seeded sampling',
  (count) => {
    const players = Array.from({ length: count }, (_, i) => ({ id: `p${i}`, name: 'player' }))
    const random = seededRandom(92371)
    const samples = 12000
    let together = 0
    for (let i = 0; i < samples; i++) {
      const { groupA, groupB } = splitCustomTeams(players, random)
      const team = groupA.some((p) => p.id === 'p0') ? groupA : groupB
      if (team.some((p) => p.id === 'p1')) together++
    }
    expect(Math.abs(together / samples - (count / 2 - 1) / (count - 1))).toBeLessThan(0.03)
  },
)
