import type { TeamPlayer, TeamSplit } from '@/types/tools'

export const SUPPORTED_TEAM_COUNTS = [6, 8, 10] as const
export function isSupportedTeamCount(count: number): boolean {
  return SUPPORTED_TEAM_COUNTS.some((n) => n === count)
}

/** A uniformly selected index; rejection avoids modulo bias. No weak fallback. */
function secureIndex(bound: number): number {
  const limit = 2 ** 32 - (2 ** 32 % bound)
  const buffer = new Uint32Array(1)
  do {
    globalThis.crypto.getRandomValues(buffer)
  } while (buffer[0]! >= limit)
  return buffer[0]! % bound
}

export function splitCustomTeams(players: readonly TeamPlayer[], random?: () => number): TeamSplit {
  if (!isSupportedTeamCount(players.length)) throw new Error('unsupported_team_size')
  if (players.some((p) => !/^[A-Za-z0-9_-]{1,128}$/.test(p.id)))
    throw new Error('invalid_player_id')
  if (new Set(players.map((p) => p.id)).size !== players.length)
    throw new Error('duplicate_player_id')
  const result = players.map((p) => ({ ...p }))
  for (let size = result.length; size > 1; size--) {
    const value = random?.()
    if (value !== undefined && (!Number.isFinite(value) || value < 0 || value >= 1))
      throw new Error('invalid_random_value')
    const index = value === undefined ? secureIndex(size) : Math.floor(value * size)
    ;[result[size - 1], result[index]] = [result[index]!, result[size - 1]!]
  }
  return { groupA: result.slice(0, result.length / 2), groupB: result.slice(result.length / 2) }
}

/**
 * Fisher–Yates 洗牌，返回新数组，不修改传入的原始玩家列表。
 */
export function shufflePlayers(
  players: readonly TeamPlayer[],
  random: () => number = Math.random,
): TeamPlayer[] {
  const result = [...players]

  for (let currentIndex = result.length; currentIndex > 0; currentIndex -= 1) {
    const randomIndex = Math.floor(random() * currentIndex)
    const currentPlayer = result[currentIndex - 1]
    const randomPlayer = result[randomIndex]
    result[currentIndex - 1] = randomPlayer
    result[randomIndex] = currentPlayer
  }

  return result
}

/** Split every participant into balanced teams; odd totals differ by one. */
export function splitTeams(
  players: readonly TeamPlayer[],
  random: () => number = Math.random,
): TeamSplit {
  const shuffled = shufflePlayers(players, random)
  const size = Math.ceil(shuffled.length / 2)
  return {
    groupA: shuffled.slice(0, size),
    groupB: shuffled.slice(size),
  }
}

/** 北京时间固定为 Asia/Shanghai，不依赖运行机器的系统时区。 */
export function formatBeijingTime(date: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date)

  const part = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((item) => item.type === type)?.value ?? ''

  return `${part('year')}/${part('month')}/${part('day')} ${part('hour')}:${part('minute')}:${part('second')}`
}
