// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, disposePinia } from 'pinia'
import { createAppI18n } from '@/i18n'
import { testUpdateSnapshot } from '../../../tests/fixtures/update-contract'
import type { UpdateSnapshot } from '@/types/settings'
const api = vi.hoisted(() => ({
  getUpdateState: vi.fn(),
  checkUpdate: vi.fn(),
  downloadUpdate: vi.fn(),
  cancelUpdate: vi.fn(),
  installUpdate: vi.fn(),
  openReleasePage: vi.fn(),
  setAutoAccept: vi.fn(),
}))
vi.mock('@tauri-apps/api/core', () => ({ isTauri: () => true }))
vi.mock('@/adapters/tauri.adapter', () => ({ tauriSettingsAdapter: api }))
import { useSettingsStore } from '@/stores/settings'
import { useFeedbackStore } from '@/stores/feedback'
import SettingsPage from './SettingsPage.vue'
let pinia: ReturnType<typeof createPinia>
let wrapper: ReturnType<typeof mount>
const available = () =>
  testUpdateSnapshot({
    revision: 2,
    phase: 'available',
    latest: '0.2.0',
    notes: '新版改进说明',
    canDownload: true,
  })
const ready = () =>
  testUpdateSnapshot({
    revision: 5,
    phase: 'ready',
    latest: '0.2.0',
    downloaded: 100,
    total: 100,
    canInstall: true,
  })
beforeEach(() => {
  localStorage.clear()
  vi.useFakeTimers()
  for (const method of Object.values(api)) method.mockReset()
  api.getUpdateState.mockResolvedValue(testUpdateSnapshot())
  api.setAutoAccept.mockImplementation(async (enabled: boolean) => enabled)
  api.cancelUpdate.mockResolvedValue(undefined)
  api.openReleasePage.mockResolvedValue(undefined)
  pinia = createPinia()
  wrapper = mount(SettingsPage, {
    attachTo: document.body,
    global: { plugins: [pinia, createAppI18n()] },
  })
})
afterEach(() => {
  wrapper.unmount()
  disposePinia(pinia)
  vi.clearAllTimers()
  vi.useRealTimers()
  document.body.innerHTML = ''
})
async function checkAvailable() {
  await flushPromises()
  api.checkUpdate.mockResolvedValueOnce(available())
  await wrapper.get('[data-action="check-update"]').trigger('click')
  await flushPromises()
}
describe('native updater settings', () => {
  it('downloads and verifies before allowing an explicitly confirmed installation', async () => {
    await checkAvailable()
    expect(wrapper.text()).toContain('发现新版本 v0.2.0')
    let finish!: (value: UpdateSnapshot) => void
    api.downloadUpdate.mockImplementationOnce((progress: (snapshot: UpdateSnapshot) => void) => {
      progress(
        testUpdateSnapshot({
          revision: 3,
          phase: 'downloading',
          latest: '0.2.0',
          downloaded: 50,
          total: 100,
        }),
      )
      return new Promise<UpdateSnapshot>((resolve) => {
        finish = resolve
      })
    })
    await wrapper.get('[data-action="download-update"]').trigger('click')
    await flushPromises()
    expect(wrapper.get('progress').attributes('value')).toBe('50')
    expect(wrapper.find('[data-action="install-update"]').exists()).toBe(false)
    finish(ready())
    await flushPromises()
    expect(wrapper.text()).toContain('签名验证通过')
    expect(api.installUpdate).not.toHaveBeenCalled()
    await wrapper.get('[data-action="install-update"]').trigger('click')
    await flushPromises()
    expect(document.body.textContent).toContain('助手将退出')
    expect(api.installUpdate).not.toHaveBeenCalled()
    api.installUpdate.mockResolvedValueOnce(
      testUpdateSnapshot({ revision: 6, phase: 'installing', latest: '0.2.0' }),
    )
    document.querySelector<HTMLButtonElement>('[data-action="confirm-install"]')!.click()
    await flushPromises()
    expect(api.installUpdate).toHaveBeenCalledExactlyOnceWith()
    expect(api.openReleasePage).not.toHaveBeenCalled()
  })
  it('cancels downloads without installing and keeps the retry action', async () => {
    await checkAvailable()
    let finish!: (value: UpdateSnapshot) => void
    api.downloadUpdate.mockImplementationOnce((progress: (snapshot: UpdateSnapshot) => void) => {
      progress(
        testUpdateSnapshot({ revision: 3, phase: 'downloading', latest: '0.2.0', downloaded: 50 }),
      )
      return new Promise<UpdateSnapshot>((resolve) => {
        finish = resolve
      })
    })
    await wrapper.get('[data-action="download-update"]').trigger('click')
    await flushPromises()
    expect(wrapper.get('progress').attributes('value')).toBeUndefined()
    await wrapper.get('[data-action="cancel-update"]').trigger('click')
    await flushPromises()
    expect(api.cancelUpdate).toHaveBeenCalledOnce()
    finish({ ...available(), revision: 4 })
    await flushPromises()
    expect(wrapper.find('[data-action="download-update"]').exists()).toBe(true)
    expect(api.installUpdate).not.toHaveBeenCalled()
  })
  it('never allows installation after a signature failure and recovers after retry', async () => {
    await checkAvailable()
    api.downloadUpdate.mockResolvedValueOnce(
      testUpdateSnapshot({
        ...available(),
        revision: 4,
        phase: 'error',
        errorCode: 'update.signature_failed',
      }),
    )
    await wrapper.get('[data-action="download-update"]').trigger('click')
    await flushPromises()
    expect(wrapper.get('[role="alert"]').text()).toContain('签名验证失败')
    expect(wrapper.find('[data-action="install-update"]').exists()).toBe(false)
    api.downloadUpdate.mockResolvedValueOnce(ready())
    await wrapper.get('[data-action="download-update"]').trigger('click')
    await flushPromises()
    expect(wrapper.find('[role="alert"]').exists()).toBe(false)
    expect(wrapper.find('[data-action="install-update"]').exists()).toBe(true)
  })
  it('distinguishes unavailable manifests, latest versions, and network failures', async () => {
    await flushPromises()
    let revision = 0
    for (const [phase, errorCode, text] of [
      ['error', 'update.not_published', '更新清单尚未发布'],
      ['up_to_date', null, '当前已是最新正式版本'],
      ['error', 'update.check_failed', '检查更新失败'],
      ['error', 'update.game_active', '请结束后再安装更新'],
    ] as const) {
      api.checkUpdate.mockResolvedValueOnce(
        testUpdateSnapshot({ revision: ++revision, phase, errorCode }),
      )
      await wrapper.get('[data-action="check-update"]').trigger('click')
      await flushPromises()
      expect(wrapper.text()).toContain(text)
      expect(api.installUpdate).not.toHaveBeenCalled()
    }
  })
  it('recovers native progress after remount and ignores stale replies', async () => {
    await flushPromises()
    wrapper.unmount()
    api.getUpdateState
      .mockResolvedValueOnce(
        testUpdateSnapshot({
          revision: 8,
          phase: 'downloading',
          latest: '0.2.0',
          downloaded: 50,
          total: 100,
        }),
      )
      .mockResolvedValueOnce({ ...ready(), revision: 9 })
    wrapper = mount(SettingsPage, { global: { plugins: [pinia, createAppI18n()] } })
    await flushPromises()
    expect(wrapper.get('progress').attributes('value')).toBe('50')
    vi.advanceTimersByTime(500)
    await flushPromises()
    expect(wrapper.find('[data-action="install-update"]').exists()).toBe(true)
    api.checkUpdate.mockResolvedValueOnce(testUpdateSnapshot({ revision: 1 }))
    await wrapper.get('[data-action="check-update"]').trigger('click')
    await flushPromises()
    expect(wrapper.find('[data-action="install-update"]').exists()).toBe(true)
  })
  it('applies native changes before committing the preference and keeps the old value on failure', async () => {
    await flushPromises()
    const toggle = wrapper.get('[aria-label="自动接受对局"]')
    expect(toggle.attributes('aria-checked')).toBe('false')
    await toggle.trigger('click')
    await flushPromises()
    expect(api.setAutoAccept).toHaveBeenLastCalledWith(true)
    expect(toggle.attributes('aria-checked')).toBe('true')
    expect(JSON.parse(localStorage.getItem('aram.settings.v1')!).autoAccept).toBe(true)
    api.setAutoAccept.mockRejectedValueOnce(new Error('failed'))
    await toggle.trigger('click')
    await flushPromises()
    expect(api.setAutoAccept).toHaveBeenLastCalledWith(false)
    expect(useSettingsStore(pinia).settings.autoAccept).toBe(true)
    expect(toggle.attributes('aria-checked')).toBe('true')
    expect(useFeedbackStore(pinia).toastTone).toBe('error')
    expect(useFeedbackStore(pinia).toastMessage).toBeTruthy()
  })
})
