import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getGameMetadata } from './game-info.service'
const ipc = vi.hoisted(() => ({ desktop: true, invoke: vi.fn() }))
vi.mock('@tauri-apps/api/core', () => ({ isTauri: () => ipc.desktop, invoke: ipc.invoke }))
const request = { accountKey: 'account', queueId: 2400, mapId: 12 }
const result = { queueId: 2400, mapId: 12, queueName: '海克斯大乱斗', mapName: '嚎哭深渊' }
beforeEach(() => {
  ipc.desktop = true
  ipc.invoke.mockReset()
})
describe('metadata IPC boundary', () => {
  it('validates native replies and never invokes IPC in browser demos', async () => {
    ipc.invoke.mockResolvedValue(result)
    expect(await getGameMetadata(request)).toEqual(result)
    expect(ipc.invoke).toHaveBeenCalledWith('lcu_get_game_metadata', request)
    ipc.desktop = false
    expect(await getGameMetadata(request)).toBeNull()
    expect(ipc.invoke).toHaveBeenCalledTimes(1)
  })
  it('rejects stale IDs and malformed payloads', async () => {
    for (const value of [
      { ...result, mapId: 11 },
      { ...result, queueId: 450 },
      { ...result, mapName: 42 },
      { ...result, mapName: 'x'.repeat(161) },
    ]) {
      ipc.invoke.mockResolvedValue(value)
      await expect(getGameMetadata(request)).rejects.toHaveProperty('code')
    }
  })
  it('normalizes business and unknown errors', async () => {
    ipc.invoke.mockRejectedValue({ code: 'account_changed', message: 'private' })
    await expect(getGameMetadata(request)).rejects.toHaveProperty('code', 'lcu.account_changed')
    ipc.invoke.mockRejectedValue(new Error('private host error'))
    await expect(getGameMetadata(request)).rejects.toHaveProperty('code', 'lcu.metadata_failed')
  })
})
