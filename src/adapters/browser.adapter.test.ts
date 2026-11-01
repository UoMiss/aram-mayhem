import { describe, expect, it } from 'vitest'
import { browserAdapter, browserLcuAdapter } from './browser.adapter'

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

describe('browser LCU adapter', () => {
  it('marks every status as Mock and never as a real LCU connection', async () => {
    const status = await browserLcuAdapter.startMonitoring()
    expect(status).toMatchObject({
      status: 'connected',
      source: 'mock',
      simulated: true,
      monitoring: true,
    })

    const stopped = await browserLcuAdapter.stopMonitoring()
    expect(stopped).toMatchObject({
      status: 'not_running',
      code: 'monitoring_stopped',
      source: 'mock',
      simulated: true,
      monitoring: false,
    })
  })
})
