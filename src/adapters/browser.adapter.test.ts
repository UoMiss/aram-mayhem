import { describe, expect, it } from 'vitest'
import { browserAdapter, browserGameflowAdapter, browserLcuAdapter } from './browser.adapter'

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

describe('browser gameflow adapter', () => {
  it('returns an explicit Mock gameflow snapshot, never a real LCU claim', async () => {
    const snapshot = await browserGameflowAdapter.startMonitoring()
    expect(snapshot).toMatchObject({
      connected: true,
      phase: 'lobby',
      rawPhase: 'Lobby',
      source: 'mock',
      simulated: true,
      transport: 'polling',
    })

    const stopped = await browserGameflowAdapter.stopMonitoring()
    expect(stopped).toMatchObject({
      connected: false,
      phase: null,
      source: 'mock',
      simulated: true,
      transport: 'disconnected',
    })
  })
})
