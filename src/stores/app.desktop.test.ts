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

  it('ignores an older revision and keeps bridge errors until explicitly cleared', () => {
    const app = useAppStore()
    app.setLcuStatus(status({ revision: 5 }))
    app.setLcuStatus(status({ revision: 4, status: 'disconnected' }))
    expect(app.isConnected).toBe(true)

    app.setLcuError('lcu.subscribe_failed')
    expect(app.lcuBridgeError).toBe('lcu.subscribe_failed')
    app.setLcuStatus(status({ revision: 6 }))
    expect(app.lcuBridgeError).toBe('lcu.subscribe_failed')
    app.clearLcuError()
    expect(app.lcuBridgeError).toBeNull()
  })
})

describe('gameflow store revision guard', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('rejects older and equal revisions but accepts newer snapshots', () => {
    const app = useAppStore()
    const base = {
      readyCheckStatus: null,
      revision: 2,
      updatedAt: 2,
      connected: true,
      phase: 'lobby' as const,
      rawPhase: 'Lobby',
      transport: 'polling' as const,
      source: 'real' as const,
      simulated: false,
      session: null,
      code: null,
      message: null,
    }
    app.setGameflowSnapshot(base)
    app.setGameflowSnapshot({ ...base, revision: 1, phase: 'champ_select' })
    app.setGameflowSnapshot({ ...base, phase: 'champ_select' })
    expect(app.gameflowSnapshot?.phase).toBe('lobby')
    app.setGameflowSnapshot({ ...base, revision: 3, phase: 'champ_select' })
    expect(app.gameflowSnapshot?.phase).toBe('champ_select')
  })

  it('keeps connection status and gameflow independent', () => {
    const app = useAppStore()
    app.setLcuStatus({
      status: 'unsupported_platform',
      code: 'unsupported_platform',
      message: null,
      source: 'unavailable',
      simulated: false,
      revision: 1,
      updatedAt: 1,
      monitoring: false,
    })
    app.setGameflowSnapshot({
      readyCheckStatus: null,
      revision: 99,
      updatedAt: 99,
      connected: false,
      phase: null,
      rawPhase: null,
      transport: 'disconnected',
      source: 'unavailable',
      simulated: false,
      session: null,
      code: 'unsupported_platform',
      message: null,
    })
    expect(app.connectionPhase).toBe('disconnected')
    expect(app.isConnected).toBe(false)
    expect(app.lcuStatus?.status).toBe('unsupported_platform')
    expect(app.gameflowSnapshot?.phase).toBeNull()
  })
})
