// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, type Component } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, disposePinia } from 'pinia'
import { createAppI18n } from '@/i18n'
import { useConnectionStore } from '@/stores/connection'
import { useHistoryStore } from '@/stores/history'
import { useHomeStore } from '@/stores/home'
import { useSettlementStore } from '@/stores/settlement'
import { useMatchRulesStore } from '@/stores/match-rules'
import { useUiStore } from '@/stores/ui'
import { useMatchLifecycle } from './useMatchLifecycle'
import HomePage from '@/features/home/HomePage.vue'
import HistoryPage from '@/features/history/HistoryPage.vue'
import { LcuServiceError } from '@/services/desktop-error'
import { connectedStatus, homeFlow, testHomeSnapshot } from '../../tests/fixtures/home-contract'
import { testHistorySnapshot } from '../../tests/fixtures/history-contract'
import {
  TEST_SETTLEMENT_ACCOUNT,
  TEST_SETTLEMENT_ID,
  testSettlement,
} from '../../tests/fixtures/settlement-contract'

const api = vi.hoisted(() => ({ home: vi.fn(), history: vi.fn(), settlement: vi.fn() }))
vi.mock('@tauri-apps/api/core', () => ({ isTauri: () => true }))
vi.mock('@/services/home.service', () => ({ getHomeSnapshot: api.home }))
vi.mock('@/services/history.service', () => ({ getMatchHistory: api.history }))
vi.mock('@/services/settlement.service', () => ({ getSettlement: api.settlement }))

let pinia: ReturnType<typeof createPinia>
let wrapper: ReturnType<typeof mount> | undefined
const request = {
  accountKey: TEST_SETTLEMENT_ACCOUNT,
  gameId: TEST_SETTLEMENT_ID,
  rule: 'tail' as const,
}
function results(accountKey = TEST_SETTLEMENT_ACCOUNT) {
  return {
    home: { source: 'real', snapshot: testHomeSnapshot({ accountKey, displayName: accountKey }) },
    history: { source: 'real', snapshot: { ...testHistorySnapshot(), accountKey } },
    settlement: { source: 'real', snapshot: testSettlement({ accountKey }) },
  }
}
function respondAs(accountKey = TEST_SETTLEMENT_ACCOUNT) {
  const values = results(accountKey)
  for (const key of ['home', 'history', 'settlement'] as const)
    api[key].mockResolvedValue(values[key])
}
function render(child?: Component) {
  wrapper = mount(
    defineComponent({
      setup() {
        useMatchLifecycle()
        return () => (child ? h(child) : null)
      },
    }),
    { global: { plugins: [pinia, createAppI18n()] } },
  )
  return wrapper
}
function invalidate(revision = 2) {
  useConnectionStore(pinia).setGameflowSnapshot(
    homeFlow({
      revision,
      connected: false,
      phase: null,
      session: null,
      code: 'account_changed',
    }),
  )
}
function recover(revision = 3) {
  useConnectionStore(pinia).setGameflowSnapshot(homeFlow({ revision }))
}
beforeEach(() => {
  localStorage.clear()
  for (const mock of Object.values(api)) mock.mockReset()
  respondAs()
  pinia = createPinia()
  useConnectionStore(pinia).setLcuStatus(connectedStatus())
  recover(1)
})
afterEach(() => {
  wrapper?.unmount()
  wrapper = undefined
  disposePinia(pinia)
  localStorage.clear()
})

describe('account boundary through the real lifecycle and stores', () => {
  it('synchronously clears visible account data and both settlement targets, preserving saved rules', async () => {
    render()
    const history = useHistoryStore(pinia)
    const home = useHomeStore(pinia)
    const settlement = useSettlementStore(pinia)
    const rules = useMatchRulesStore(pinia)
    const record = { ...request, rule: 'lucky' as const, luckyDigit: 7 }
    rules.accept(record)
    localStorage.setItem('aram.score-rule.v1', 'lucky')
    await Promise.all([home.loadHome(), history.loadHistory(), settlement.load(request)])
    history.selectedMatchId = request.gameId
    history.openLiveSettlement(request.gameId, request.accountKey)
    invalidate()
    // Check before nextTick: old responses must already be invalidated.
    expect(useConnectionStore(pinia).isRealLcuConnected).toBe(true)
    expect(home.snapshot).toBeNull()
    expect(history.accountKey).toBeNull()
    expect(history.matchHistory).toEqual([])
    expect(history.realMatches).toEqual([])
    expect(history.selectedMatchId).toBeNull()
    expect(history.liveSettlement).toBeNull()
    expect(settlement.snapshot).toBeNull()
    expect(rules.find(request.accountKey, request.gameId)).toEqual(record)
    expect(localStorage.getItem('aram.score-rule.v1')).toBe('lucky')
  })

  it.each([
    { nextAccount: 'account-B', lateError: false },
    { nextAccount: 'account-B', lateError: true },
    { nextAccount: TEST_SETTLEMENT_ACCOUNT, lateError: false },
    { nextAccount: TEST_SETTLEMENT_ACCOUNT, lateError: true },
  ])(
    'ignores old responses/errors after login as $nextAccount (error=$lateError)',
    async ({ nextAccount, lateError }) => {
      render()
      const home = useHomeStore(pinia)
      const history = useHistoryStore(pinia)
      const settlement = useSettlementStore(pinia)
      const release: Array<() => void> = []
      const previous = results()
      for (const key of ['home', 'history', 'settlement'] as const) {
        api[key].mockImplementationOnce(
          () =>
            new Promise((resolve, reject) => {
              release.push(() =>
                lateError
                  ? reject(new LcuServiceError('lcu.account_changed', 'Old request failed'))
                  : resolve(previous[key]),
              )
            }),
        )
      }
      const old = [home.loadHome(), history.loadHistory(), settlement.load(request)]
      invalidate()
      // Recovery in the same tick must not coalesce with old in-flight requests.
      recover()
      respondAs(nextAccount)
      await Promise.all([
        home.loadHome(),
        history.loadHistory(),
        settlement.load({ ...request, accountKey: nextAccount }),
      ])
      const fresh = [home.snapshot, history.realMatches, settlement.snapshot]
      release.forEach((finish) => finish())
      await Promise.all(old)
      expect(home.snapshot).toBe(fresh[0])
      expect(history.realMatches).toBe(fresh[1])
      expect(settlement.snapshot).toBe(fresh[2])
      expect(home.snapshot?.accountKey).toBe(nextAccount)
      expect(history.accountKey).toBe(nextAccount)
      expect(settlement.snapshot?.accountKey).toBe(nextAccount)
      expect([home.errorCode, history.errorCode, settlement.errorCode]).toEqual([null, null, null])
      expect([home.isLoading, history.isLoading, settlement.isLoading]).toEqual([
        false,
        false,
        false,
      ])
      for (const mock of Object.values(api)) expect(mock).toHaveBeenCalledTimes(2)
    },
  )

  it.each(['home', 'history'] as const)(
    'clears and automatically refreshes the mounted %s page after login',
    async (tab) => {
      useUiStore(pinia).setActiveTab(tab)
      render(tab === 'home' ? HomePage : HistoryPage)
      await flushPromises()
      const home = useHomeStore(pinia)
      const history = useHistoryStore(pinia)
      expect(tab === 'home' ? home.snapshot?.accountKey : history.accountKey).toBe(
        request.accountKey,
      )
      invalidate()
      await flushPromises()
      expect(home.snapshot).toBeNull()
      expect(history.accountKey).toBeNull()
      const calls = api.history.mock.calls.length
      if (tab === 'history')
        expect(wrapper!.get('[aria-label="刷新战绩"]').attributes('disabled')).toBeDefined()
      respondAs('account-B')
      recover()
      await flushPromises()
      expect(tab === 'home' ? home.snapshot?.accountKey : history.accountKey).toBe('account-B')
      expect(api.history.mock.calls.length).toBeGreaterThan(calls)
    },
  )

  it('keeps account reads blocked across transport reconnects, stale snapshots and gameflow errors', async () => {
    render()
    const connection = useConnectionStore(pinia)
    invalidate(10)
    connection.setLcuStatus(connectedStatus({ revision: 2, status: 'disconnected' }))
    connection.setLcuStatus(connectedStatus({ revision: 3 }))
    recover(9)
    expect(connection.canReadAccountData).toBe(false)
    connection.setGameflowSnapshot(
      homeFlow({ revision: 11, code: 'read_failed', connected: false }),
    )
    connection.setGameflowSnapshot(homeFlow({ revision: 12, source: 'mock', simulated: true }))
    expect(connection.canReadAccountData).toBe(false)
    await useHomeStore(pinia).loadHome()
    expect(api.home).not.toHaveBeenCalled()
    recover(13)
    expect(connection.canReadAccountData).toBe(true)
    await useHomeStore(pinia).loadHome()
    expect(api.home).toHaveBeenCalledOnce()
  })
})
