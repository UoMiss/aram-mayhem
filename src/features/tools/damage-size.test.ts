import { describe, expect, it } from 'vitest'
import { SCORE_RULE_OPTIONS } from '@/mocks/tools'
import { toggleScoreRule } from './rules'
describe('damage size rule entry', () => {
  it('adds a fourth mutually exclusive rule', () => {
    expect(SCORE_RULE_OPTIONS.map((option) => option.key)).toContain('damage_size')
    const option = SCORE_RULE_OPTIONS.find((option) => String(option.key) === 'damage_size')!
    expect(toggleScoreRule('damage', option.key)).toBe('damage_size')
    expect(toggleScoreRule(option.key, option.key)).toBeNull()
  })
})
