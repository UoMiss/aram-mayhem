// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, disposePinia } from 'pinia'
import { createAppI18n } from '@/i18n'
import { useConnectionStore } from '@/stores/connection'
import type { LcuStatusDto } from '@/types/lcu'

const bridge = vi.hoisted(() => ({
  getGameflowSnapshot: vi.fn(),
  getLcuConnectionStatus: vi.fn(),
  startGameflowMonitoring: vi.fn(),
  startLcuMonitoring: vi.fn(),
  stopGameflowMonitoring: vi.fn(),
  stopLcuMonitoring: vi.fn(),
  subscribeGameflow: vi.fn(),
  subscribeLcuStatus: vi.fn(),
}))
vi.mock('@/services/lcu.service', () => bridge)
vi.mock('@/services/app.service', () => ({
  getAppHealth: async () => ({ appVersion: '0.1.0' }),
}))
import App from './App.vue'

const status: LcuStatusDto = {
  status: 'not_running',
  code: null,
  message: null,
  source: 'real',
  simulated: false,
  revision: 1,
  updatedAt: 1,
  monitoring: true,
}
let pinia: ReturnType<typeof createPinia>
let wrapper: ReturnType<typeof mount> | undefined
function render() {
  wrapper = mount(App, {
    global: {
      plugins: [pinia, createAppI18n()],
      stubs: { AppShell: true, AppToast: true, ConnectionScreen: true },
    },
  })
  return wrapper
}
beforeEach(() => {
  vi.useFakeTimers()
  vi.resetAllMocks()
  pinia = createPinia()
  bridge.subscribeLcuStatus.mockResolvedValue(vi.fn())
  bridge.subscribeGameflow.mockResolvedValue(vi.fn())
  bridge.getLcuConnectionStatus.mockResolvedValue(status)
  bridge.startLcuMonitoring.mockResolvedValue(status)
  bridge.stopLcuMonitoring.mockResolvedValue(status)
  bridge.getGameflowSnapshot.mockRejectedValue(new Error('unavailable'))
  bridge.startGameflowMonitoring.mockRejectedValue(new Error('unavailable'))
  bridge.stopGameflowMonitoring.mockResolvedValue(undefined)
})
afterEach(() => {
  wrapper?.unmount()
  wrapper = undefined
  disposePinia(pinia)
  vi.clearAllTimers()
  vi.useRealTimers()
})

describe('application monitoring lifecycle', () => {
  it('unlistens subscriptions that resolve after unmount without starting monitoring', async () => {
    let resolve!: (stop: () => void) => void
    bridge.subscribeLcuStatus.mockReturnValue(
      new Promise<() => void>((done) => {
        resolve = done
      }),
    )
    const stop = vi.fn()
    render().unmount()
    wrapper = undefined
    resolve(stop)
    await flushPromises()
    expect(stop).toHaveBeenCalledOnce()
    expect(bridge.getLcuConnectionStatus).not.toHaveBeenCalled()
    expect(bridge.startLcuMonitoring).not.toHaveBeenCalled()
  })

  it('cleans subscriptions on every mount and ignores old status responses', async () => {
    const stop = vi.fn()
    bridge.subscribeLcuStatus.mockResolvedValue(stop)
    let resolve!: (value: LcuStatusDto) => void
    bridge.getLcuConnectionStatus.mockReturnValue(
      new Promise<LcuStatusDto>((done) => {
        resolve = done
      }),
    )
    render()
    await flushPromises()
    const listener = bridge.subscribeLcuStatus.mock.calls[0]?.[0] as (value: LcuStatusDto) => void
    listener({ ...status, status: 'connected', revision: 4 })
    resolve(status)
    await flushPromises()
    expect(useConnectionStore(pinia).lcuStatus?.revision).toBe(4)
    wrapper?.unmount()
    wrapper = undefined
    expect(stop).toHaveBeenCalledOnce()
    const remounted = render()
    await flushPromises()
    remounted.unmount()
    wrapper = undefined
    expect(stop).toHaveBeenCalledTimes(2)
  })

  it('recovers a failed subscription and cancels retry timers on unmount', async () => {
    const stop = vi.fn()
    bridge.subscribeLcuStatus
      .mockRejectedValueOnce(new Error('permission denied'))
      .mockResolvedValue(stop)
    render()
    await flushPromises()
    expect(useConnectionStore(pinia).lcuBridgeError).toBe('lcu.subscribe_failed')
    await vi.advanceTimersByTimeAsync(2000)
    expect(bridge.subscribeLcuStatus).toHaveBeenCalledTimes(2)
    expect(useConnectionStore(pinia).lcuBridgeError).toBeNull()
    wrapper?.unmount()
    wrapper = undefined
    expect(stop).toHaveBeenCalledOnce()
    await vi.advanceTimersByTimeAsync(10000)
    expect(bridge.subscribeLcuStatus).toHaveBeenCalledTimes(2)
  })
})
