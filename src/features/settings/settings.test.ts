import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useAppStore } from '@/stores/app'

describe('settings state', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.clearAllTimers()
    vi.useRealTimers()
  })

  it('starts with automatic acceptance off', () => {
    const app = useAppStore()
    expect(app.settings).toEqual({
      autoAccept: false,
    })
  })

  it('toggles automatic acceptance', () => {
    const app = useAppStore()
    app.setSetting('autoAccept', true)
    expect(app.settings).toEqual({ autoAccept: true })
    app.setSetting('autoAccept', false)
    expect(app.settings).toEqual({ autoAccept: false })
  })

  it('keeps settings while switching tabs', () => {
    const app = useAppStore()
    app.setSetting('autoAccept', true)

    app.setActiveTab('home')
    app.setActiveTab('history')
    app.setActiveTab('tools')
    app.setActiveTab('settings')

    expect(app.settings.autoAccept).toBe(true)
  })

  it('does not change the current score rule when settings change', () => {
    const app = useAppStore()
    app.setCurrentRule('damage')

    app.setActiveTab('settings')
    app.setSetting('autoAccept', true)
    app.setActiveTab('home')

    expect(app.currentRule).toBe('damage')
  })
})
