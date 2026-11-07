// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, disposePinia } from 'pinia'
import { createAppI18n } from '@/i18n'
import { useConnectionStore } from '@/stores/connection'
import type { LcuConnectionStatus, LcuStatusDto } from '@/types/lcu'

const runtime = vi.hoisted(() => ({ desktop: true, start: vi.fn() }))
vi.mock('@tauri-apps/api/core', () => ({ isTauri: () => runtime.desktop }))
vi.mock('@/services/lcu.service', () => ({ startLcuMonitoring: runtime.start }))
import ConnectionScreen from './ConnectionScreen.vue'

let pinia: ReturnType<typeof createPinia>
let wrapper: ReturnType<typeof mount> | undefined
function status(
  value: LcuConnectionStatus = 'not_running',
  code: string | null = null,
): LcuStatusDto {
  return {
    status: value,
    code,
    message: null,
    source: 'real',
    simulated: false,
    revision: 1,
    updatedAt: 1,
    monitoring: true,
  }
}
function render(value = status()) {
  useConnectionStore(pinia).setLcuStatus(value)
  wrapper = mount(ConnectionScreen, { global: { plugins: [pinia, createAppI18n()] } })
  return wrapper
}
beforeEach(() => {
  vi.useFakeTimers()
  runtime.desktop = true
  runtime.start.mockReset()
  pinia = createPinia()
})
afterEach(() => {
  wrapper?.unmount()
  wrapper = undefined
  disposePinia(pinia)
  vi.clearAllTimers()
  vi.useRealTimers()
})

describe('connection page', () => {
  it.each([
    ['not_running', '等待客户端启动'],
    ['discovering', '检测中'],
    ['connecting', '连接中'],
    ['reconnecting', '连接中'],
    ['disconnected', '连接已断开'],
    ['error', '连接失败'],
  ] as const)('displays %s from the native snapshot', (value, label) => {
    expect(render(status(value)).get('#connection-detail-panel [role="status"]').text()).toContain(
      label,
    )
  })

  it('updates the visible status and code as new native snapshots arrive', async () => {
    const page = render(status('error', 'authentication_failed'))
    expect(page.text()).toContain('请重新登录英雄联盟客户端')
    useConnectionStore(pinia).setLcuStatus({ ...status('connecting'), revision: 2 })
    await flushPromises()
    expect(page.get('[role="status"]').text()).toContain('连接中')
    expect(page.find('code').exists()).toBe(false)
  })

  it('displays technical error codes without expanding diagnostics', () => {
    const page = render(status('error', 'discovery_failed'))
    expect(page.get('#connection-detail-panel code').text()).toBe('discovery_failed')
    expect(page.text()).toContain('无法读取连接信息')
    expect(page.find('button').exists()).toBe(false)
  })

  it('never displays native error messages', () => {
    const page = render({
      ...status('error', 'authentication_failed'),
      message: 'private-token=secret',
    })
    expect(page.text()).toContain('请重新登录英雄联盟客户端')
    expect(page.text()).not.toContain('private-token')
  })

  it('shows only the relevant guidance on an unsupported platform', () => {
    const page = render({
      ...status('unsupported_platform'),
      source: 'unavailable',
      monitoring: false,
    })
    expect(page.find('button').exists()).toBe(false)
    expect(page.text()).toContain('请在 Windows 电脑上运行助手')
    expect(page.get('#connection-detail-panel').text()).toContain('请在 Windows 电脑上运行助手')
  })

  it('continues automatic client discovery after disconnect', () => {
    const page = render(status('disconnected', 'client_exited'))
    expect(page.text()).toContain('客户端启动后会自动检测并连接')
    expect(page.find('button').exists()).toBe(false)
  })

  it('labels browser mode as a demo and never invokes desktop IPC', async () => {
    runtime.desktop = false
    const page = render()
    expect(page.get('button').text()).toBe('进入浏览器演示')
    await page.get('button').trigger('click')
    expect(page.get('button').attributes('disabled')).toBeDefined()
    vi.advanceTimersByTime(1500)
    await flushPromises()
    expect(useConnectionStore(pinia).isConnected).toBe(true)
    expect(runtime.start).not.toHaveBeenCalled()
  })
})
