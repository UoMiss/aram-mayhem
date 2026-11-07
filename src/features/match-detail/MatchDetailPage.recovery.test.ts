// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { defineComponent, h } from 'vue'
import { createPinia, disposePinia } from 'pinia'
import { createAppI18n } from '@/i18n'
import { useMatchLifecycle } from '@/composables/useMatchLifecycle'
import { useConnectionStore } from '@/stores/connection'
import { useHistoryStore } from '@/stores/history'
import { useRulesStore } from '@/stores/rules'
import { useSettlementStore } from '@/stores/settlement'
import { useUiStore } from '@/stores/ui'
import { LcuServiceError } from '@/services/desktop-error'
import { connectedStatus, homeFlow } from '../../../tests/fixtures/home-contract'
import {
  TEST_SETTLEMENT_ACCOUNT,
  TEST_SETTLEMENT_ID,
  testSettlement,
} from '../../../tests/fixtures/settlement-contract'
import MatchDetailPage from './MatchDetailPage.vue'

const api = vi.hoisted(() => ({ load: vi.fn() }))
vi.mock('@tauri-apps/api/core', () => ({ isTauri: () => true }))
vi.mock('@/services/settlement.service', () => ({ getSettlement: api.load }))
let pinia: ReturnType<typeof createPinia>
let wrapper: ReturnType<typeof mount> | undefined
function postGame(id = TEST_SETTLEMENT_ID, revision = 1) {
  const flow = homeFlow()
  useConnectionStore(pinia).setGameflowSnapshot(
    homeFlow({
      revision,
      phase: 'end_of_game',
      session: { ...flow.session!, phase: 'end_of_game', gameId: id },
    }),
  )
}
function partial() {
  const snapshot = testSettlement({ rankingStatus: 'missing_damage' })
  snapshot.players = snapshot.players.map((player) => ({
    ...player,
    damage: null,
    rank: null,
    ruleValue: null,
  }))
  return { source: 'real', snapshot }
}
function render() {
  wrapper = mount(
    defineComponent({
      setup() {
        useMatchLifecycle()
        return () => h(MatchDetailPage)
      },
    }),
    { global: { plugins: [pinia, createAppI18n()] } },
  )
  return wrapper
}
beforeEach(() => {
  vi.useFakeTimers()
  localStorage.clear()
  api.load.mockReset().mockResolvedValue({ source: 'real', snapshot: testSettlement() })
  pinia = createPinia()
  useConnectionStore(pinia).setLcuStatus(connectedStatus())
  postGame()
  const history = useHistoryStore(pinia)
  history.selectedMatchId = TEST_SETTLEMENT_ID
  history.accountKey = TEST_SETTLEMENT_ACCOUNT
  history.openLiveSettlement(TEST_SETTLEMENT_ID, TEST_SETTLEMENT_ACCOUNT)
  useRulesStore(pinia).setCurrentRule('tail')
})
afterEach(() => {
  wrapper?.unmount()
  wrapper = undefined
  disposePinia(pinia)
  vi.useRealTimers()
})

describe('bounded settlement recovery', () => {
  it('recovers when the trusted post-game event arrives after the partial detail response', async () => {
    useConnectionStore(pinia).setGameflowSnapshot(homeFlow({ revision: 2 }))
    api.load.mockResolvedValueOnce(partial())
    render()
    await flushPromises()
    expect(useSettlementStore(pinia).status).toBe('unavailable')
    // Change only the phase evidence; the target remains the same account and game.
    postGame(TEST_SETTLEMENT_ID, 3)
    await flushPromises()
    expect(useSettlementStore(pinia).status).toBe('pending')
    await vi.advanceTimersByTimeAsync(2000)
    await flushPromises()
    expect(api.load).toHaveBeenCalledTimes(2)
    expect(useSettlementStore(pinia).status).toBe('complete')
  })
  it('stops pending-data retries when the client leaves this post-game context', async () => {
    api.load.mockResolvedValue(partial())
    render()
    await flushPromises()
    useConnectionStore(pinia).setGameflowSnapshot(homeFlow({ revision: 2 }))
    await vi.advanceTimersByTimeAsync(10000)
    expect(api.load).toHaveBeenCalledOnce()
    expect(useSettlementStore(pinia).status).toBe('unavailable')
  })
  it.each(['settlement_pending', 'timeout'])(
    'bounds repeated %s failures and keeps manual recovery available',
    async (code) => {
      api.load.mockRejectedValue(new LcuServiceError(`lcu.${code}`, 'sanitized'))
      const page = render()
      await flushPromises()
      await vi.advanceTimersByTimeAsync(15000)
      expect(api.load).toHaveBeenCalledTimes(5)
      expect(page.get('#settlement-recovery-status').text()).toContain('自动重试已达上限')
      api.load.mockResolvedValueOnce({ source: 'real', snapshot: testSettlement() })
      await page
        .findAll('button')
        .find((button) => button.text() === '重新加载')!
        .trigger('click')
      await flushPromises()
      expect(useSettlementStore(pinia).status).toBe('complete')
      expect(api.load).toHaveBeenCalledTimes(6)
    },
  )
  it.each(['settlement_pending', 'timeout', 'connection_refused'])(
    'recovers current post-game %s with the same account and game',
    async (code) => {
      api.load.mockRejectedValueOnce(new LcuServiceError(`lcu.${code}`, 'sanitized'))
      render()
      await flushPromises()
      expect(useSettlementStore(pinia).status).toBe(
        code === 'settlement_pending' ? 'pending' : 'error',
      )
      await vi.advanceTimersByTimeAsync(2000)
      await flushPromises()
      expect(api.load).toHaveBeenCalledTimes(2)
      expect(api.load.mock.calls[1]).toEqual(api.load.mock.calls[0])
      expect(useSettlementStore(pinia).status).toBe('complete')
      await vi.advanceTimersByTimeAsync(10000)
      expect(api.load).toHaveBeenCalledTimes(2)
    },
  )
  it.each([
    'http_status',
    'invalid_response',
    'authentication_failed',
    'settlement_unavailable',
    'settlement_failed',
  ])('does not automatically retry %s', async (code) => {
    api.load.mockRejectedValueOnce(new LcuServiceError(`lcu.${code}`, 'sanitized'))
    const page = render()
    await flushPromises()
    await vi.advanceTimersByTimeAsync(15000)
    expect(api.load).toHaveBeenCalledOnce()
    expect(page.find('[role="alert"] button').exists()).toBe(true)
    expect(page.find('#screenshot-area').exists()).toBe(false)
  })
  it('stops after four retries and offers a manual recovery without zero damage or fake ranks', async () => {
    api.load.mockResolvedValue(partial())
    const page = render()
    await flushPromises()
    expect(useSettlementStore(pinia).status).toBe('pending')
    expect(page.text()).not.toContain('发红包名单')
    expect(
      useSettlementStore(pinia).snapshot?.players.every(
        (player) => player.damage === null && player.rank === null,
      ),
    ).toBe(true)
    await vi.advanceTimersByTimeAsync(15000)
    await flushPromises()
    expect(api.load).toHaveBeenCalledTimes(5)
    expect(page.get('#settlement-recovery-status').text()).toContain('自动重试已达上限')
    api.load.mockResolvedValueOnce({ source: 'real', snapshot: testSettlement() })
    const retry = page.findAll('button').find((button) => button.text() === '重新加载')!
    await retry.trigger('click')
    await flushPromises()
    expect(api.load).toHaveBeenCalledTimes(6)
    expect(useSettlementStore(pinia).status).toBe('complete')
    expect(page.find('#settlement-recovery-status').exists()).toBe(false)
  })
  it('does not classify old history opened through liveSettlement as recoverable post-game data', async () => {
    useConnectionStore(pinia).setGameflowSnapshot(homeFlow({ revision: 2 }))
    api.load.mockResolvedValue(partial())
    const page = render()
    await flushPromises()
    await vi.advanceTimersByTimeAsync(15000)
    expect(api.load).toHaveBeenCalledOnce()
    expect(useSettlementStore(pinia).status).toBe('unavailable')
    expect(page.text()).toContain('不自动重试')
    expect(page.findAll('button').some((button) => button.text() === '重新加载')).toBe(true)
  })
  it('does not retry missing lucky records', async () => {
    useRulesStore(pinia).setCurrentRule('lucky')
    const result = partial()
    result.snapshot.appliedRule = 'lucky'
    result.snapshot.rankingStatus = 'missing_lucky'
    api.load.mockResolvedValue(result)
    render()
    await flushPromises()
    await vi.advanceTimersByTimeAsync(15000)
    expect(api.load).toHaveBeenCalledOnce()
    expect(useSettlementStore(pinia).status).toBe('unavailable')
  })
  it.each(['account', 'target', 'leave', 'unmount'] as const)(
    'cancels the retry timer on %s change',
    async (change) => {
      api.load.mockResolvedValueOnce(partial())
      render()
      await flushPromises()
      if (change === 'account')
        useConnectionStore(pinia).setGameflowSnapshot(
          homeFlow({
            revision: 2,
            connected: false,
            phase: null,
            session: null,
            code: 'account_changed',
          }),
        )
      if (change === 'target') {
        api.load.mockResolvedValueOnce({ source: 'real', snapshot: testSettlement({ id: '42' }) })
        useHistoryStore(pinia).openLiveSettlement('42', TEST_SETTLEMENT_ACCOUNT)
      }
      if (change === 'leave') useUiStore(pinia).setActiveTab('history')
      if (change === 'unmount') {
        wrapper!.unmount()
        wrapper = undefined
      }
      await flushPromises()
      const count = api.load.mock.calls.length
      await vi.advanceTimersByTimeAsync(15000)
      expect(api.load).toHaveBeenCalledTimes(count)
      expect(useSettlementStore(pinia).snapshot?.id ?? null).toBe(change === 'target' ? '42' : null)
    },
  )
  it.each(['account', 'target', 'leave', 'unmount'] as const)(
    'discards a late automatic retry response after %s change',
    async (change) => {
      let finish!: (value: unknown) => void
      api.load.mockResolvedValueOnce(partial()).mockReturnValueOnce(
        new Promise((resolve) => {
          finish = resolve
        }),
      )
      render()
      await flushPromises()
      await vi.advanceTimersByTimeAsync(2000)
      expect(api.load).toHaveBeenCalledTimes(2)
      if (change === 'account')
        useConnectionStore(pinia).setGameflowSnapshot(
          homeFlow({
            revision: 2,
            connected: false,
            phase: null,
            session: null,
            code: 'account_changed',
          }),
        )
      if (change === 'target') {
        api.load.mockResolvedValueOnce({ source: 'real', snapshot: testSettlement({ id: '42' }) })
        useHistoryStore(pinia).openLiveSettlement('42', TEST_SETTLEMENT_ACCOUNT)
      }
      if (change === 'leave') useUiStore(pinia).setActiveTab('history')
      if (change === 'unmount') {
        wrapper!.unmount()
        wrapper = undefined
      }
      await flushPromises()
      finish(partial())
      await flushPromises()
      const count = api.load.mock.calls.length
      await vi.advanceTimersByTimeAsync(10000)
      expect(api.load).toHaveBeenCalledTimes(count)
      expect(useSettlementStore(pinia).snapshot?.id ?? null).toBe(change === 'target' ? '42' : null)
    },
  )
})
