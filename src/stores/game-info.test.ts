import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { createPinia, disposePinia, setActivePinia } from 'pinia'
import { useGameInfoStore } from './game-info'
import { useConnectionStore } from './connection'
import { connectedStatus } from '../../tests/fixtures/home-contract'
const api = vi.hoisted(() => ({ load: vi.fn() }))
vi.mock('@tauri-apps/api/core', () => ({ isTauri: () => true }))
vi.mock('@/services/game-info.service', () => ({ getGameMetadata: api.load }))
const request = { accountKey: 'account-a', queueId: 2400, mapId: 12 }
const result = { queueId: 2400, mapId: 12, queueName: '海克斯大乱斗', mapName: '嚎哭深渊' }
let pinia: ReturnType<typeof createPinia>
beforeEach(() => {
  pinia = createPinia()
  setActivePinia(pinia)
  api.load.mockReset()
  useConnectionStore().setLcuStatus(connectedStatus())
})
afterEach(() => disposePinia(pinia))
describe('optional metadata lifecycle', () => {
  it('deduplicates requests and isolates accounts', async () => {
    api.load.mockResolvedValue(result)
    const store = useGameInfoStore()
    await Promise.all([store.ensure(request), store.ensure(request)])
    await store.ensure(request)
    expect(api.load).toHaveBeenCalledTimes(1)
    await store.ensure({ ...request, accountKey: 'account-b' })
    expect(api.load).toHaveBeenCalledTimes(2)
  })
  it('discards late replies after disconnect and retries on reconnect', async () => {
    let finish!: (value: typeof result) => void
    api.load.mockReturnValueOnce(
      new Promise((resolve) => {
        finish = resolve
      }),
    )
    const store = useGameInfoStore()
    const pending = store.ensure(request)
    useConnectionStore().setLcuStatus({ ...connectedStatus(), status: 'disconnected', revision: 2 })
    finish(result)
    await pending
    expect(store.records).toEqual({})
    api.load.mockResolvedValue(result)
    useConnectionStore().setLcuStatus({ ...connectedStatus(), revision: 3 })
    await store.ensure(request)
    expect(store.records[store.key(request)]).toEqual(result)
  })
  it('degrades failed name queries without repeated requests', async () => {
    api.load.mockRejectedValue(new Error('unavailable'))
    const store = useGameInfoStore()
    await expect(store.ensure(request)).resolves.toBeUndefined()
    await store.ensure(request)
    expect(api.load).toHaveBeenCalledTimes(1)
    expect(store.records[store.key(request)]).toBeNull()
  })
})
