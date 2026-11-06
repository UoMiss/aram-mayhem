// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, disposePinia } from 'pinia'
import { createAppI18n } from '@/i18n'
import { useConnectionStore } from '@/stores/connection'
import { useHomeStore } from '@/stores/home'
import { useHistoryStore } from '@/stores/history'
import { useMatchRulesStore } from '@/stores/match-rules'
import { useUiStore } from '@/stores/ui'
import { LcuServiceError } from '@/services/desktop-error'
import { connectedStatus, homeFlow, testHomeSnapshot } from '../../../tests/fixtures/home-contract'
import { testHistorySnapshot, TEST_HISTORY_MATCH } from '../../../tests/fixtures/history-contract'
import { HOME_REFRESH_MS } from './useHomeData'
const api = vi.hoisted(() => ({ load: vi.fn(), history: vi.fn() }))
vi.mock('@tauri-apps/api/core', () => ({ isTauri: () => true }))
vi.mock('@/services/home.service', () => ({ getHomeSnapshot: api.load }))
vi.mock('@/services/history.service', () => ({ getMatchHistory: api.history }))
import HomePage from './HomePage.vue'
let pinia: ReturnType<typeof createPinia>
let wrapper: ReturnType<typeof mount> | undefined
function render() {
  wrapper = mount(HomePage, { global: { plugins: [pinia, createAppI18n()] } })
  return wrapper
}
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
  api.load.mockReset()
  api.load.mockResolvedValue({ source: 'real', snapshot: testHomeSnapshot() })
  api.history.mockReset()
  api.history.mockResolvedValue({
    source: 'real',
    snapshot: { ...testHistorySnapshot(), accountKey: 'account-1' },
  })
  pinia = createPinia()
  useUiStore(pinia).setActiveTab('home')
  useConnectionStore(pinia).setLcuStatus(connectedStatus())
  useConnectionStore(pinia).setGameflowSnapshot(homeFlow())
})
afterEach(() => {
  wrapper?.unmount()
  wrapper = undefined
  disposePinia(pinia)
  vi.useRealTimers()
})
describe('real home page', () => {
  it('shows the current account, level, live room and actual mode without demo data', async () => {
    let resolve!: (value: unknown) => void
    api.load.mockReturnValueOnce(
      new Promise((done) => {
        resolve = done
      }),
    )
    const page = render()
    await nextTick()
    expect(page.text()).toContain('正在读取当前账号')
    resolve({ source: 'real', snapshot: testHomeSnapshot() })
    await flushPromises()
    expect(page.text()).toContain('真实玩家#CN1')
    expect(page.text()).toContain('等级 321')
    expect(page.text()).toContain('房间人数')
    expect(page.text()).toContain('3 人')
    expect(page.text()).toContain('海克斯')
    expect(page.text()).not.toContain('峡谷小米')
    expect(page.text()).not.toContain('演示数据')
    expect(page.text()).toContain('最近 5 局')
    expect(page.text()).toContain('20:04')
    expect(page.text()).toContain('12 / 4 / 18')
    expect(page.findAll('li button')).toHaveLength(1)
    useConnectionStore(pinia).setGameflowSnapshot(
      homeFlow({ revision: 2, phase: 'in_progress', rawPhase: 'InProgress', session: null }),
    )
    await flushPromises()
    expect(page.text()).toContain('对局进行中')
    expect(page.text()).not.toContain('房间人数')
    const button = page.get('[aria-label^="查看泽丽对局结算"]')
    await button.trigger('click')
    expect(useUiStore(pinia).activeTab).toBe('match-detail')
    expect(useHistoryStore(pinia).liveSettlement).toEqual({
      gameId: TEST_HISTORY_MATCH.id,
      accountKey: 'account-1',
    })
  })

  it('shows five unique matches in time order and opens the selected match', async () => {
    const matches = [1, 6, 3, 4, 2, 5, 6].map((index) => ({
      ...TEST_HISTORY_MATCH,
      id: String(100 + index),
      championName: `英雄${index}`,
      createdAt: TEST_HISTORY_MATCH.createdAt + index * 60_000,
    }))
    api.history.mockResolvedValueOnce({
      source: 'real',
      snapshot: { ...testHistorySnapshot(matches), accountKey: 'account-1' },
    })
    const page = render()
    await flushPromises()
    const cards = page.findAll('li button')
    expect(cards.map((card) => card.attributes('aria-label')?.split('，')[0])).toEqual(
      [6, 5, 4, 3, 2].map((index) => `查看英雄${index}对局结算`),
    )
    await page.get('[aria-label^="查看英雄4对局结算"]').trigger('click')
    expect(useHistoryStore(pinia).liveSettlement).toEqual({
      gameId: '104',
      accountKey: 'account-1',
    })
  })

  it('shows a locked rule and handles absent room metadata', async () => {
    const flow = homeFlow()
    useMatchRulesStore(pinia).accept({
      accountKey: 'account-1',
      gameId: '42',
      rule: 'lucky',
      luckyDigit: null,
    })
    useConnectionStore(pinia).setGameflowSnapshot(
      homeFlow({
        revision: 2,
        phase: 'in_progress',
        session: flow.session ? { ...flow.session, gameId: '42', phase: 'in_progress' } : null,
      }),
    )
    const page = render()
    await flushPromises()
    expect(page.get('#home-rule-text').text()).toBe('幸运数字规则')
    expect(page.text()).toContain('本局规则')
    expect(page.text()).not.toContain('房间人数')
  })

  it('rejects recent history from another account and can retry an empty history', async () => {
    api.history.mockResolvedValueOnce({ source: 'real', snapshot: testHistorySnapshot() })
    const page = render()
    await flushPromises()
    expect(page.get('[role="alert"]').text()).toContain('账号已切换')
    expect(page.find('[aria-label^="查看泽丽对局结算"]').exists()).toBe(false)
    api.history.mockResolvedValueOnce({
      source: 'real',
      snapshot: { ...testHistorySnapshot([]), accountKey: 'account-1' },
    })
    await page.get('[role="alert"] button').trigger('click')
    await flushPromises()
    expect(page.text()).toContain('暂无对局记录')
  })

  it('discards a recent history response received after leaving home', async () => {
    let resolve!: (value: unknown) => void
    api.history.mockReturnValueOnce(
      new Promise((done) => {
        resolve = done
      }),
    )
    const page = render()
    await flushPromises()
    expect(page.text()).toContain('正在读取战绩')
    useUiStore(pinia).setActiveTab('settings')
    resolve({ source: 'real', snapshot: { ...testHistorySnapshot(), accountKey: 'account-1' } })
    await flushPromises()
    expect(page.find('[aria-label^="查看泽丽对局结算"]').exists()).toBe(false)
  })
  it('reports a sanitized login error and recovers with retry', async () => {
    api.load.mockRejectedValueOnce(new LcuServiceError('lcu.not_logged_in', 'password=secret'))
    const page = render()
    await flushPromises()
    expect(page.get('[role="alert"]').text()).toContain('完成登录')
    expect(page.text()).not.toContain('secret')
    await page.get('[role="alert"] button').trigger('click')
    await flushPromises()
    expect(page.text()).toContain('真实玩家#CN1')
    expect(page.find('[role="alert"]').exists()).toBe(false)
  })
  it('polls visible home only and discards requests after leaving or unmounting', async () => {
    useUiStore(pinia).setActiveTab('history')
    render()
    await flushPromises()
    expect(api.load).not.toHaveBeenCalled()
    useUiStore(pinia).setActiveTab('home')
    await flushPromises()
    expect(api.load).toHaveBeenCalledOnce()
    await vi.advanceTimersByTimeAsync(HOME_REFRESH_MS)
    expect(api.load).toHaveBeenCalledTimes(2)
    expect(api.history).toHaveBeenCalledOnce()
    let resolve!: (value: unknown) => void
    api.load.mockReturnValue(
      new Promise((done) => {
        resolve = done
      }),
    )
    await vi.advanceTimersByTimeAsync(HOME_REFRESH_MS)
    useUiStore(pinia).setActiveTab('settings')
    resolve({ source: 'real', snapshot: testHomeSnapshot({ displayName: 'stale' }) })
    await flushPromises()
    expect(useHomeStore(pinia).snapshot).toBeNull()
    await vi.advanceTimersByTimeAsync(HOME_REFRESH_MS * 2)
    expect(api.load).toHaveBeenCalledTimes(3)
    wrapper!.unmount()
    wrapper = undefined
    expect(vi.getTimerCount()).toBe(0)
  })
  it('clears a mounted profile request and polling timer on unmount', async () => {
    let resolve!: (value: unknown) => void
    api.load.mockReturnValueOnce(
      new Promise((done) => {
        resolve = done
      }),
    )
    render()
    wrapper!.unmount()
    wrapper = undefined
    resolve({ source: 'real', snapshot: testHomeSnapshot() })
    await flushPromises()
    expect(useHomeStore(pinia).snapshot).toBeNull()
    expect(vi.getTimerCount()).toBe(0)
  })
})
