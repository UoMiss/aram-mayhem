// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, disposePinia } from 'pinia'
import App from '@/App.vue'
import { createAppI18n } from '@/i18n'
import { useConnectionStore } from '@/stores/connection'
import { useHistoryStore } from '@/stores/history'
import { useSettlementStore } from '@/stores/settlement'
import { useRulesStore } from '@/stores/rules'
import { useUiStore } from '@/stores/ui'
import { configureDemo } from '@/mocks/client-demo'
const native = vi.hoisted(() => ({ invoke: vi.fn() }))
vi.mock('@tauri-apps/api/core', () => ({ isTauri: () => false, invoke: native.invoke }))
let pinia: ReturnType<typeof createPinia>
let wrapper: ReturnType<typeof mount>
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] })
  configureDemo({ size: 10, custom: true })
  native.invoke.mockReset()
  pinia = createPinia()
  wrapper = mount(App, { attachTo: document.body, global: { plugins: [pinia, createAppI18n()] } })
})
afterEach(() => {
  wrapper.unmount()
  disposePinia(pinia)
  expect(native.invoke).not.toHaveBeenCalled()
  vi.clearAllTimers()
  vi.useRealTimers()
  document.body.innerHTML = ''
})
async function connected() {
  await flushPromises()
  useConnectionStore(pinia).connect()
  await vi.advanceTimersByTimeAsync(1500)
  await flushPromises()
  await vi.dynamicImportSettled()
  await flushPromises()
}
describe('browser follows the desktop UI workflow', () => {
  it('shows room information, five recent matches, twenty history matches and distinct settlements', async () => {
    await connected()
    expect(useConnectionStore(pinia).isRealLcuConnected).toBe(false)
    const home = wrapper.get('#page-home')
    expect(home.get('[aria-label="当前账号"]').text()).toContain('峡谷小米#CN1')
    expect(home.text()).toContain('等级 128')
    expect(home.text()).toContain('嚎哭深渊')
    expect(home.text()).not.toContain('房间人数')
    expect(home.text()).not.toContain('10 人')
    expect(home.findAll('li')).toHaveLength(5)
    useUiStore(pinia).setActiveTab('history')
    await flushPromises()
    expect(wrapper.get('#historyList').findAll('[data-match-id]')).toHaveLength(20)
    const history = useHistoryStore(pinia)
    history.openMatchDetail('9000001')
    await flushPromises()
    expect(useSettlementStore(pinia).snapshot?.id).toBe('9000001')
    expect(wrapper.get('[data-red-packet] h3').text()).toContain(' · 3 人')
    history.openMatchDetail('9000002')
    await flushPromises()
    expect(useSettlementStore(pinia).snapshot?.id).toBe('9000002')
    expect(wrapper.get('#btn-layout-global').text()).toBe('结算')
    expect(wrapper.get('[data-red-packet] h3').text()).toContain(' · 2 人')
    expect(wrapper.get('[data-red-packet]').find('p').exists()).toBe(false)
    history.openMatchDetail('9000003')
    await flushPromises()
    expect(wrapper.get('[data-red-packet] #settlement-outcome strong').text()).toBe('7')
    await wrapper.get('[aria-label="返回战绩"]').trigger('click')
    expect(useUiStore(pinia).activeTab).toBe('history')
  })
  it('opens each rule as a text dialog without changing the active rule', async () => {
    await connected()
    useUiStore(pinia).setActiveTab('tools')
    await flushPromises()
    const rule = useRulesStore(pinia).currentRule
    const criteria = [
      ['damage', '精确总伤害从高到低排名'],
      ['tail', '从对英雄伤害的个位向高位逐位比较'],
      ['lucky', '等距时个位较大者优先'],
      ['damage_size', '0～4 为小，5～9 为大'],
    ] as const
    for (const [key, criterion] of criteria) {
      const trigger = wrapper.get(`[data-rule="${key}"] button[aria-haspopup="dialog"]`)
      await trigger.trigger('click')
      await flushPromises()
      const id = trigger.attributes('aria-controls')!
      const dialog = document.getElementById(id)!
      expect(dialog.getAttribute('role')).toBe('dialog')
      expect(
        Array.from(dialog.querySelectorAll('h3'), (heading) => heading.textContent?.trim()),
      ).toEqual(['玩法说明', '红包判定', '结算规则'])
      expect(dialog.textContent).toContain(criterion)
      expect(dialog.textContent).toContain('其他对局仅计算本人和本局好友')
      expect(dialog.querySelector('img')).toBeNull()
      if (key === 'damage_size') {
        expect(dialog.textContent).toContain('概率各为 50%')
        expect(dialog.textContent).toContain('可能无人发，也可能全员发')
      } else {
        expect(dialog.textContent).toContain('伤害相同则并列')
        expect(dialog.textContent).toContain('并列玩家都发')
      }
      expect(useRulesStore(pinia).currentRule).toBe(rule)
      dialog.querySelector<HTMLButtonElement>('button[aria-label="关闭规则说明"]')!.click()
      await flushPromises()
      expect(document.getElementById(id)).toBeNull()
    }
  })
  it.each([6, 8, 10])(
    'refreshes %i participants and uses the same three-second team draw',
    async (size) => {
      await connected()
      configureDemo({ size, custom: true })
      useUiStore(pinia).setActiveTab('tools')
      await flushPromises()
      await wrapper.get('#page-tools .grid button').trigger('click')
      await flushPromises()
      expect(wrapper.get('#playerCount').text()).toBe(`${size} 人`)
      await wrapper.get('#refreshTeamPlayers').trigger('click')
      await flushPromises()
      await wrapper.get('#randomBtn').trigger('click')
      await flushPromises()
      expect(wrapper.get('#randomBtn').text()).toContain('3')
      expect(wrapper.find('#timestampBar').exists()).toBe(false)
      await vi.advanceTimersByTimeAsync(3000)
      expect(wrapper.get('#teamA').findAll('[title]')).toHaveLength(size / 2)
      expect(wrapper.get('#copyTeamBtn').attributes('disabled')).toBeUndefined()
      useConnectionStore(pinia).disconnect()
      await flushPromises()
      expect(wrapper.find('#timestampBar').exists()).toBe(false)
    },
  )
  it('locks the opening rule, recovers delayed post-game data and keeps its lucky digit', async () => {
    await connected()
    useRulesStore(pinia).setCurrentRule('lucky')
    configureDemo({ phase: 'game_start' })
    await flushPromises()
    useRulesStore(pinia).setCurrentRule('damage')
    configureDemo({ phase: 'in_progress' })
    await flushPromises()
    const connection = useConnectionStore(pinia)
    connection.disconnect()
    await flushPromises()
    connection.connect()
    await vi.advanceTimersByTimeAsync(1500)
    await flushPromises()
    configureDemo({ phase: 'end_of_game', delayed: true })
    await flushPromises()
    const settlement = useSettlementStore(pinia)
    expect(useUiStore(pinia).activeTab).toBe('match-detail')
    expect(settlement.status).toBe('pending')
    await vi.advanceTimersByTimeAsync(4000)
    await flushPromises()
    expect(settlement.status).toBe('complete')
    expect(settlement.snapshot?.appliedRule).toBe('lucky')
    expect(settlement.snapshot?.lockedRule).toBe(true)
    const digit = settlement.snapshot!.luckyDigit
    const target = useHistoryStore(pinia).liveSettlement!
    useUiStore(pinia).setActiveTab('tools')
    await flushPromises()
    useHistoryStore(pinia).openLiveSettlement(target.gameId, target.accountKey)
    await flushPromises()
    expect(settlement.snapshot?.luckyDigit).toBe(digit)
    useUiStore(pinia).setActiveTab('history')
    await flushPromises()
    expect(useHistoryStore(pinia).matchHistory[0]?.id).toBe(target.gameId)
  })
  it.each([true, false])(
    'locks and freezes size results for custom=%s without ranks',
    async (custom) => {
      await connected()
      configureDemo({ size: 8, custom })
      useRulesStore(pinia).setCurrentRule('damage_size')
      configureDemo({ phase: 'game_start' })
      await flushPromises()
      configureDemo({ phase: 'end_of_game', delayed: true })
      await flushPromises()
      await vi.advanceTimersByTimeAsync(4000)
      await flushPromises()
      const settlement = useSettlementStore(pinia)
      expect(settlement.status).toBe('complete')
      const result = structuredClone(settlement.snapshot!.damageSize!)
      expect(result.participants).toHaveLength(custom ? 8 : 4)
      expect(wrapper.get('[data-red-packet] #settlement-outcome').text()).toContain('本局开奖')
      const group = wrapper.get('#layout-group')
      for (const side of ['red', 'blue']) {
        expect(group.get(`[data-team-section="${side}"]`).findAll('[data-player-id]')).toHaveLength(
          custom ? 4 : 5,
        )
      }
      const eligibleIds = ['big', 'small'].flatMap((size) =>
        result.participants.filter((player) => player.group === size).map((player) => player.id),
      )
      expect(group.find('[data-player-result]').exists()).toBe(false)
      const senders = wrapper.get('[data-red-packet]').text()
      await wrapper.get('#btn-layout-global').trigger('click')
      expect(
        wrapper
          .get('#layout-global')
          .findAll('[data-player-id]')
          .map((row) => row.attributes('data-player-id')),
      ).toEqual(eligibleIds)
      const actualSizes = wrapper
        .get('#layout-global')
        .findAll('[data-player-result]')
        .map((value) => value.text())
      expect(actualSizes).toEqual([
        ...result.participants.filter((player) => player.group === 'big').map(() => '大'),
        ...result.participants.filter((player) => player.group === 'small').map(() => '小'),
      ])
      expect(wrapper.get('[data-red-packet]').text()).toBe(senders)
      expect(settlement.snapshot!.players.every((p) => p.rank === null)).toBe(true)
      const target = useHistoryStore(pinia).liveSettlement!
      useUiStore(pinia).setActiveTab('tools')
      await flushPromises()
      useHistoryStore(pinia).openLiveSettlement(target.gameId, target.accountKey)
      await flushPromises()
      expect(settlement.snapshot!.damageSize).toEqual(result)
    },
  )
  it('simulates update progress, cancellation, confirmation and completion without native IPC', async () => {
    await connected()
    useUiStore(pinia).setActiveTab('settings')
    await wrapper.get('[data-action="check-update"]').trigger('click')
    await vi.advanceTimersByTimeAsync(450)
    await flushPromises()
    expect(wrapper.get('#page-settings').text()).toContain('模拟更新流程')
    await wrapper.get('[data-action="download-update"]').trigger('click')
    await flushPromises()
    await vi.advanceTimersByTimeAsync(300)
    expect(wrapper.get('progress').attributes('value')).toBe('20')
    await wrapper.get('[data-action="cancel-update"]').trigger('click')
    await vi.advanceTimersByTimeAsync(300)
    await flushPromises()
    await wrapper.get('[data-action="download-update"]').trigger('click')
    await vi.advanceTimersByTimeAsync(1800)
    await flushPromises()
    await wrapper.get('[data-action="install-update"]').trigger('click')
    await flushPromises()
    const confirm = document.querySelector<HTMLButtonElement>('[data-action="confirm-install"]')!
    expect(confirm).not.toBeNull()
    confirm.click()
    await vi.advanceTimersByTimeAsync(600)
    await flushPromises()
    expect(wrapper.get('#page-settings').text()).toContain('模拟安装完成')
  })
  it('applies the settings switch to the simulated ready check and preserves the room selection', async () => {
    await connected()
    const controls = wrapper.get('[data-demo-controls]')
    await controls.get('select').setValue('matched')
    await controls.findAll('button')[0]!.trigger('click')
    await controls.findAll('button')[0]!.trigger('click')
    expect(useConnectionStore(pinia).gameflowSnapshot?.phase).toBe('ready_check')
    expect(useConnectionStore(pinia).gameflowSnapshot?.readyCheckStatus).toBe('waiting')
    useUiStore(pinia).setActiveTab('settings')
    await flushPromises()
    await wrapper.get('#page-settings [role="switch"]').trigger('click')
    expect(useConnectionStore(pinia).gameflowSnapshot?.readyCheckStatus).toBe('accepted')
    await controls.get('select').setValue('6')
    await controls.findAll('button')[0]!.trigger('click')
    expect(useConnectionStore(pinia).gameflowSnapshot?.phase).toBe('champ_select')
    expect((controls.get('select').element as HTMLSelectElement).value).toBe('6')
  })
})
