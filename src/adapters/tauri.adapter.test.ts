import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DesktopServiceError } from '@/services/desktop-error'
import type { AppHealth } from '@/types/desktop'

const invokeMock = vi.hoisted(() => vi.fn())
vi.mock('@tauri-apps/api/core', () => ({ invoke: invokeMock }))

import { tauriAdapter } from './tauri.adapter'

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
