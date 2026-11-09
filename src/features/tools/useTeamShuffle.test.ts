import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TEAM_DRAW_PLAYERS } from '@/mocks/tools'
import { useTeamShuffle } from './useTeamShuffle'
import { splitCustomTeams } from './teamRandomizer'

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

const fixedNow = () => new Date('2026-11-01T07:04:05Z')

describe('useTeamShuffle', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it.each([6, 8, 10])('animates %i players without redrawing the final split', (count) => {
    const players = Array.from({ length: count }, (_, i) => ({ id: `p-${i}`, name: `玩家${i}` }))
    const random = vi.fn(seededRandom(3))
    const expected = splitCustomTeams(players, seededRandom(3))
    const shuffle = useTeamShuffle(players, { random, now: fixedNow })
    shuffle.start()
    const preview = [...names(shuffle.groupA.value), ...names(shuffle.groupB.value)]
    vi.advanceTimersByTime(120)
    expect([...names(shuffle.groupA.value), ...names(shuffle.groupB.value)]).not.toEqual(preview)
    expect(random).toHaveBeenCalledTimes(count - 1)
    vi.advanceTimersByTime(2879)
    expect(shuffle.isShuffling.value).toBe(true)
    expect(shuffle.randomTime.value).toBe('')
    vi.advanceTimersByTime(1)
    expect(shuffle.isShuffling.value).toBe(false)
    expect(shuffle.groupA.value).toEqual(expected.groupA)
    expect(shuffle.groupB.value).toEqual(expected.groupB)
    expect(random).toHaveBeenCalledTimes(count - 1)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('keeps the three-second reveal with reduced motion, using a static preview', () => {
    vi.stubGlobal('window', { matchMedia: () => ({ matches: true }) })
    const shuffle = useTeamShuffle(TEAM_DRAW_PLAYERS, { now: fixedNow })
    shuffle.start()
    expect(shuffle.isShuffling.value).toBe(true)
    expect(shuffle.randomTime.value).toBe('')
    const preview = names(shuffle.groupA.value)
    vi.advanceTimersByTime(1000)
    expect(shuffle.countdown.value).toBe(2)
    expect(names(shuffle.groupA.value)).toEqual(preview)
    vi.advanceTimersByTime(1000)
    expect(shuffle.countdown.value).toBe(1)
    vi.advanceTimersByTime(999)
    expect(shuffle.isShuffling.value).toBe(true)
    vi.advanceTimersByTime(1)
    expect(shuffle.isShuffling.value).toBe(false)
    expect(shuffle.randomTime.value).toBe('2026/11/01 15:04:05')
    expect(vi.getTimerCount()).toBe(0)
  })

  it('runs the original three-second countdown and finalizes the split', () => {
    const shuffle = useTeamShuffle(TEAM_DRAW_PLAYERS, {
      random: seededRandom(3),
      now: fixedNow,
    })

    expect(shuffle.hasResult.value).toBe(false)
    expect(shuffle.countdown.value).toBe(3)
    expect(shuffle.start()).toBe(true)
    expect(shuffle.isShuffling.value).toBe(true)
    expect(shuffle.hasResult.value).toBe(true)
    expect(shuffle.countdown.value).toBe(3)
    expect(shuffle.groupA.value).toHaveLength(4)
    expect(shuffle.groupB.value).toHaveLength(4)

    vi.advanceTimersByTime(1000)
    expect(shuffle.countdown.value).toBe(2)
    vi.advanceTimersByTime(1000)
    expect(shuffle.countdown.value).toBe(1)

    vi.advanceTimersByTime(1000)
    expect(shuffle.isShuffling.value).toBe(false)
    expect(shuffle.countdown.value).toBe(0)
    expect(shuffle.randomTime.value).toBe('2026/11/01 15:04:05')
    expect(shuffle.groupA.value).toHaveLength(4)
    expect(shuffle.groupB.value).toHaveLength(4)
    expect(new Set([...names(shuffle.groupA.value), ...names(shuffle.groupB.value)]).size).toBe(8)
  })

  it('ignores duplicate starts while shuffling', () => {
    const shuffle = useTeamShuffle(TEAM_DRAW_PLAYERS, {
      random: seededRandom(4),
      now: fixedNow,
    })

    expect(shuffle.start()).toBe(true)
    expect(shuffle.start()).toBe(false)
    expect(shuffle.isShuffling.value).toBe(true)

    vi.advanceTimersByTime(3000)
    expect(shuffle.isShuffling.value).toBe(false)
  })

  it('cancels a pending reveal on reset and gives the next draw its own three seconds', () => {
    const shuffle = useTeamShuffle(TEAM_DRAW_PLAYERS)
    shuffle.start()
    vi.advanceTimersByTime(2000)
    shuffle.reset()
    expect(vi.getTimerCount()).toBe(0)
    expect(shuffle.groupA.value).toEqual([])
    shuffle.start()
    vi.advanceTimersByTime(1000)
    expect(shuffle.isShuffling.value).toBe(true)
    expect(shuffle.countdown.value).toBe(2)
    expect(shuffle.randomTime.value).toBe('')
    vi.advanceTimersByTime(2000)
    expect(shuffle.isShuffling.value).toBe(false)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('clears all timers on dispose and leaves the final state untouched', () => {
    const shuffle = useTeamShuffle(TEAM_DRAW_PLAYERS, {
      random: seededRandom(5),
      now: fixedNow,
    })

    shuffle.start()
    vi.advanceTimersByTime(500)
    const groupABefore = names(shuffle.groupA.value)
    const groupBBefore = names(shuffle.groupB.value)

    expect(vi.getTimerCount()).toBeGreaterThan(0)
    shuffle.dispose()
    expect(vi.getTimerCount()).toBe(0)
    expect(shuffle.isShuffling.value).toBe(false)

    vi.advanceTimersByTime(5000)
    expect(names(shuffle.groupA.value)).toEqual(groupABefore)
    expect(names(shuffle.groupB.value)).toEqual(groupBBefore)
    expect(shuffle.randomTime.value).toBe('')
  })
  it('freezes the draw participants and reset cancels animation and clears results', () => {
    let players = [...TEAM_DRAW_PLAYERS]
    const shuffle = useTeamShuffle(() => players)
    shuffle.start()
    players = []
    vi.advanceTimersByTime(3000)
    expect(shuffle.groupA.value.length + shuffle.groupB.value.length).toBe(8)
    shuffle.reset()
    expect(shuffle.hasResult.value).toBe(false)
    expect(shuffle.groupA.value).toEqual([])
    expect(shuffle.randomTime.value).toBe('')
    expect(vi.getTimerCount()).toBe(0)
    expect(shuffle.start()).toBe(false)
  })
})
