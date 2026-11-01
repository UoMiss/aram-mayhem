import { describe, expect, it } from 'vitest'
import { browserAdapter } from './browser.adapter'

describe('browser desktop adapter', () => {
  it('returns a typed Mock health response without contacting Tauri', async () => {
    const health = await browserAdapter.getHealth()

    expect(health).toMatchObject({
      status: 'ok',
      runtime: 'browser',
      appName: 'ARAM: Mayhem',
      simulated: true,
    })
    expect(typeof health.platform).toBe('string')
    expect(health.platform.length).toBeGreaterThan(0)
  })
})
