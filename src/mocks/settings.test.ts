import { describe, expect, it } from 'vitest'
import { createDefaultSettings, SETTINGS_OPTIONS } from './settings'

describe('settings mock', () => {
  it('defaults automatic acceptance off', () => {
    expect(createDefaultSettings()).toEqual({
      autoAccept: false,
    })
  })

  it('returns an independent default object each time', () => {
    const first = createDefaultSettings()
    const second = createDefaultSettings()
    first.autoAccept = true

    expect(second.autoAccept).toBe(false)
  })

  it('only exposes automatic acceptance', () => {
    expect(SETTINGS_OPTIONS).toEqual(['autoAccept'])
  })
})
