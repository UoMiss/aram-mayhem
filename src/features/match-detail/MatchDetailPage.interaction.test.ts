// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, disposePinia } from 'pinia'
import { createAppI18n } from '@/i18n'
import { useConnectionStore } from '@/stores/connection'
import { useHistoryStore } from '@/stores/history'
import { useRulesStore } from '@/stores/rules'
import { useSettlementStore } from '@/stores/settlement'
import { useUiStore } from '@/stores/ui'
import { LcuServiceError } from '@/services/desktop-error'
import { connectedStatus } from '../../../tests/fixtures/home-contract'
import {
  TEST_SETTLEMENT_ACCOUNT,
  TEST_SETTLEMENT_ID,
  testSettlement,
} from '../../../tests/fixtures/settlement-contract'
const api = vi.hoisted(() => ({ load: vi.fn() }))
vi.mock('@tauri-apps/api/core', () => ({ isTauri: () => true }))
vi.mock('@/services/settlement.service', () => ({ getSettlement: api.load }))
import MatchDetailPage from './MatchDetailPage.vue'
let pinia: ReturnType<typeof createPinia>
let wrapper: ReturnType<typeof mount> | undefined
function render() {
  wrapper = mount(MatchDetailPage, { global: { plugins: [pinia, createAppI18n()] } })
  return wrapper
}
beforeEach(() => {
  localStorage.clear()
  api.load.mockReset()
  api.load.mockResolvedValue({ source: 'real', snapshot: testSettlement() })
  pinia = createPinia()
  useConnectionStore(pinia).setLcuStatus(connectedStatus())
  const history = useHistoryStore(pinia)
  history.selectedMatchId = TEST_SETTLEMENT_ID
  history.accountKey = TEST_SETTLEMENT_ACCOUNT
  useRulesStore(pinia).setCurrentRule('tail')
  useUiStore(pinia).setActiveTab('match-detail')
})
afterEach(() => {
  wrapper?.unmount()
  wrapper = undefined
  disposePinia(pinia)
})
describe('real match settlement', () => {
  it('shows actual teams, outcome, exact stats, local portraits and server ranks', async () => {
    const snapshot = testSettlement()
    const outsider = {
      ...snapshot.players[0]!,
      id: '4',
      nickname: '路人玩家',
      isFriend: false,
      rank: null,
      ruleValue: null,
    }
    api.load.mockResolvedValueOnce({
      source: 'real',
      snapshot: { ...snapshot, players: [...snapshot.players, outsider] },
    })
    const page = render()
    await flushPromises()
    expect(api.load).toHaveBeenCalledWith({
      gameId: TEST_SETTLEMENT_ID,
      accountKey: TEST_SETTLEMENT_ACCOUNT,
      rule: 'tail',
    })
    expect(page.text()).toContain('蓝方 · 胜利')
    expect(page.text()).toContain('红方 · 失败')
    expect(page.text()).toContain('18,446,744,073,709,551,615')
    expect(page.text()).toContain('真实玩家#CN1')
    const meta = page.get('#settlement-meta')
    expect(meta.element.children).toHaveLength(3)
    expect(meta.text()).not.toContain(TEST_SETTLEMENT_ID)
    expect(meta.text()).toContain('当前规则：伤害尾数规则')
    expect(meta.text()).toContain('海克斯大乱斗')
    expect(meta.get('.tabular-nums').text()).toBe('时长：20:04')
    expect(meta.element.previousElementSibling?.textContent).toContain('对局结算')
    expect(meta.element.previousElementSibling?.querySelector('button')).not.toBeNull()
    expect(meta.find('.fa-clock').exists()).toBe(false)
    const screenshot = page.get('#screenshot-area')
    expect(screenshot.find('#settlement-meta').exists()).toBe(false)
    expect(screenshot.find('h2').exists()).toBe(false)
    expect(screenshot.find('#layout-group').exists()).toBe(true)
    expect(page.text()).not.toContain('开始时间')
    expect(page.find('#settlement-lucky-digit').exists()).toBe(false)
    expect(page.text()).not.toContain('发红包名单')
    expect(page.text()).toContain('当前参与排名人数不符合红包规则')
    expect(page.text()).not.toContain('浏览器演示结算')
    expect(page.get('[data-team-section="blue"] img').attributes('src')).toContain('Zeri')
    expect(page.get('#layout-group').text()).toContain('路人玩家')
    expect(page.get('#btn-layout-global').text()).toContain('好友排行')
    await page.get('#btn-layout-global').trigger('click')
    expect(
      page
        .get('#layout-global')
        .findAll('[data-player-id]')
        .map((row) => row.attributes('data-player-id')),
    ).toEqual(['3', '1'])
    expect(page.get('#layout-global [data-player-id="3"]').text()).toContain('#1')
    expect(page.get('#layout-global [data-player-id="3"] [data-player-relation]').text()).toBe('友')
    expect(page.get('#layout-global [data-player-id="1"] [data-player-relation]').text()).toBe('我')
    expect(page.get('#layout-global [data-player-id="3"]').classes()).toContain(
      'border-l-danger-bright',
    )
    expect(page.get('#layout-global [data-player-id="1"]').classes()).toContain(
      'border-l-info-bright',
    )
    await page.get('[aria-label="返回战绩"]').trigger('click')
    expect(useUiStore(pinia).activeTab).toBe('history')
    expect(useSettlementStore(pinia).snapshot).toBeNull()
  })
  it.each([
    { lockedRule: true, title: '发红包名单', otherTitle: '红包名单预览' },
    { lockedRule: false, title: '红包名单预览', otherTitle: '发红包名单' },
  ])(
    'shows the eligible cutoff with the correct title ($title)',
    async ({ lockedRule, title, otherTitle }) => {
      const snapshot = testSettlement(
        lockedRule ? { lockedRule, appliedRule: 'lucky', luckyDigit: 0 } : { lockedRule },
      )
      const tiedFriend = {
        ...snapshot.players[0]!,
        id: '5',
        nickname: '并列好友',
        rank: 2,
      }
      api.load.mockResolvedValueOnce({
        source: 'real',
        snapshot: { ...snapshot, players: [...snapshot.players, tiedFriend] },
      })
      const page = render()
      await flushPromises()
      expect(page.text()).toContain(title)
      expect(page.text()).not.toContain(otherTitle)
      expect(page.text()).toContain('原取末 1 名，分界并列后共 2 人')
      if (lockedRule) {
        const card = page.get('#screenshot-area #settlement-lucky-digit')
        expect(card.text()).toContain('本局幸运数字')
        expect(card.get('strong').text()).toBe('0')
        expect(card.element.nextElementSibling?.textContent).toContain('发红包名单')
      }
    },
  )
  it('keeps raw data available but withholds lucky ranks without an opening record', async () => {
    useRulesStore(pinia).setCurrentRule('lucky')
    const snapshot = testSettlement()
    api.load.mockResolvedValueOnce({
      source: 'real',
      snapshot: {
        ...snapshot,
        appliedRule: 'lucky',
        rankingStatus: 'missing_lucky',
        players: snapshot.players.map((player) => ({ ...player, rank: null, ruleValue: null })),
      },
    })
    const page = render()
    await flushPromises()
    expect(page.text()).toContain('没有可用的赛后幸运数字')
    expect(page.text()).toContain('真实玩家#CN1')
    expect(page.get('#btn-layout-global').text()).toContain('全场数据')
    expect(page.get('#layout-global').text()).not.toContain('#1')
    expect(page.text()).not.toContain('红包名单')
  })
  it('sanitizes native errors, permits retry, and never shows demo data on failure', async () => {
    api.load.mockRejectedValueOnce(new LcuServiceError('lcu.timeout', 'password=secret'))
    const page = render()
    await flushPromises()
    expect(page.get('[role="alert"]').text()).toContain('结算读取失败')
    expect(page.text()).not.toContain('secret')
    expect(page.find('#screenshot-area').exists()).toBe(false)
    await page.get('[role="alert"] button').trigger('click')
    await flushPromises()
    expect(page.find('#screenshot-area').exists()).toBe(true)
  })
  it('loads only the active detail page and ignores late responses after disconnect', async () => {
    const ui = useUiStore(pinia)
    ui.setActiveTab('history')
    const page = render()
    await flushPromises()
    expect(api.load).not.toHaveBeenCalled()
    let resolve!: (value: unknown) => void
    api.load.mockReturnValueOnce(
      new Promise((done) => {
        resolve = done
      }),
    )
    ui.setActiveTab('match-detail')
    await flushPromises()
    expect(page.text()).toContain('正在读取对局结算')
    useConnectionStore(pinia).setLcuStatus(connectedStatus({ status: 'disconnected', revision: 2 }))
    resolve({ source: 'real', snapshot: testSettlement() })
    await flushPromises()
    expect(useSettlementStore(pinia).snapshot).toBeNull()
    expect(page.find('#screenshot-area').exists()).toBe(false)
  })
})
