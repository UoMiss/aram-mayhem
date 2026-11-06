import { beforeEach, describe, expect, it, vi } from 'vitest'
import { testHomeSnapshot } from '../../tests/fixtures/home-contract'
const adapter = vi.hoisted(() => ({ desktop: false, load: vi.fn() }))
vi.mock('@tauri-apps/api/core', () => ({ isTauri: () => adapter.desktop }))
vi.mock('@/adapters/tauri.adapter', () => ({ tauriHomeAdapter: { getHomeSnapshot: adapter.load } }))
import { getHomeSnapshot } from './home.service'
beforeEach(() => {
  adapter.desktop = false
  adapter.load.mockReset()
})
describe('home service', () => {
  it('returns explicit browser demo data without IPC', async () => {
    expect((await getHomeSnapshot()).source).toBe('mock')
    expect(adapter.load).not.toHaveBeenCalled()
  })
  it('uses native profile data and preserves errors on desktop', async () => {
    adapter.desktop = true
    adapter.load.mockResolvedValueOnce(testHomeSnapshot())
    expect((await getHomeSnapshot()).source).toBe('real')
    adapter.load.mockRejectedValueOnce(new Error('offline'))
    await expect(getHomeSnapshot()).rejects.toThrow('offline')
  })
})
