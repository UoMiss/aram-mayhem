import { describe, expect, it } from 'vitest'
import { SCORE_RULE_OPTIONS } from './rules'

describe('score rule options', () => {
  it('keeps the original rule keys, order and icons', () => {
    expect(SCORE_RULE_OPTIONS).toEqual([
      { key: 'damage', icon: 'fa-solid fa-fire' },
      { key: 'lucky', icon: 'fa-solid fa-dice' },
      { key: 'tail', icon: 'fa-solid fa-list-ol' },
      { key: 'damage_size', icon: 'fa-solid fa-dice-two' },
    ])
  })
})
