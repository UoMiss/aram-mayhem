import { describe, expect, it } from 'vitest'
import { MATCH_DETAIL_FIXTURE } from './match-detail'

describe('match detail fixture', () => {
  it('marks the single fixture as shared and preserves original header data', () => {
    expect(MATCH_DETAIL_FIXTURE.id).toBe('shared-settlement-fixture')
    expect(MATCH_DETAIL_FIXTURE.isSharedFixture).toBe(true)
    expect(MATCH_DETAIL_FIXTURE.queueLabel).toBe('自定义 (屠夫之桥)')
    expect(MATCH_DETAIL_FIXTURE.duration).toBe('24:48')
  })

  it('keeps six players in group order with original ranks and KDA', () => {
    expect(MATCH_DETAIL_FIXTURE.players).toHaveLength(6)
    expect(MATCH_DETAIL_FIXTURE.players.map((player) => player.nickname)).toEqual([
      'Ezreal#60943',
      '湘川苦茶子#23624',
      '召唤师52395#17144',
      '翻斗花园牛爷爷#70976',
      '奢谨筱算粟#12704',
      'Faker#40155',
    ])
    expect(MATCH_DETAIL_FIXTURE.players.filter((player) => player.team === 'red')).toHaveLength(3)
    expect(MATCH_DETAIL_FIXTURE.players.filter((player) => player.team === 'blue')).toHaveLength(3)
    expect(new Set(MATCH_DETAIL_FIXTURE.players.map((player) => player.id)).size).toBe(6)
    expect(MATCH_DETAIL_FIXTURE.players.every((player) => player.level === 18)).toBe(true)
    expect(MATCH_DETAIL_FIXTURE.players.every((player) => player.stats.length === 3)).toBe(true)
  })

  it('derives the original global rank order without sorting by score', () => {
    const globalOrder = [...MATCH_DETAIL_FIXTURE.players]
      .sort((left, right) => (left.rank ?? 0) - (right.rank ?? 0))
      .map((player) => ({ rank: player.rank, champion: player.champion, score: player.score }))

    expect(globalOrder).toEqual([
      { rank: 1, champion: 'Darius', score: 13.5 },
      { rank: 2, champion: 'Swain', score: 11.8 },
      { rank: 3, champion: 'Yasuo', score: 11.4 },
      { rank: 4, champion: 'Ezreal', score: 10.4 },
      { rank: 5, champion: 'Teemo', score: 9.6 },
      { rank: 6, champion: 'Zeri', score: 8.9 },
    ])
  })

  it('computes the original team KDA totals from the same player list', () => {
    const totals = (team: 'red' | 'blue') =>
      MATCH_DETAIL_FIXTURE.players
        .filter((player) => player.team === team)
        .reduce(
          (acc, player) => ({
            kills: acc.kills + player.kda.kills,
            deaths: acc.deaths + player.kda.deaths,
            assists: acc.assists + player.kda.assists,
          }),
          { kills: 0, deaths: 0, assists: 0 },
        )

    expect(totals('red')).toEqual({ kills: 27, deaths: 32, assists: 37 })
    expect(totals('blue')).toEqual({ kills: 32, deaths: 27, assists: 44 })
  })

  it('preserves the red packet list and its original order', () => {
    expect(MATCH_DETAIL_FIXTURE.redPacket.entries).toEqual([
      { name: 'Ezreal', rank: 4 },
      { name: '洞爷湖', rank: 7 },
      { name: 'Faker', rank: 5 },
      { name: '翻斗花园牛爷爷', rank: 1 },
      { name: '召唤师52395', rank: 2 },
    ])
  })

  it('keeps exact stats, percentages and score for the first player', () => {
    expect(MATCH_DETAIL_FIXTURE.players[0]).toMatchObject({
      champion: 'Ezreal',
      rank: 4,
      relation: 'self',
      kda: { kills: 12, deaths: 10, assists: 10 },
      stats: [
        { key: 'damage', value: 39600, percent: 33, tone: 'rose' },
        { key: 'taken', value: 30800, percent: 15, tone: 'amber' },
        { key: 'healing', value: 2800, percent: 6, tone: 'emerald' },
      ],
      score: 10.4,
    })
  })
})
