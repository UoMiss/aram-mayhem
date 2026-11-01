import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TEAM_DRAW_PLAYERS } from '@/mocks/tools'
import { useTeamShuffle } from './useTeamShuffle'

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
})
