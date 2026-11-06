import { beforeEach, describe, expect, it, vi } from 'vitest'
import { testHistorySnapshot } from '../../tests/fixtures/history-contract'
const adapter = vi.hoisted(() => ({ desktop: false, load: vi.fn() }))
vi.mock('@tauri-apps/api/core', () => ({ isTauri: () => adapter.desktop }))
vi.mock('@/adapters/tauri.adapter', () => ({
  tauriHistoryAdapter: { getMatchHistory: adapter.load },
}))
import { getMatchHistory } from './history.service'
beforeEach(() => {
  adapter.desktop = false
  adapter.load.mockReset()
})
describe('history service', () => {
  it('keeps browser data explicitly simulated without native IPC', async () => {
    const result = await getMatchHistory()
    expect(result.source).toBe('mock')
    expect(adapter.load).not.toHaveBeenCalled()
  })
  it('uses the native adapter in desktop mode and preserves failures', async () => {
    adapter.desktop = true
    adapter.load.mockResolvedValue(testHistorySnapshot())
    expect((await getMatchHistory()).source).toBe('real')
    adapter.load.mockRejectedValue(new Error('offline'))
    await expect(getMatchHistory()).rejects.toThrow('offline')
  })
})
