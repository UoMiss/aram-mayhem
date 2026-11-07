// @vitest-environment happy-dom
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia, disposePinia } from 'pinia'
const api = vi.hoisted(() => ({ setAutoAccept: vi.fn() }))
vi.mock('@tauri-apps/api/core', () => ({ isTauri: () => true }))
vi.mock('@/adapters/tauri.adapter', () => ({ tauriSettingsAdapter: api }))
import { useSettingsStore } from './settings'
let pinia: ReturnType<typeof createPinia>
beforeEach(() => {
  localStorage.clear()
  api.setAutoAccept.mockReset().mockImplementation(async (enabled: boolean) => enabled)
  pinia = createPinia()
  setActivePinia(pinia)
})
afterEach(() => disposePinia(pinia))
describe('native auto-accept preference', () => {
  it('removes legacy preferences while keeping automatic acceptance', () => {
    localStorage.setItem(
      'aram.settings.v1',
      JSON.stringify({
        autoStart: true,
        autoRetry: false,
        soundEffects: true,
        autoAccept: true,
      }),
    )
    const store = useSettingsStore()
    expect(store.settings).toEqual({ autoAccept: true })
    expect(JSON.parse(localStorage.getItem('aram.settings.v1')!)).toEqual({ autoAccept: true })
  })
  it('defaults off and initializes the native state once for concurrent callers', async () => {
    const store = useSettingsStore()
    expect(store.settings.autoAccept).toBe(false)
    expect(store.autoAcceptReady).toBe(false)
    await Promise.all([store.initializeAutoAccept(), store.initializeAutoAccept()])
    expect(api.setAutoAccept).toHaveBeenCalledExactlyOnceWith(false)
    expect(store.autoAcceptReady).toBe(true)
  })
  it('restores the saved choice before marking the control ready and persists changes', async () => {
    localStorage.setItem('aram.settings.v1', JSON.stringify({ autoAccept: true }))
    const store = useSettingsStore()
    await store.initializeAutoAccept()
    expect(api.setAutoAccept).toHaveBeenCalledExactlyOnceWith(true)
    store.setSetting('autoAccept', false)
    expect(JSON.parse(localStorage.getItem('aram.settings.v1')!).autoAccept).toBe(false)
  })
  it('keeps a failed restore disabled and allows a retry without losing the preference', async () => {
    localStorage.setItem('aram.settings.v1', JSON.stringify({ autoAccept: true }))
    api.setAutoAccept.mockRejectedValueOnce(new Error('IPC unavailable'))
    const store = useSettingsStore()
    await expect(store.initializeAutoAccept()).rejects.toThrow('IPC unavailable')
    expect(store.autoAcceptReady).toBe(false)
    expect(store.settings.autoAccept).toBe(true)
    await store.initializeAutoAccept()
    expect(store.autoAcceptReady).toBe(true)
    expect(api.setAutoAccept).toHaveBeenLastCalledWith(true)
  })
})
