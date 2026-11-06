import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, disposePinia, setActivePinia } from 'pinia'
import { connectedStatus, homeFlow, testHomeSnapshot } from '../../tests/fixtures/home-contract'
const api = vi.hoisted(() => ({ load: vi.fn() }))
vi.mock('@tauri-apps/api/core', () => ({ isTauri: () => true }))
vi.mock('@/services/home.service', () => ({ getHomeSnapshot: api.load }))
import { useHomeStore } from './home'
import { useConnectionStore } from './connection'
let pinia: ReturnType<typeof createPinia>
beforeEach(() => {
  api.load.mockReset()
  pinia = createPinia()
  setActivePinia(pinia)
  useConnectionStore().setLcuStatus(connectedStatus())
})
afterEach(() => disposePinia(pinia))
describe('real home state', () => {
  it('deduplicates pending reads and clears identity on disconnect before a late result', async () => {
    const home = useHomeStore()
    expect(home.homeProfile).toBeNull()
    let resolve!: (value: unknown) => void
    api.load.mockReturnValue(
      new Promise((done) => {
        resolve = done
      }),
    )
    const first = home.loadHome()
    const duplicate = home.loadHome()
    expect(api.load).toHaveBeenCalledOnce()
    useConnectionStore().setLcuStatus(connectedStatus({ revision: 2, status: 'disconnected' }))
    resolve({ source: 'real', snapshot: testHomeSnapshot() })
    await Promise.all([first, duplicate])
    expect(home.snapshot).toBeNull()
    expect(home.isLoading).toBe(false)
    await home.loadHome()
    expect(api.load).toHaveBeenCalledOnce()
  })
  it('never accepts mock profiles or retains an old account after failure', async () => {
    const home = useHomeStore()
    api.load.mockResolvedValueOnce({ source: 'real', snapshot: testHomeSnapshot() })
    await home.loadHome()
    expect(home.homeView.summonerName).toBe('真实玩家#CN1')
    api.load.mockResolvedValueOnce({ source: 'mock', profile: {} })
    await home.loadHome()
    expect(home.homeView.summonerName).toBeNull()
    expect(home.errorCode).toBe('lcu.invalid_response')
  })
  it('rejects simulated, unavailable, erroneous and pre-disconnect gameflow snapshots', () => {
    const home = useHomeStore()
    const connection = useConnectionStore()
    connection.setGameflowSnapshot(homeFlow())
    expect(home.homeView.gameMode).toBe('hex')
    connection.setGameflowSnapshot(homeFlow({ revision: 2, source: 'mock', simulated: true }))
    expect(home.homeView.roomPhase).toBeNull()
    connection.setGameflowSnapshot(homeFlow({ revision: 3, code: 'read_failed' }))
    expect(home.homeView.roomPhase).toBeNull()
    connection.setGameflowSnapshot(homeFlow({ revision: 4 }))
    connection.setLcuStatus(connectedStatus({ revision: 2, status: 'disconnected' }))
    connection.setLcuStatus(connectedStatus({ revision: 3 }))
    expect(home.homeView.roomPhase).toBeNull()
    connection.setGameflowSnapshot(homeFlow({ revision: 5, phase: 'none', session: null }))
    expect(home.homeView.roomPhase).toBe('none')
    expect(home.homeView.gameMode).toBeNull()
  })
  it('keeps a newer account when a cancelled read finishes late', async () => {
    const home = useHomeStore()
    let resolve!: (value: unknown) => void
    api.load.mockReturnValueOnce(
      new Promise((done) => {
        resolve = done
      }),
    )
    const old = home.loadHome()
    home.clearRealHome()
    api.load.mockResolvedValueOnce({
      source: 'real',
      snapshot: testHomeSnapshot({ accountKey: 'account-2', displayName: '新账号' }),
    })
    await home.loadHome()
    resolve({ source: 'real', snapshot: testHomeSnapshot() })
    await old
    expect(home.snapshot?.accountKey).toBe('account-2')
    expect(home.homeView.summonerName).toBe('新账号')
  })
})
