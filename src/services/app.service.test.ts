import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  tauri: false,
  getHealth: vi.fn(),
}))

vi.mock('@tauri-apps/api/core', () => ({ isTauri: () => mocks.tauri }))
vi.mock('@/adapters/tauri.adapter', () => ({
  tauriAdapter: { getHealth: mocks.getHealth },
}))

import { getAppHealth, getRuntimeEnvironment } from './app.service'
import type { AppHealth } from '@/types/desktop'

const tauriHealth: AppHealth = {
  status: 'ok',
  runtime: 'tauri',
  appName: 'ARAM: Mayhem',
  appVersion: '0.1.0',
  platform: 'macos',
  simulated: true,
}

describe('app service runtime selection', () => {
  beforeEach(() => {
    mocks.tauri = false
    mocks.getHealth.mockReset()
  })

  it('uses the browser adapter in a normal browser', async () => {
    const health = await getAppHealth()

    expect(getRuntimeEnvironment()).toBe('browser')
    expect(health.runtime).toBe('browser')
    expect(mocks.getHealth).not.toHaveBeenCalled()
  })

  it('lazily uses the Tauri adapter inside the desktop runtime', async () => {
    mocks.tauri = true
    mocks.getHealth.mockResolvedValue(tauriHealth)

    const health = await getAppHealth()

    expect(getRuntimeEnvironment()).toBe('tauri')
    expect(health).toEqual(tauriHealth)
    expect(mocks.getHealth).toHaveBeenCalledTimes(1)
  })
})
