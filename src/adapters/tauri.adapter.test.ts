import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DesktopServiceError, LcuServiceError } from '@/services/desktop-error'
import type { AppHealth } from '@/types/desktop'
import { LCU_STATUS_EVENT, type LcuStatusDto } from '@/types/lcu'

const invokeMock = vi.hoisted(() => vi.fn())
const listenMock = vi.hoisted(() => vi.fn())
vi.mock('@tauri-apps/api/core', () => ({ invoke: invokeMock }))
vi.mock('@tauri-apps/api/event', () => ({ listen: listenMock }))

import { tauriAdapter, tauriLcuAdapter } from './tauri.adapter'

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
      code: 'lcu.ipc_failed',
      message: 'LCU IPC failed',
    })
    expect(new LcuServiceError('lcu.ipc_failed', 'LCU IPC failed')).toBeInstanceOf(Error)
  })
})
