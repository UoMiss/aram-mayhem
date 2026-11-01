import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { i18n } from '@/i18n'
import { TOAST_DURATION_MS, useAppStore } from '@/stores/app'

describe('settings state', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.clearAllTimers()
    vi.useRealTimers()
  })

  it('starts with all three switches on', () => {
    const app = useAppStore()
    expect(app.settings).toEqual({
      autoStart: true,
      autoRetry: true,
      soundEffects: true,
    })
  })

  it('toggles each setting independently', () => {
    const app = useAppStore()

    app.setSetting('autoStart', false)
    expect(app.settings).toEqual({
      autoStart: false,
      autoRetry: true,
      soundEffects: true,
    })

    app.setSetting('autoRetry', false)
    expect(app.settings).toEqual({
      autoStart: false,
      autoRetry: false,
      soundEffects: true,
    })

    app.setSetting('soundEffects', false)
    expect(app.settings).toEqual({
      autoStart: false,
      autoRetry: false,
      soundEffects: false,
    })

    app.setSetting('autoStart', true)
    expect(app.settings.autoStart).toBe(true)
    expect(app.settings.autoRetry).toBe(false)
    expect(app.settings.soundEffects).toBe(false)
  })

  it('keeps settings while switching tabs', () => {
    const app = useAppStore()
    app.setSetting('autoRetry', false)

    app.setActiveTab('home')
    app.setActiveTab('history')
    app.setActiveTab('tools')
    app.setActiveTab('settings')

    expect(app.settings.autoRetry).toBe(false)
    expect(app.settings.autoStart).toBe(true)
    expect(app.settings.soundEffects).toBe(true)
  })

  it('does not change the current score rule when settings change', () => {
    const app = useAppStore()
    app.setCurrentRule('damage')

    app.setActiveTab('settings')
    app.setSetting('soundEffects', false)
    app.setActiveTab('home')

    expect(app.currentRule).toBe('damage')
  })

  it('uses the original update message through the existing toast', () => {
    const app = useAppStore()

    const message = i18n.global.t('settings.updateLatest')
    app.notify(message)
    expect(app.toastMessage).toBe('已是最新版本！')
    expect(app.toastTone).toBe('success')
    expect(app.toastVisible).toBe(true)

    vi.advanceTimersByTime(TOAST_DURATION_MS)
    expect(app.toastVisible).toBe(false)
  })
})
