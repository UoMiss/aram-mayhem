import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useAppStore } from '@/stores/app'
import { toggleScoreRule } from './rules'

describe('tools score rules', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('defaults to tail and supports mutual exclusion', () => {
    const app = useAppStore()
    expect(app.currentRule).toBe('tail')

    app.setCurrentRule(toggleScoreRule(app.currentRule, 'damage'))
    expect(app.currentRule).toBe('damage')

    app.setCurrentRule(toggleScoreRule(app.currentRule, 'lucky'))
    expect(app.currentRule).toBe('lucky')
  })

  it('allows deselecting the active rule', () => {
    const app = useAppStore()
    app.setCurrentRule(toggleScoreRule(app.currentRule, 'tail'))

    expect(app.currentRule).toBeNull()
  })

  it('keeps the rule while switching tabs', () => {
    const app = useAppStore()
    app.setCurrentRule('tail')

    app.setActiveTab('history')
    app.setActiveTab('settings')
    app.setActiveTab('home')

    expect(app.currentRule).toBe('tail')
  })
})
