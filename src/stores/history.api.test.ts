import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, disposePinia } from 'pinia'
import { testHistorySnapshot, TEST_HISTORY_MATCH } from '../../tests/fixtures/history-contract'
import type { HistoryResult } from '@/services/history.service'
import { LcuServiceError } from '@/services/desktop-error'

const api = vi.hoisted(() => ({ load: vi.fn() }))
vi.mock('@tauri-apps/api/core', () => ({ isTauri: () => true }))
vi.mock('@/services/history.service', () => ({ getMatchHistory: api.load }))
import { useHistoryStore } from './history'
import { useUiStore } from './ui'
let pinia: ReturnType<typeof createPinia>
beforeEach(() => {
  pinia = createPinia()
  api.load.mockReset()
})
afterEach(() => disposePinia(pinia))

describe('real history state', () => {
  it('starts without demo records and coalesces concurrent refreshes', async () => {
    const history = useHistoryStore(pinia)
    expect(history.matchHistory).toEqual([])
    let resolve!: (value: HistoryResult) => void
    api.load.mockReturnValue(
      new Promise<HistoryResult>((done) => {
        resolve = done
      }),
    )
    const first = history.loadHistory()
    const second = history.loadHistory()
    expect(api.load).toHaveBeenCalledOnce()
    expect(history.isLoading).toBe(true)
    resolve({ source: 'real', snapshot: testHistorySnapshot() })
    await Promise.all([first, second])
    expect(history.matchHistory[0]?.id).toBe('18446744073709551615')
    expect(history.matchHistory[0]?.mode).toBe('hex')
    expect(history.isLoading).toBe(false)
  })

  it('opens the selected real settlement even after an automatic settlement', async () => {
    api.load.mockResolvedValue({ source: 'real', snapshot: testHistorySnapshot() })
    const history = useHistoryStore(pinia)
    const ui = useUiStore(pinia)
    ui.setActiveTab('history')
    await history.loadHistory()
    history.openLiveSettlement('42', 'previous-account')
    history.openMatchDetail(TEST_HISTORY_MATCH.id)
    expect(history.selectedMatchId).toBe(TEST_HISTORY_MATCH.id)
    expect(history.liveSettlement).toBeNull()
    expect(ui.activeTab).toBe('match-detail')
  })

  it('discards an older response after cancellation, account change or disconnect', async () => {
    let resolve!: (value: HistoryResult) => void
    api.load.mockReturnValueOnce(
      new Promise<HistoryResult>((done) => {
        resolve = done
      }),
    )
    const history = useHistoryStore(pinia)
    const old = history.loadHistory()
    history.clearRealHistory()
    api.load.mockResolvedValue({
      source: 'real',
      snapshot: { ...testHistorySnapshot([]), accountKey: 'new-account' },
    })
    await history.loadHistory()
    resolve({ source: 'real', snapshot: testHistorySnapshot() })
    await old
    expect(history.accountKey).toBe('new-account')
    expect(history.matchHistory).toEqual([])
    expect(history.hasLoaded).toBe(true)
  })

  it('clears stale data on failure and allows successful retry', async () => {
    const history = useHistoryStore(pinia)
    api.load.mockResolvedValueOnce({ source: 'real', snapshot: testHistorySnapshot() })
    await history.loadHistory()
    api.load.mockRejectedValueOnce(new LcuServiceError('lcu.not_logged_in', 'raw details'))
    await history.loadHistory()
    expect(history.matchHistory).toEqual([])
    expect(history.errorCode).toBe('lcu.not_logged_in')
    expect(history.isLoading).toBe(false)
    api.load.mockResolvedValueOnce({ source: 'real', snapshot: testHistorySnapshot([]) })
    await history.loadHistory()
    expect(history.errorCode).toBeNull()
    expect(history.hasLoaded).toBe(true)
  })
})
