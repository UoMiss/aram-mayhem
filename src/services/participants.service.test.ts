import { beforeEach, describe, expect, it, vi } from 'vitest'
import { testParticipants } from '../../tests/fixtures/participants-contract'
const adapter = vi.hoisted(() => ({ desktop: false, load: vi.fn() }))
vi.mock('@tauri-apps/api/core', () => ({ isTauri: () => adapter.desktop }))
vi.mock('@/adapters/tauri.adapter', () => ({
  tauriParticipantsAdapter: { getCustomParticipants: adapter.load },
}))
import { getCustomParticipants } from './participants.service'
beforeEach(() => {
  adapter.desktop = false
  adapter.load.mockReset()
})
describe('custom participants service', () => {
  it('keeps browser demo players explicit without native IPC', async () => {
    expect((await getCustomParticipants()).source).toBe('mock')
    expect(adapter.load).not.toHaveBeenCalled()
  })
  it('uses native roster and never replaces failures with mock players', async () => {
    adapter.desktop = true
    adapter.load.mockResolvedValueOnce(testParticipants())
    expect((await getCustomParticipants()).source).toBe('real')
    adapter.load.mockRejectedValueOnce(new Error('offline'))
    await expect(getCustomParticipants()).rejects.toThrow('offline')
  })
})
