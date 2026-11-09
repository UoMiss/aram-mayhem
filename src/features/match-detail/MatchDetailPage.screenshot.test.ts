// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { defineComponent, h } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, disposePinia } from 'pinia'
import { createAppI18n } from '@/i18n'
import { useMatchLifecycle } from '@/composables/useMatchLifecycle'
import { useConnectionStore } from '@/stores/connection'
import { useHistoryStore } from '@/stores/history'
import { useRulesStore } from '@/stores/rules'
import { useUiStore } from '@/stores/ui'
import { useFeedbackStore } from '@/stores/feedback'
import { useSettlementStore } from '@/stores/settlement'
import { connectedStatus, homeFlow } from '../../../tests/fixtures/home-contract'
import {
  TEST_SETTLEMENT_ACCOUNT,
  TEST_SETTLEMENT_ID,
  testSettlement,
} from '../../../tests/fixtures/settlement-contract'
import MatchDetailPage from './MatchDetailPage.vue'
import { testDamageSize } from '../../../tests/fixtures/damage-size-contract'

const api = vi.hoisted(() => ({ desktop: true, load: vi.fn(), render: vi.fn() }))
vi.mock('@tauri-apps/api/core', () => ({ isTauri: () => api.desktop }))
vi.mock('@/services/settlement.service', () => ({ getSettlement: api.load }))
vi.mock('html2canvas-pro', () => ({ default: api.render }))

let pinia: ReturnType<typeof createPinia>
let wrapper: ReturnType<typeof mount> | undefined
let clipboardDescriptor: PropertyDescriptor | undefined
const write = vi.fn()
const blob = new Blob(['synthetic settlement'], { type: 'image/png' })
function canvas() {
  return { toBlob: (done: BlobCallback) => done(blob) }
}
async function render() {
  wrapper = mount(
    defineComponent({
      setup() {
        useMatchLifecycle()
        return () => h(MatchDetailPage)
      },
    }),
    { global: { plugins: [pinia, createAppI18n()] } },
  )
  await flushPromises()
  return wrapper
}
beforeEach(() => {
  api.desktop = true
  localStorage.clear()
  api.load.mockReset().mockResolvedValue({ source: 'real', snapshot: testSettlement() })
  api.render.mockReset().mockResolvedValue(canvas())
  write.mockReset().mockResolvedValue(undefined)
  clipboardDescriptor = Object.getOwnPropertyDescriptor(navigator, 'clipboard')
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { write } })
  vi.stubGlobal(
    'ClipboardItem',
    class {
      constructor(public items: Record<string, Blob>) {}
    },
  )
  vi.spyOn(HTMLImageElement.prototype, 'complete', 'get').mockReturnValue(true)
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined)
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:synthetic-settlement')
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined)
  pinia = createPinia()
  vi.spyOn(useFeedbackStore(pinia), 'notify')
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
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  if (clipboardDescriptor) Object.defineProperty(navigator, 'clipboard', clipboardDescriptor)
  else Reflect.deleteProperty(navigator, 'clipboard')
})

it('audit_settlement_export_is_cancelled_if_page_changes_during_capture', async () => {
  let finish!: (value: unknown) => void
  api.render.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve
      }),
  )
  const page = await render()
  await page.get('#copyBtn').trigger('click')
  await flushPromises()
  expect(api.render).toHaveBeenCalledOnce()
  useUiStore(pinia).setActiveTab('history')
  await flushPromises()
  finish(canvas())
  await flushPromises()
  expect(write).not.toHaveBeenCalled()
  expect(HTMLAnchorElement.prototype.click).not.toHaveBeenCalled()
  expect(useFeedbackStore(pinia).toastVisible).toBe(false)
})

type Change = 'leave' | 'account' | 'target' | 'unmount' | 'refresh' | 'round-trip' | 'layout'
async function invalidate(change: Change) {
  if (change === 'leave') useUiStore(pinia).setActiveTab('history')
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
  if (change === 'unmount') {
    wrapper!.unmount()
    wrapper = undefined
  }
  if (change === 'refresh')
    await useSettlementStore(pinia).load({
      gameId: TEST_SETTLEMENT_ID,
      accountKey: TEST_SETTLEMENT_ACCOUNT,
      rule: 'tail',
    })
  if (change === 'round-trip') {
    useUiStore(pinia).setActiveTab('history')
    useUiStore(pinia).setActiveTab('match-detail')
  }
  if (change === 'layout') await wrapper!.get('#btn-layout-global').trigger('click')
  await flushPromises()
}

it.each(
  (['render', 'blob'] as const).flatMap((stage) =>
    (['leave', 'account', 'target', 'unmount', 'refresh', 'round-trip', 'layout'] as const).map(
      (change) => ({ stage, change }),
    ),
  ),
)('blocks delivery after $change while $stage is pending', async ({ stage, change }) => {
  let finish!: () => void
  if (stage === 'render')
    api.render.mockReturnValueOnce(
      new Promise((resolve) => {
        finish = () => resolve(canvas())
      }),
    )
  else
    api.render.mockResolvedValueOnce({
      toBlob: (done: BlobCallback) => {
        finish = () => done(blob)
      },
    })
  const page = await render()
  await page.get('#copyBtn').trigger('click')
  await flushPromises()
  expect(api.render).toHaveBeenCalledOnce()
  expect(write).not.toHaveBeenCalled()
  await invalidate(change)
  finish()
  await flushPromises()
  expect(write).not.toHaveBeenCalled()
  expect(URL.createObjectURL).not.toHaveBeenCalled()
  expect(HTMLAnchorElement.prototype.click).not.toHaveBeenCalled()
  expect(useFeedbackStore(pinia).notify).not.toHaveBeenCalled()
})

it('copies normally once, prevents duplicate clicks and emits only one success notification', async () => {
  let finish!: () => void
  write.mockReturnValueOnce(
    new Promise<void>((resolve) => {
      finish = resolve
    }),
  )
  const page = await render()
  expect(page.findAll('.player-rank').length).toBeGreaterThan(0)
  await page.get('#copyBtn').trigger('click')
  await flushPromises()
  await page.get('#copyBtn').trigger('click')
  expect(api.render).toHaveBeenCalledOnce()
  expect(write).toHaveBeenCalledOnce()
  expect(useFeedbackStore(pinia).notify).not.toHaveBeenCalled()
  finish()
  await flushPromises()
  expect(HTMLAnchorElement.prototype.click).not.toHaveBeenCalled()
  expect(useFeedbackStore(pinia).notify).toHaveBeenCalledExactlyOnceWith(
    '截图已复制到剪贴板',
    'success',
  )
  expect(page.get('#copyBtn').attributes('disabled')).toBeUndefined()
})

it('waits for PNG encoding before normal delivery', async () => {
  let finish!: () => void
  api.render.mockResolvedValueOnce({
    toBlob: (done: BlobCallback) => {
      finish = () => done(blob)
    },
  })
  const page = await render()
  await page.get('#copyBtn').trigger('click')
  await flushPromises()
  expect(write).not.toHaveBeenCalled()
  finish()
  await flushPromises()
  expect(write).toHaveBeenCalledOnce()
  expect(useFeedbackStore(pinia).notify).toHaveBeenCalledTimes(1)
})

it.each(['rejected', 'unsupported'])(
  'downloads exactly once when clipboard is $0 and context remains valid',
  async (reason) => {
    if (reason === 'rejected') write.mockRejectedValueOnce(new Error('denied'))
    else vi.stubGlobal('ClipboardItem', undefined)
    const page = await render()
    await page.get('#copyBtn').trigger('click')
    await flushPromises()
    expect(write).toHaveBeenCalledTimes(reason === 'rejected' ? 1 : 0)
    expect(URL.createObjectURL).toHaveBeenCalledExactlyOnceWith(blob)
    expect(HTMLAnchorElement.prototype.click).toHaveBeenCalledOnce()
    expect(URL.revokeObjectURL).toHaveBeenCalledExactlyOnceWith('blob:synthetic-settlement')
    expect(useFeedbackStore(pinia).notify).toHaveBeenCalledTimes(1)
    expect(useFeedbackStore(pinia).toastTone).toBe('success')
  },
)

it.each(['leave', 'account', 'target', 'unmount'] as const)(
  'rechecks before fallback download after $0',
  async (change) => {
    let reject!: (error: Error) => void
    write.mockReturnValueOnce(
      new Promise((_, fail) => {
        reject = fail
      }),
    )
    const page = await render()
    await page.get('#copyBtn').trigger('click')
    await flushPromises()
    expect(write).toHaveBeenCalledOnce() // Started while valid; a web clipboard write cannot be retracted.
    await invalidate(change)
    reject(new Error('denied'))
    await flushPromises()
    expect(URL.createObjectURL).not.toHaveBeenCalled()
    expect(HTMLAnchorElement.prototype.click).not.toHaveBeenCalled()
    expect(useFeedbackStore(pinia).notify).not.toHaveBeenCalled()
  },
)

it('does not show a stale success when an already-started clipboard write resolves after leaving', async () => {
  let finish!: () => void
  write.mockReturnValueOnce(
    new Promise<void>((resolve) => {
      finish = resolve
    }),
  )
  const page = await render()
  await page.get('#copyBtn').trigger('click')
  await flushPromises()
  await invalidate('leave')
  finish()
  await flushPromises()
  expect(write).toHaveBeenCalledOnce()
  expect(HTMLAnchorElement.prototype.click).not.toHaveBeenCalled()
  expect(useFeedbackStore(pinia).notify).not.toHaveBeenCalled()
})

it('reports a genuine render failure once without delivering', async () => {
  api.render.mockRejectedValueOnce(new Error('render failed'))
  const page = await render()
  await page.get('#copyBtn').trigger('click')
  await flushPromises()
  expect(write).not.toHaveBeenCalled()
  expect(HTMLAnchorElement.prototype.click).not.toHaveBeenCalled()
  expect(useFeedbackStore(pinia).notify).toHaveBeenCalledTimes(1)
  expect(useFeedbackStore(pinia).toastTone).toBe('error')
  expect(page.get('#copyBtn').attributes('disabled')).toBeUndefined()
})

it('keeps browser demo screenshots functional with an explicit mock account context', async () => {
  disposePinia(pinia)
  api.desktop = false
  api.load.mockResolvedValue({ source: 'mock', snapshot: testSettlement() })
  pinia = createPinia()
  useConnectionStore(pinia).connectionPhase = 'connected'
  useHistoryStore(pinia).openLiveSettlement(TEST_SETTLEMENT_ID, TEST_SETTLEMENT_ACCOUNT)
  useRulesStore(pinia).setCurrentRule('tail')
  vi.spyOn(useFeedbackStore(pinia), 'notify')
  useUiStore(pinia).setActiveTab('match-detail')
  const page = await render()
  await page.get('#copyBtn').trigger('click')
  await flushPromises()
  expect(api.load).toHaveBeenCalledOnce()
  expect(write).toHaveBeenCalledOnce()
  expect(useFeedbackStore(pinia).notify).toHaveBeenCalledExactlyOnceWith(
    '截图已复制到剪贴板',
    'success',
  )
})

it('does not let an old capture clear the busy state or deliver over a new capture', async () => {
  let finishOld!: (value: unknown) => void
  let finishNew!: (value: unknown) => void
  api.render
    .mockReturnValueOnce(
      new Promise((resolve) => {
        finishOld = resolve
      }),
    )
    .mockReturnValueOnce(
      new Promise((resolve) => {
        finishNew = resolve
      }),
    )
  const page = await render()
  await page.get('#copyBtn').trigger('click')
  await flushPromises()
  await invalidate('round-trip')
  await page.get('#copyBtn').trigger('click')
  await flushPromises()
  expect(api.render).toHaveBeenCalledTimes(2)
  finishOld(canvas())
  await flushPromises()
  expect(write).not.toHaveBeenCalled()
  expect(page.get('#copyBtn').attributes('disabled')).toBeDefined()
  expect(useFeedbackStore(pinia).notify).not.toHaveBeenCalled()
  finishNew(canvas())
  await flushPromises()
  expect(write).toHaveBeenCalledOnce()
  expect(useFeedbackStore(pinia).notify).toHaveBeenCalledTimes(1)
})

it.each(['big', 'small'] as const)(
  'captures the %s size result including zero/all senders without ranks',
  async (outcome) => {
    api.load.mockResolvedValue({ source: 'real', snapshot: testDamageSize(outcome) })
    const page = await render()
    const area = page.get('#screenshot-area')
    expect(area.get('[data-size-senders]').text()).toContain(
      outcome === 'big' ? '本局 2 人发红包' : '本局无人需要发红包',
    )
    expect(area.findAll('[data-player-id]')).toHaveLength(2)
    expect(area.findAll('[data-player-id] img')).toHaveLength(2)
    expect(area.findAll('[data-player-relation]').map((tag) => tag.text())).toEqual(
      expect.arrayContaining(['我', '友']),
    )
    expect(area.find('.player-rank').exists()).toBe(false)
    expect(area.get('[data-size-senders]').text()).toContain('发红包名单')
    expect(area.get('[data-size-senders]').text()).not.toContain('最后')
    expect(area.text()).not.toContain('#1')
    expect(area.text()).toContain('18,446,744,073,709,551,615')
    expect(page.get('#btn-layout-group').attributes('aria-pressed')).toBe('true')
    expect(page.get('#btn-layout-group').text()).toContain('分组排行')
    expect(page.get('#btn-layout-global').text()).toContain('全局排行')
    expect(page.get('#layout-group').findAll('[data-team-section]')).toHaveLength(2)
    expect(page.get('#layout-group').text()).not.toMatch(/胜利|失败/)
    const senders = area.get('[data-size-senders]').text()
    const ids = area
      .findAll('[data-player-id]')
      .map((row) => row.attributes('data-player-id'))
      .sort()
    await page.get('#btn-layout-global').trigger('click')
    expect(page.get('#btn-layout-global').attributes('aria-pressed')).toBe('true')
    expect(page.find('#layout-group').exists()).toBe(false)
    expect(
      page
        .get('#layout-global')
        .findAll('[data-player-id]')
        .map((row) => row.attributes('data-player-id'))
        .sort(),
    ).toEqual(ids)
    expect(area.get('[data-size-senders]').text()).toBe(senders)
    expect(area.find('.player-rank').exists()).toBe(false)
    await page.get('#copyBtn').trigger('click')
    await flushPromises()
    expect(write).toHaveBeenCalledOnce()
  },
)
it('keeps nontraditional teams separate without inventing red or blue sides', async () => {
  const snapshot = testDamageSize('big')
  snapshot.players.forEach((player, index) => {
    player.teamId = index + 1
  })
  api.load.mockResolvedValue({ source: 'real', snapshot })
  const page = await render()
  expect(
    page
      .get('#layout-group')
      .findAll('[data-team-section]')
      .map((section) => section.attributes('data-team-section')),
  ).toEqual(['队伍 1', '队伍 2'])
  await page.get('#btn-layout-global').trigger('click')
  expect(page.get('#layout-global').findAll('[data-player-id]')).toHaveLength(2)
  expect(
    page.get('#layout-global').find('.border-l-info-bright, .border-l-danger-bright').exists(),
  ).toBe(false)
})

it.each(['leave', 'account', 'unmount', 'layout'] as const)(
  'cancels a size result screenshot after %s',
  async (change) => {
    api.load.mockResolvedValue({ source: 'real', snapshot: testDamageSize('small') })
    let finish!: (value: unknown) => void
    api.render.mockReturnValueOnce(
      new Promise((resolve) => {
        finish = resolve
      }),
    )
    const page = await render()
    await page.get('#copyBtn').trigger('click')
    await flushPromises()
    await invalidate(change)
    finish(canvas())
    await flushPromises()
    expect(write).not.toHaveBeenCalled()
    expect(HTMLAnchorElement.prototype.click).not.toHaveBeenCalled()
  },
)
