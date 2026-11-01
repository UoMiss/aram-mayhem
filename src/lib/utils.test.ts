import { describe, expect, it } from 'vitest'
import { cn } from './utils'

describe('cn', () => {
  it('merges ordinary classes', () => {
    expect(cn('rounded-lg', 'text-sm')).toBe('rounded-lg text-sm')
  })

  it('resolves conflicting Tailwind utilities', () => {
    expect(cn('px-2 px-4')).toBe('px-4')
  })
})
