import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import type { LcuStatusDto } from '@/types/lcu'

vi.mock('@tauri-apps/api/core', () => ({ isTauri: () => true }))

import { useAppStore } from './app'

function status(overrides: Partial<LcuStatusDto> = {}): LcuStatusDto {
  return {
    status: 'connected',
    code: null,
    message: null,
    source: 'real',
    simulated: false,
    revision: 1,
    updatedAt: 1,
    monitoring: true,
    ...overrides,
  }
}

describe('Tauri app store real LCU state', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('does not become connected before a real connected snapshot arrives', () => {
    const app = useAppStore()
    expect(app.isDesktopRuntime).toBe(true)
    expect(app.isConnected).toBe(false)
    expect(app.isRealLcuConnected).toBe(false)

    app.setLcuStatus(status({ status: 'not_running', code: 'client_not_found' }))

    expect(app.isConnected).toBe(false)
    expect(app.isConnecting).toBe(false)
  })

  it('uses a real connected snapshot to drive AppShell and homeView', () => {
    const app = useAppStore()
    app.setLcuStatus(status())

    expect(app.isRealLcuConnected).toBe(true)
    expect(app.isConnected).toBe(true)
    expect(app.homeView.isConnected).toBe(true)
    expect(app.connectionPhase).toBe('disconnected')
  })

  it('restores disconnected when a real disconnected snapshot arrives', () => {
    const app = useAppStore()
    app.setLcuStatus(status())
    app.setLcuStatus(status({ revision: 2, status: 'disconnected', code: 'client_exited' }))

    expect(app.isConnected).toBe(false)
    expect(app.isRealLcuConnected).toBe(false)
  })

  it('never treats simulated or mock sources as a real connection', () => {
    const app = useAppStore()
    app.setLcuStatus(status({ source: 'mock', simulated: true }))
    expect(app.isConnected).toBe(false)

    app.setLcuStatus(status({ revision: 2, source: 'unavailable', simulated: false }))
    expect(app.isConnected).toBe(false)
  })

  it('keeps the browser mock connect action disabled in Tauri', () => {
    const app = useAppStore()
    app.connect()

    expect(app.connectionPhase).toBe('disconnected')
    expect(app.isConnected).toBe(false)
  })

  it('shows connecting for discovering/connecting/reconnecting only with a real source', () => {
    const app = useAppStore()
    for (const state of ['discovering', 'connecting', 'reconnecting'] as const) {
      app.setLcuStatus(status({ revision: 1, status: state }))
      expect(app.isConnecting, state).toBe(true)
    }
  })

  it('ignores an older revision and clears bridge error on real connected', () => {
    const app = useAppStore()
    app.setLcuStatus(status({ revision: 5 }))
    app.setLcuStatus(status({ revision: 4, status: 'disconnected' }))
    expect(app.isConnected).toBe(true)

    app.setLcuError('lcu.subscribe_failed')
    expect(app.lcuBridgeError).toBe('lcu.subscribe_failed')
    app.setLcuStatus(status({ revision: 6 }))
    expect(app.lcuBridgeError).toBeNull()
  })
})
