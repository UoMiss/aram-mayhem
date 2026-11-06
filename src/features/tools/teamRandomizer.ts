import type { TeamPlayer, TeamSplit } from '@/types/tools'

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
