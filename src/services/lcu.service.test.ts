import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { LcuStatusDto } from '@/types/lcu'

const mocks = vi.hoisted(() => ({
  tauri: false,
  get: vi.fn(),
  start: vi.fn(),
  stop: vi.fn(),
  subscribe: vi.fn(),
  gameflowGet: vi.fn(),
  gameflowStart: vi.fn(),
  gameflowStop: vi.fn(),
  gameflowSubscribe: vi.fn(),
}))

vi.mock('@tauri-apps/api/core', () => ({ isTauri: () => mocks.tauri }))
vi.mock('@/adapters/tauri.adapter', () => ({
  tauriLcuAdapter: {
    getConnectionStatus: mocks.get,
    startMonitoring: mocks.start,
    stopMonitoring: mocks.stop,
    subscribe: mocks.subscribe,
  },
  tauriGameflowAdapter: {
    getSnapshot: mocks.gameflowGet,
    startMonitoring: mocks.gameflowStart,
    stopMonitoring: mocks.gameflowStop,
    subscribe: mocks.gameflowSubscribe,
  },
}))

import {
  getLcuConnectionStatus,
  startLcuMonitoring,
  stopLcuMonitoring,
  subscribeLcuStatus,
  getGameflowSnapshot,
  startGameflowMonitoring,
  subscribeGameflow,
} from './lcu.service'

const realStatus: LcuStatusDto = {
  status: 'connected',
  code: null,
  message: null,
  source: 'real',
  simulated: false,
  revision: 3,
  updatedAt: 123,
  monitoring: true,
}

describe('LCU service runtime selection', () => {
  beforeEach(() => {
    mocks.tauri = false
    mocks.get.mockReset()
    mocks.start.mockReset()
    mocks.stop.mockReset()
    mocks.subscribe.mockReset()
    mocks.gameflowGet.mockReset()
    mocks.gameflowStart.mockReset()
    mocks.gameflowStop.mockReset()
    mocks.gameflowSubscribe.mockReset()
  })

  it('keeps browser mode on the explicit Mock adapter', async () => {
    const status = await startLcuMonitoring()

    expect(status.source).toBe('mock')
    expect(status.simulated).toBe(true)
    expect(mocks.start).not.toHaveBeenCalled()
  })

  it('uses the Tauri adapter and event unlisten in desktop mode', async () => {
    mocks.tauri = true
    mocks.get.mockResolvedValue(realStatus)
    mocks.start.mockResolvedValue(realStatus)
    mocks.stop.mockResolvedValue({ ...realStatus, status: 'not_running', monitoring: false })
    const unlisten = vi.fn()
    mocks.subscribe.mockResolvedValue(unlisten)

    await expect(getLcuConnectionStatus()).resolves.toEqual(realStatus)
    await expect(startLcuMonitoring()).resolves.toEqual(realStatus)
    await expect(stopLcuMonitoring()).resolves.toMatchObject({ status: 'not_running' })
    const listener = vi.fn()
    await expect(subscribeLcuStatus(listener)).resolves.toBe(unlisten)
    expect(mocks.subscribe).toHaveBeenCalledWith(listener)
  })
})

const gameflowSnapshot: import('@/types/lcu').GameflowSnapshot = {
  revision: 3,
  updatedAt: 123,
  connected: true,
  phase: 'lobby',
  rawPhase: 'Lobby',
  transport: 'polling',
  source: 'real',
  simulated: false,
  session: null,
  code: null,
  message: null,
}

describe('gameflow service runtime selection', () => {
  beforeEach(() => {
    mocks.tauri = false
    mocks.gameflowGet.mockReset()
    mocks.gameflowStart.mockReset()
    mocks.gameflowStop.mockReset()
    mocks.gameflowSubscribe.mockReset()
  })

  it('uses only the explicit browser Mock outside Tauri', async () => {
    const snapshot = await startGameflowMonitoring()
    expect(snapshot.source).toBe('mock')
    expect(snapshot.simulated).toBe(true)
    expect(mocks.gameflowStart).not.toHaveBeenCalled()
  })

  it('dispatches initial snapshot, monitoring and subscription in Tauri', async () => {
    mocks.tauri = true
    mocks.gameflowGet.mockResolvedValue(gameflowSnapshot)
    mocks.gameflowStart.mockResolvedValue(gameflowSnapshot)
    const unlisten = vi.fn()
    mocks.gameflowSubscribe.mockResolvedValue(unlisten)
    await expect(getGameflowSnapshot()).resolves.toEqual(gameflowSnapshot)
    await expect(startGameflowMonitoring()).resolves.toEqual(gameflowSnapshot)
    const listener = vi.fn()
    await expect(subscribeGameflow(listener)).resolves.toBe(unlisten)
    expect(mocks.gameflowSubscribe).toHaveBeenCalledWith(listener)
  })
})
