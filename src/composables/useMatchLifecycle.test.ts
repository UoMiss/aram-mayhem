// @vitest-environment happy-dom
import { it, expect, vi } from 'vitest'
import { defineComponent } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, disposePinia } from 'pinia'
import { createAppI18n } from '@/i18n'
import { useConnectionStore } from '@/stores/connection'
import { useHistoryStore } from '@/stores/history'
import { useMatchRulesStore } from '@/stores/match-rules'
import { useRulesStore } from '@/stores/rules'
import type { GameflowPhase } from '@/types/lcu'
import { connectedStatus, homeFlow, testHomeSnapshot } from '../../tests/fixtures/home-contract'
import { useMatchLifecycle } from './useMatchLifecycle'
import { getLockedMatchRule, lockMatchRule } from '@/services/match-rule.service'
import { LcuServiceError } from '@/services/desktop-error'

vi.mock('@tauri-apps/api/core', () => ({ isTauri: () => true }))
vi.mock('@/services/home.service', () => ({ getHomeSnapshot: vi.fn() }))
vi.mock('@/services/match-rule.service', () => ({
  getLockedMatchRule: vi.fn(),
  lockMatchRule: vi.fn(),
}))
import { getHomeSnapshot } from '@/services/home.service'

const component = defineComponent({
  setup() {
    useMatchLifecycle()
    return () => null
  },
})

it('locks only the rule at opening and opens the exact settlement after reconnect', async () => {
  localStorage.clear()
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
  vi.mocked(getLockedMatchRule).mockResolvedValue(null)
  vi.mocked(lockMatchRule).mockImplementation(async (choice) => ({
    accountKey: 'account-1',
    gameId: choice.gameId,
    rule: choice.rule,
    luckyDigit: null,
  }))
  vi.mocked(getHomeSnapshot).mockResolvedValue({ source: 'real', snapshot: testHomeSnapshot() })
  const pinia = createPinia()
  const connection = useConnectionStore(pinia)
  const rules = useRulesStore(pinia)
  rules.setCurrentRule('lucky')
  const wrapper = mount(component, { global: { plugins: [pinia, createAppI18n()] } })
  let revision = 0
  function phase(gameId: string, phase: GameflowPhase) {
    const flow = homeFlow()
    connection.setGameflowSnapshot({
      ...flow,
      phase,
      revision: ++revision,
      session: { ...flow.session!, sessionKey: gameId, gameId, phase },
    })
  }
  try {
    connection.setLcuStatus(connectedStatus())
    phase('42', 'champ_select')
    await flushPromises()
    expect(lockMatchRule).not.toHaveBeenCalled()
    vi.mocked(lockMatchRule).mockRejectedValueOnce(
      new LcuServiceError('lcu.timeout', 'test timeout'),
    )
    phase('42', 'game_start')
    phase('42', 'in_progress')
    await flushPromises()
    await vi.advanceTimersByTimeAsync(1500)
    await flushPromises()
    expect(lockMatchRule).toHaveBeenCalledTimes(2)
    const record = useMatchRulesStore(pinia).find('account-1', '42')
    expect(record?.rule).toBe('lucky')
    expect(record?.luckyDigit).toBeNull()
    expect(lockMatchRule).toHaveBeenLastCalledWith({
      gameId: '42',
      sessionKey: '42',
      rule: 'lucky',
    })
    expect(useHistoryStore(pinia).liveSettlement).toBeNull()
    useRulesStore(pinia).setCurrentRule('damage')
    phase('42', 'in_progress')
    await flushPromises()
    connection.setLcuStatus(connectedStatus({ status: 'disconnected', revision: 2 }))
    connection.setLcuStatus(connectedStatus({ revision: 3 }))
    phase('42', 'end_of_game')
    await flushPromises()
    expect(useHistoryStore(pinia).liveSettlement).toEqual({ gameId: '42', accountKey: 'account-1' })
    expect(useMatchRulesStore(pinia).find('account-1', '42')).toEqual(record)

    useRulesStore(pinia).setCurrentRule('lucky')
    phase('43', 'in_progress')
    await flushPromises()
    expect(useMatchRulesStore(pinia).find('account-1', '43')).toBeUndefined()
  } finally {
    wrapper.unmount()
    disposePinia(pinia)
    localStorage.clear()
    vi.useRealTimers()
  }
})

it('discards pending old-account settlement navigation even when LCU stays connected', async () => {
  localStorage.clear()
  vi.mocked(lockMatchRule).mockReset()
  vi.mocked(getLockedMatchRule).mockReset()
  let finish!: (value: Awaited<ReturnType<typeof getLockedMatchRule>>) => void
  vi.mocked(getLockedMatchRule).mockReturnValueOnce(
    new Promise((resolve) => {
      finish = resolve
    }),
  )
  const pinia = createPinia()
  const wrapper = mount(component, { global: { plugins: [pinia, createAppI18n()] } })
  const connection = useConnectionStore(pinia)
  try {
    connection.setLcuStatus(connectedStatus())
    const base = homeFlow()
    connection.setGameflowSnapshot(
      homeFlow({
        revision: 1,
        phase: 'end_of_game',
        session: { ...base.session!, phase: 'end_of_game', gameId: '42' },
      }),
    )
    await flushPromises()
    expect(getLockedMatchRule).toHaveBeenCalledWith('42')
    connection.setGameflowSnapshot(
      homeFlow({
        revision: 2,
        connected: false,
        phase: null,
        session: null,
        code: 'account_changed',
      }),
    )
    connection.setGameflowSnapshot(
      homeFlow({
        revision: 3,
        session: {
          ...base.session!,
          sessionKey: 'new-account',
          connectionGeneration: 2,
          modeContext: null,
        },
      }),
    )
    finish({ accountKey: 'old-account', gameId: '42', rule: 'damage', luckyDigit: null })
    await flushPromises()
    expect(connection.isRealLcuConnected).toBe(true)
    expect(useHistoryStore(pinia).liveSettlement).toBeNull()
  } finally {
    wrapper.unmount()
    disposePinia(pinia)
    localStorage.clear()
  }
})
