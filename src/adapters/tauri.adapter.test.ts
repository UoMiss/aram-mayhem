import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DesktopServiceError, LcuServiceError } from '@/services/desktop-error'
import type { AppHealth } from '@/types/desktop'
import {
  GAMEFLOW_CHAMP_SELECT_EVENT,
  GAMEFLOW_LOBBY_EVENT,
  GAMEFLOW_SESSION_ENDED_EVENT,
  GAMEFLOW_UPDATED_EVENT,
  LCU_STATUS_EVENT,
  type GameflowSnapshot,
  type LcuStatusDto,
} from '@/types/lcu'

const invokeMock = vi.hoisted(() => vi.fn())
const listenMock = vi.hoisted(() => vi.fn())
vi.mock('@tauri-apps/api/core', () => ({ invoke: invokeMock }))
vi.mock('@tauri-apps/api/event', () => ({ listen: listenMock }))

import { tauriAdapter, tauriGameflowAdapter, tauriLcuAdapter } from './tauri.adapter'

const health: AppHealth = {
  status: 'ok',
  runtime: 'tauri',
  appName: 'ARAM: Mayhem',
  appVersion: '0.1.0',
  platform: 'macos',
  simulated: true,
}

describe('tauri desktop adapter', () => {
  beforeEach(() => {
    invokeMock.mockReset()
    listenMock.mockReset()
  })

  it('invokes app_health_check and preserves the typed contract', async () => {
    invokeMock.mockResolvedValue(health)

    await expect(tauriAdapter.getHealth()).resolves.toEqual(health)
    expect(invokeMock).toHaveBeenCalledTimes(1)
    expect(invokeMock).toHaveBeenCalledWith('app_health_check')
  })

  it('sanitizes IPC errors and never exposes the host stack', async () => {
    invokeMock.mockRejectedValue(new Error('raw rust stack: do not expose'))

    try {
      await tauriAdapter.getHealth()
      throw new Error('expected adapter to throw')
    } catch (error) {
      expect(error).toBeInstanceOf(DesktopServiceError)
      expect(error).toMatchObject({
        code: 'desktop.ipc_failed',
        message: 'Desktop health check failed',
      })
      expect(String(error)).not.toContain('raw rust stack')
    }
  })
})

const lcuStatus: LcuStatusDto = {
  status: 'connected',
  code: null,
  message: null,
  source: 'real',
  simulated: false,
  revision: 4,
  updatedAt: 123,
  monitoring: true,
}

describe('tauri LCU adapter', () => {
  beforeEach(() => {
    invokeMock.mockReset()
    listenMock.mockReset()
  })

  it('invokes the typed read-only commands', async () => {
    invokeMock.mockResolvedValue(lcuStatus)

    await expect(tauriLcuAdapter.getConnectionStatus()).resolves.toEqual(lcuStatus)
    await expect(tauriLcuAdapter.startMonitoring()).resolves.toEqual(lcuStatus)
    await expect(tauriLcuAdapter.stopMonitoring()).resolves.toEqual(lcuStatus)
    expect(invokeMock).toHaveBeenNthCalledWith(1, 'lcu_get_connection_status')
    expect(invokeMock).toHaveBeenNthCalledWith(2, 'lcu_start_monitoring')
    expect(invokeMock).toHaveBeenNthCalledWith(3, 'lcu_stop_monitoring')
  })

  it('subscribes to the typed event and returns its unlisten function', async () => {
    const unlisten = vi.fn()
    listenMock.mockResolvedValue(unlisten)
    const listener = vi.fn()

    await expect(tauriLcuAdapter.subscribe(listener)).resolves.toBe(unlisten)
    expect(listenMock).toHaveBeenCalledWith(LCU_STATUS_EVENT, expect.any(Function))

    const handler = listenMock.mock.calls[0]?.[1] as (event: { payload: LcuStatusDto }) => void
    handler({ payload: lcuStatus })
    expect(listener).toHaveBeenCalledWith(lcuStatus)
  })

  it('sanitizes LCU IPC errors', async () => {
    invokeMock.mockRejectedValue(new Error('raw rust stack: do not expose'))

    await expect(tauriLcuAdapter.getConnectionStatus()).rejects.toMatchObject({
      name: 'LcuServiceError',
      code: 'lcu.status_failed',
      message: 'LCU IPC failed',
    })
    expect(new LcuServiceError('lcu.ipc_failed', 'LCU IPC failed')).toBeInstanceOf(Error)
  })
})

const gameflowSnapshot: GameflowSnapshot = {
  revision: 7,
  updatedAt: 123,
  connected: true,
  phase: 'champ_select',
  rawPhase: 'ChampSelect',
  transport: 'websocket',
  source: 'real',
  simulated: false,
  session: null,
  code: null,
  message: null,
}

describe('tauri gameflow adapter', () => {
  beforeEach(() => {
    invokeMock.mockReset()
    listenMock.mockReset()
  })

  it('invokes initial snapshot and monitoring commands', async () => {
    invokeMock.mockResolvedValue(gameflowSnapshot)
    await expect(tauriGameflowAdapter.getSnapshot()).resolves.toEqual(gameflowSnapshot)
    await expect(tauriGameflowAdapter.startMonitoring()).resolves.toEqual(gameflowSnapshot)
    await expect(tauriGameflowAdapter.stopMonitoring()).resolves.toEqual(gameflowSnapshot)
    expect(invokeMock).toHaveBeenNthCalledWith(1, 'lcu_get_gameflow_snapshot')
    expect(invokeMock).toHaveBeenNthCalledWith(2, 'lcu_start_gameflow_monitoring')
    expect(invokeMock).toHaveBeenNthCalledWith(3, 'lcu_stop_gameflow_monitoring')
  })

  it('subscribes all typed events and unlistens them together', async () => {
    const unlisten = vi.fn()
    listenMock.mockResolvedValue(unlisten)
    const listener = vi.fn()
    const off = await tauriGameflowAdapter.subscribe(listener)

    expect(listenMock).toHaveBeenCalledTimes(4)
    expect(listenMock).toHaveBeenNthCalledWith(1, GAMEFLOW_UPDATED_EVENT, expect.any(Function))
    expect(listenMock).toHaveBeenNthCalledWith(2, GAMEFLOW_LOBBY_EVENT, expect.any(Function))
    expect(listenMock).toHaveBeenNthCalledWith(3, GAMEFLOW_CHAMP_SELECT_EVENT, expect.any(Function))
    expect(listenMock).toHaveBeenNthCalledWith(
      4,
      GAMEFLOW_SESSION_ENDED_EVENT,
      expect.any(Function),
    )

    const calls = listenMock.mock.calls
    ;(calls[0]?.[1] as (event: { payload: GameflowSnapshot }) => void)({
      payload: gameflowSnapshot,
    })
    ;(calls[1]?.[1] as (event: { payload: null }) => void)({ payload: null })
    expect(listener).toHaveBeenNthCalledWith(1, { type: 'updated', snapshot: gameflowSnapshot })
    expect(listener).toHaveBeenNthCalledWith(2, { type: 'lobby', lobby: null })

    off()
    expect(unlisten).toHaveBeenCalledTimes(4)
  })
})

describe('IPC trust boundaries and subscription cleanup', () => {
  beforeEach(() => {
    invokeMock.mockReset()
    listenMock.mockReset()
  })

  it('preserves a known business code without exposing the native message', async () => {
    invokeMock.mockRejectedValue({ code: 'authentication_failed', message: 'token=secret; stack' })
    await expect(tauriLcuAdapter.startMonitoring()).rejects.toMatchObject({
      code: 'lcu.authentication_failed',
      message: '客户端认证失败，请重新连接',
    })
  })

  it('rejects malformed command results before they enter application state', async () => {
    invokeMock.mockResolvedValue({ ...lcuStatus, revision: '4' })
    await expect(tauriLcuAdapter.getConnectionStatus()).rejects.toMatchObject({
      code: 'lcu.invalid_response',
    })
    invokeMock.mockResolvedValue({ ...gameflowSnapshot, session: { sessionKey: 'incomplete' } })
    await expect(tauriGameflowAdapter.getSnapshot()).rejects.toMatchObject({
      code: 'lcu.invalid_response',
    })
  })

  it('drops malformed events and reports a sanitized error', async () => {
    listenMock.mockResolvedValue(vi.fn())
    const listener = vi.fn()
    const onError = vi.fn()
    const stop = await tauriLcuAdapter.subscribe(listener, onError)
    const handler = listenMock.mock.calls[0]?.[1] as (event: { payload: unknown }) => void
    handler({ payload: { ...lcuStatus, status: 'invented' } })
    expect(listener).not.toHaveBeenCalled()
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ code: 'lcu.invalid_response' }))
    handler({ payload: lcuStatus })
    expect(listener).toHaveBeenCalledWith(lcuStatus)
    stop()
  })

  it('releases earlier subscriptions when a later subscription fails', async () => {
    const stop = vi.fn()
    listenMock.mockResolvedValueOnce(stop).mockRejectedValueOnce(new Error('raw host details'))
    await expect(tauriGameflowAdapter.subscribe(vi.fn())).rejects.toMatchObject({
      code: 'lcu.ipc_failed',
    })
    expect(stop).toHaveBeenCalledOnce()
  })
})
