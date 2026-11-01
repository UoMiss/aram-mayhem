import { describe, expect, it } from 'vitest'
import { HISTORY_FILTERS, MATCH_HISTORY } from './history'

describe('match history mock', () => {
  it('keeps the original seven matches in source order', () => {
    expect(
      MATCH_HISTORY.map((match) => ({
        id: match.id,
        mode: match.mode,
        result: match.result,
        champion: match.champion,
        kda: `${match.kda.kills}/${match.kda.deaths}/${match.kda.assists}`,
        time: match.timeLabel,
      })),
    ).toEqual([
      {
        id: 'match-001',
        mode: 'hex',
        result: 'defeat',
        champion: 'Zeri',
        kda: '18/13/22',
        time: '9小时前',
      },
      {
        id: 'match-002',
        mode: 'hex',
        result: 'victory',
        champion: 'Xerath',
        kda: '7/10/36',
        time: '10小时前',
      },
      {
        id: 'match-003',
        mode: 'hex',
        result: 'defeat',
        champion: 'Malphite',
        kda: '5/8/14',
        time: '10小时前',
      },
      {
        id: 'match-004',
        mode: 'hex',
        result: 'defeat',
        champion: 'Neeko',
        kda: '9/14/16',
        time: '10-25 03:04',
      },
      {
        id: 'match-005',
        mode: 'hex',
        result: 'victory',
        champion: 'Annie',
        kda: '17/13/22',
        time: '10-25 02:39',
      },
      {
        id: 'match-006',
        mode: 'custom',
        result: 'defeat',
        champion: 'Swain',
        kda: '8/10/38',
        time: '10-25 02:17',
      },
      {
        id: 'match-007',
        mode: 'custom',
        result: 'victory',
        champion: 'Aatrox',
        kda: '3/8/24',
        time: '10-25 01:49',
      },
    ])
  })

  it('contains five hex and two custom matches with unique stable ids', () => {
    expect(MATCH_HISTORY).toHaveLength(7)
    expect(MATCH_HISTORY.filter((match) => match.mode === 'hex')).toHaveLength(5)
    expect(MATCH_HISTORY.filter((match) => match.mode === 'custom')).toHaveLength(2)
    expect(new Set(MATCH_HISTORY.map((match) => match.id)).size).toBe(7)
    expect(MATCH_HISTORY.every((match) => match.isFriend)).toBe(true)
    expect(MATCH_HISTORY.every((match) => match.championImage.length > 0)).toBe(true)
  })

  it('keeps filter keys as stable business values', () => {
    expect(HISTORY_FILTERS).toEqual(['all', 'hex', 'custom'])
  })
})
