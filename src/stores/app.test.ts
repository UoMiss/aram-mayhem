import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { CONNECT_DELAY_MS, TOAST_DURATION_MS, useAppStore } from './app'

describe('app store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.clearAllTimers()
    vi.useRealTimers()
  })

  it('starts disconnected on the home tab', () => {
    const app = useAppStore()

    expect(app.connectionPhase).toBe('disconnected')
    expect(app.isConnected).toBe(false)
    expect(app.isConnecting).toBe(false)
    expect(app.activeTab).toBe('home')
  })

  it('exposes only home business values before connecting', () => {
    const app = useAppStore()

    expect(app.currentRule).toBe('damage')
    expect(app.homeView).toEqual({
      isConnected: false,
      summonerName: '峡谷小米',
      roomPhase: 'inRoom',
      gameMode: 'normal',
    })
  })

  it('updates the shared rule business value', () => {
    const app = useAppStore()

    app.setCurrentRule('damage')
    expect(app.currentRule).toBe('damage')

    app.setCurrentRule('lucky')
    expect(app.currentRule).toBe('lucky')

    app.setCurrentRule(null)
    expect(app.currentRule).toBeNull()
  })

  it('keeps home data and rule state while switching tabs', () => {
    const app = useAppStore()

    app.setCurrentRule('damage')
    app.setActiveTab('history')
    app.setActiveTab('settings')
    app.setActiveTab('home')

    expect(app.activeTab).toBe('home')
    expect(app.currentRule).toBe('damage')
    expect(app.homeView.summonerName).toBe('峡谷小米')
    expect(app.homeView.roomPhase).toBe('inRoom')
    expect(app.homeView.gameMode).toBe('normal')
  })

  it('starts with all seven history matches and no selected match', () => {
    const app = useAppStore()

    expect(app.matchHistory).toHaveLength(7)
    expect(app.matchHistory.map((match) => match.id)).toEqual([
      'match-001',
      'match-002',
      'match-003',
      'match-004',
      'match-005',
      'match-006',
      'match-007',
    ])
    expect(app.historyFilter).toBe('all')
    expect(app.selectedMatchId).toBeNull()
    expect(app.selectedMatch).toBeNull()
  })

  it('changes the history filter and keeps it across tabs', () => {
    const app = useAppStore()

    app.setHistoryFilter('hex')
    expect(app.historyFilter).toBe('hex')

    app.setActiveTab('home')
    app.setActiveTab('history')
    expect(app.historyFilter).toBe('hex')

    app.setHistoryFilter('custom')
    expect(app.historyFilter).toBe('custom')
  })

  it('records the selected history id and opens match detail', () => {
    const app = useAppStore()

    app.openMatchDetail('match-004')

    expect(app.selectedMatchId).toBe('match-004')
    expect(app.selectedMatch?.champion).toBe('Neeko')
    expect(app.activeTab).toBe('match-detail')
  })

  it('ignores an unknown history id', () => {
    const app = useAppStore()

    app.openMatchDetail('missing-match')

    expect(app.selectedMatchId).toBeNull()
    expect(app.selectedMatch).toBeNull()
    expect(app.activeTab).toBe('home')
  })

  it('resets history filter and selection on disconnect', () => {
    const app = useAppStore()

    app.connect()
    vi.advanceTimersByTime(CONNECT_DELAY_MS)
    app.setHistoryFilter('custom')
    app.openMatchDetail('match-007')

    app.disconnect()

    expect(app.historyFilter).toBe('all')
    expect(app.selectedMatchId).toBeNull()
    expect(app.selectedMatch).toBeNull()
  })

  it('enters connecting immediately and connects after the demo delay', () => {
    const app = useAppStore()

    app.connect()
    expect(app.connectionPhase).toBe('connecting')
    expect(app.isConnecting).toBe(true)

    vi.advanceTimersByTime(CONNECT_DELAY_MS - 1)
    expect(app.connectionPhase).toBe('connecting')

    vi.advanceTimersByTime(1)
    expect(app.connectionPhase).toBe('connected')
    expect(app.isConnected).toBe(true)
    expect(app.activeTab).toBe('home')
    expect(app.homeView.isConnected).toBe(true)
  })

  it('ignores repeated connect calls while already connecting', () => {
    const app = useAppStore()

    app.connect()
    app.connect()
    vi.advanceTimersByTime(CONNECT_DELAY_MS)

    expect(app.connectionPhase).toBe('connected')
  })

  it('cancels a pending connection when disconnected', () => {
    const app = useAppStore()

    app.connect()
    app.disconnect()
    vi.advanceTimersByTime(CONNECT_DELAY_MS)

    expect(app.connectionPhase).toBe('disconnected')
    expect(app.isConnected).toBe(false)
  })

  it('resets navigation on disconnect', () => {
    const app = useAppStore()

    app.connect()
    vi.advanceTimersByTime(CONNECT_DELAY_MS)
    app.setActiveTab('settings')

    app.disconnect()

    expect(app.connectionPhase).toBe('disconnected')
    expect(app.activeTab).toBe('home')
  })

  it('switches tabs', () => {
    const app = useAppStore()

    app.setActiveTab('history')
    expect(app.activeTab).toBe('history')

    app.setActiveTab('match-detail')
    expect(app.activeTab).toBe('match-detail')
  })

  it('shows a toast for the original 2500ms duration', () => {
    const app = useAppStore()

    app.notify('toast-test', 'error')
    expect(app.toastVisible).toBe(true)
    expect(app.toastMessage).toBe('toast-test')
    expect(app.toastTone).toBe('error')

    vi.advanceTimersByTime(TOAST_DURATION_MS - 1)
    expect(app.toastVisible).toBe(true)

    vi.advanceTimersByTime(1)
    expect(app.toastVisible).toBe(false)
    expect(app.toastMessage).toBe('toast-test')
  })

  it('clears a pending toast when the connection state changes', () => {
    const app = useAppStore()

    app.notify('toast-test', 'error')
    app.connect()
    expect(app.toastVisible).toBe(false)

    vi.advanceTimersByTime(CONNECT_DELAY_MS)
    expect(app.isConnected).toBe(true)

    app.notify('later-toast')
    app.disconnect()
    expect(app.toastVisible).toBe(false)
  })
  it('stores the separate desktop LCU status without changing the simulated connection', () => {
    const app = useAppStore()
    const status = {
      status: 'unsupported_platform' as const,
      code: 'unsupported_platform',
      message: null,
      source: 'unavailable' as const,
      simulated: false,
      revision: 1,
      updatedAt: 123,
      monitoring: false,
    }

    app.setLcuStatus(status)

    expect(app.lcuStatus).toEqual(status)
    expect(app.connectionPhase).toBe('disconnected')
    expect(app.isConnected).toBe(false)
  })
})

describe('gameflow store revision guard', () => {
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
