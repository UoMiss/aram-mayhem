// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, disposePinia } from 'pinia'
import { createAppI18n } from '@/i18n'
import { useConnectionStore } from '@/stores/connection'
import { LcuServiceError } from '@/services/desktop-error'
import { connectedStatus } from '../../../../tests/fixtures/home-contract'
import { testParticipants } from '../../../../tests/fixtures/participants-contract'
import { PARTICIPANTS_REFRESH_MS } from '../useTeamParticipants'
const api = vi.hoisted(() => ({ load: vi.fn() }))
vi.mock('@tauri-apps/api/core', () => ({ isTauri: () => true }))
vi.mock('@/services/participants.service', () => ({ getCustomParticipants: api.load }))
import TeamDrawer from './TeamDrawer.vue'
let pinia: ReturnType<typeof createPinia>
let wrapper: ReturnType<typeof mount> | undefined
function render(open = true) {
  wrapper = mount(TeamDrawer, { props: { open }, global: { plugins: [pinia, createAppI18n()] } })
  return wrapper
}
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] })
  api.load.mockReset()
  api.load.mockResolvedValue({ source: 'real', snapshot: testParticipants() })
  pinia = createPinia()
  useConnectionStore(pinia).setLcuStatus(connectedStatus())
})
afterEach(() => {
  wrapper?.unmount()
  wrapper = undefined
  disposePinia(pinia)
  vi.useRealTimers()
})
describe('custom lobby team participants', () => {
  it('loads both teams, checks freshness before drawing, and keeps all ten players', async () => {
    const page = render(false)
    await flushPromises()
    expect(api.load).not.toHaveBeenCalled()
    expect(page.text()).not.toContain('Ezreal')
    await page.setProps({ open: true })
    await flushPromises()
    expect(page.get('#playerCount').text()).toBe('10 人')
    expect(page.get('#unrandomizedView').findAll('[title]')).toHaveLength(10)
    await page.get('#randomBtn').trigger('click')
    await flushPromises()
    expect(api.load).toHaveBeenCalledTimes(2)
    await vi.advanceTimersByTimeAsync(3000)
    const a = page.get('#teamA').findAll('[title]')
    const b = page.get('#teamB').findAll('[title]')
    expect(a).toHaveLength(5)
    expect(b).toHaveLength(5)
    expect(new Set([...a, ...b].map((player) => player.text())).size).toBe(10)
    expect(page.find('#timestampBar').exists()).toBe(true)
    api.load.mockResolvedValue({ source: 'real', snapshot: testParticipants(8) })
    await vi.advanceTimersByTimeAsync(PARTICIPANTS_REFRESH_MS - 3000)
    await flushPromises()
    expect(page.text()).toContain('房间或玩家名单已变化')
    expect(page.find('#timestampBar').exists()).toBe(false)
    expect(page.get('#teamA').findAll('[title]')).toHaveLength(0)
    expect(page.get('#playerCount').text()).toBe('8 人')
  })
  it('distinguishes normal and missing rooms, errors and retry without mock fallback', async () => {
    api.load.mockResolvedValueOnce({
      source: 'real',
      snapshot: testParticipants(0, { status: 'not_custom' }),
    })
    const page = render()
    await flushPromises()
    expect(page.text()).toContain('客户端暂未返回组队名单')
    expect(page.get('#randomBtn').attributes('disabled')).toBeDefined()
    api.load.mockRejectedValueOnce(new LcuServiceError('lcu.timeout', 'password=secret'))
    await page.get('#refreshTeamPlayers').trigger('click')
    await flushPromises()
    expect(page.get('[role="alert"]').text()).toContain('读取失败')
    expect(page.text()).not.toContain('secret')
    expect(page.text()).not.toContain('Ezreal')
    api.load.mockResolvedValueOnce({
      source: 'real',
      snapshot: testParticipants(0, { status: 'no_lobby' }),
    })
    await page.get('#refreshTeamPlayers').trigger('click')
    await flushPromises()
    expect(page.text()).toContain('进入组队大厅或选人阶段')
    await page.get('#refreshTeamPlayers').trigger('click')
    await flushPromises()
    expect(page.get('#randomBtn').attributes('disabled')).toBeUndefined()
  })
  it('requires review when the pre-draw refresh finds a changed roster', async () => {
    const page = render()
    await flushPromises()
    api.load.mockResolvedValueOnce({ source: 'real', snapshot: testParticipants(9) })
    await page.get('#randomBtn').trigger('click')
    await flushPromises()
    expect(page.text()).toContain('请核对名单后重新分组')
    expect(page.text()).toContain('人数为奇数')
    expect(page.get('#teamA').findAll('[title]')).toHaveLength(0)
  })
  it('clears immediately on disconnect and ignores a late response after closing', async () => {
    const page = render()
    await flushPromises()
    useConnectionStore(pinia).setLcuStatus(connectedStatus({ status: 'disconnected', revision: 2 }))
    await flushPromises()
    expect(page.get('#playerCount').text()).toBe('0 人')
    expect(page.get('#randomBtn').attributes('disabled')).toBeDefined()
    let resolve!: (value: unknown) => void
    api.load.mockReturnValueOnce(
      new Promise((done) => {
        resolve = done
      }),
    )
    useConnectionStore(pinia).setLcuStatus(connectedStatus({ revision: 3 }))
    await flushPromises()
    await page.setProps({ open: false })
    resolve({ source: 'real', snapshot: testParticipants() })
    await flushPromises()
    expect(page.get('#playerCount').text()).toBe('0 人')
    await vi.advanceTimersByTimeAsync(PARTICIPANTS_REFRESH_MS * 2)
    expect(api.load).toHaveBeenCalledTimes(2)
    page.unmount()
    wrapper = undefined
    expect(vi.getTimerCount()).toBe(0)
  })
  it('does not restart a draw when an old preflight finishes after closing and reopening', async () => {
    const page = render()
    await flushPromises()
    let resolve!: (value: unknown) => void
    api.load.mockReturnValueOnce(
      new Promise((done) => {
        resolve = done
      }),
    )
    await page.get('#randomBtn').trigger('click')
    await page.setProps({ open: false })
    await page.setProps({ open: true })
    await flushPromises()
    expect(page.get('#randomBtn').attributes('disabled')).toBeUndefined()
    resolve({ source: 'real', snapshot: testParticipants() })
    await flushPromises()
    expect(page.find('#timestampBar').exists()).toBe(false)
    expect(page.get('#teamA').findAll('[title]')).toHaveLength(0)
  })
})
