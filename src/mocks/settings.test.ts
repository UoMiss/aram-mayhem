import { describe, expect, it } from 'vitest'
import { createDefaultSettings, SETTINGS_OPTIONS, SETTINGS_VERSION } from './settings'

describe('settings mock', () => {
  it('defaults all three settings to true', () => {
    expect(createDefaultSettings()).toEqual({
      autoStart: true,
      autoRetry: true,
      soundEffects: true,
    })
  })

  it('returns an independent default object each time', () => {
    const first = createDefaultSettings()
    const second = createDefaultSettings()
    first.autoStart = false

    expect(second.autoStart).toBe(true)
  })

  it('keeps the original setting keys and demo version', () => {
    expect(SETTINGS_OPTIONS).toEqual(['autoStart', 'autoRetry', 'soundEffects'])
    expect(SETTINGS_VERSION).toBe('v2.4.0-release')
  })
})
