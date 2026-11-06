// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, disposePinia } from 'pinia'
import { createAppI18n } from '@/i18n'
import { useConnectionStore } from '@/stores/connection'
import { useHistoryStore } from '@/stores/history'
import { useUiStore } from '@/stores/ui'
import { LcuServiceError } from '@/services/desktop-error'
import { testHistorySnapshot, TEST_HISTORY_MATCH } from '../../../tests/fixtures/history-contract'

const api = vi.hoisted(() => ({ load: vi.fn() }))
vi.mock('@tauri-apps/api/core', () => ({ isTauri: () => true }))
vi.mock('@/services/history.service', () => ({ getMatchHistory: api.load }))
import HistoryPage from './HistoryPage.vue'
let pinia: ReturnType<typeof createPinia>
let wrapper: ReturnType<typeof mount> | undefined
function render() {
  wrapper = mount(HistoryPage, { global: { plugins: [pinia, createAppI18n()] } })
  return wrapper
}
beforeEach(() => {
  api.load.mockReset()
  pinia = createPinia()
  useUiStore(pinia).setActiveTab('history')
  useConnectionStore(pinia).setLcuStatus({
    status: 'connected',
    source: 'real',
    simulated: false,
    code: null,
    message: null,
    revision: 1,
    updatedAt: 1,
    monitoring: true,
  })
})
afterEach(() => {
  wrapper?.unmount()
  wrapper = undefined
  disposePinia(pinia)
})

describe('history API page', () => {
  it('loads and filters records, then opens the selected settlement directly', async () => {
    api.load.mockResolvedValue({ source: 'real', snapshot: testHistorySnapshot() })
    const page = render()
    await flushPromises()
    expect(api.load).toHaveBeenCalledOnce()
    expect(page.findAll('[data-match-id]')).toHaveLength(1)
    expect(page.text()).toContain('12/4/18')
    expect(page.text()).not.toContain('演示数据')
    expect(page.text()).not.toContain('当前账号')
    await page.get('[data-filter="custom"]').trigger('click')
    expect(page.text()).toContain('当前筛选下没有对局')
    await page.get('[data-filter="all"]').trigger('click')
    await page.get('[data-match-id]').trigger('click')
    expect(useUiStore(pinia).activeTab).toBe('match-detail')
    expect(useHistoryStore(pinia).selectedMatchId).toBe(TEST_HISTORY_MATCH.id)
    expect(page.text()).not.toContain('对局信息')
  })

  it('distinguishes an empty account from an API error, then retries', async () => {
    api.load.mockRejectedValueOnce(new LcuServiceError('lcu.timeout', 'token=secret'))
    const page = render()
    await flushPromises()
    expect(page.get('[role="alert"]').text()).toContain('查询超时')
    expect(page.text()).not.toContain('token=secret')
    api.load.mockResolvedValueOnce({ source: 'real', snapshot: testHistorySnapshot([]) })
    await page.get('[role="alert"] button').trigger('click')
    await flushPromises()
    expect(page.text()).toContain('暂无最近对局记录')
    expect(page.find('[role="alert"]').exists()).toBe(false)
  })

  it('does not query hidden pages and cancels pending results when leaving', async () => {
    useUiStore(pinia).setActiveTab('home')
    const page = render()
    await flushPromises()
    expect(api.load).not.toHaveBeenCalled()
    let resolve!: (value: unknown) => void
    api.load.mockReturnValue(
      new Promise((done) => {
        resolve = done
      }),
    )
    useUiStore(pinia).setActiveTab('history')
    await flushPromises()
    expect(page.text()).toContain('正在读取战绩')
    useUiStore(pinia).setActiveTab('home')
    resolve({ source: 'real', snapshot: testHistorySnapshot() })
    await flushPromises()
    expect(useHistoryStore(pinia).matchHistory).toEqual([])
  })
})
