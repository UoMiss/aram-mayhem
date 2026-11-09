import { describe, expect, it } from 'vitest'
import { SCORE_RULE_OPTIONS, TEAM_DRAW_PLAYERS } from './tools'

describe('tools mock', () => {
  it('keeps the original eight players in order with full names', () => {
    expect(TEAM_DRAW_PLAYERS.map((player) => player.name)).toEqual([
      'Ezreal',
      '洞爷湖',
      '黛乃奈昭姿',
      'Faker',
      '湘川苦茶子',
      '奢谨筱箅栗',
      '翻斗花园牛爷爷',
      '召唤师52395',
    ])
    expect(new Set(TEAM_DRAW_PLAYERS.map((player) => player.id)).size).toBe(8)
    expect(TEAM_DRAW_PLAYERS.some((player) => player.name === '翻斗花园牛...')).toBe(false)
  })

  it('keeps the original rule keys, order and icons', () => {
    expect(SCORE_RULE_OPTIONS).toEqual([
      { key: 'damage', icon: 'fa-solid fa-fire' },
      { key: 'lucky', icon: 'fa-solid fa-dice' },
      { key: 'tail', icon: 'fa-solid fa-list-ol' },
      { key: 'damage_size', icon: 'fa-solid fa-dice-two' },
    ])
  })
})
