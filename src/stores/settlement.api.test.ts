import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, disposePinia } from 'pinia'
import {
  testSettlement,
  TEST_SETTLEMENT_ACCOUNT,
  TEST_SETTLEMENT_ID,
} from '../../tests/fixtures/settlement-contract'
import type { SettlementRequest } from '@/types/settlement-api'
const api = vi.hoisted(() => ({ load: vi.fn() }))
vi.mock('@/services/settlement.service', () => ({ getSettlement: api.load }))
import { useSettlementStore } from './settlement'
const request: SettlementRequest = {
  gameId: TEST_SETTLEMENT_ID,
  accountKey: TEST_SETTLEMENT_ACCOUNT,
  rule: 'tail',
}
let pinia: ReturnType<typeof createPinia>
beforeEach(() => {
  api.load.mockReset()
  pinia = createPinia()
})
afterEach(() => disposePinia(pinia))
describe('settlement request scope', () => {
  it('coalesces the same request and discards late responses after switching games', async () => {
    const store = useSettlementStore(pinia)
    let resolve!: (value: unknown) => void
    api.load.mockReturnValueOnce(
      new Promise((done) => {
        resolve = done
      }),
    )
    const previous = store.load(request)
    const duplicate = store.load(request)
    expect(api.load).toHaveBeenCalledOnce()
    api.load.mockResolvedValueOnce({ source: 'real', snapshot: testSettlement({ id: '42' }) })
    await store.load({ ...request, gameId: '42' })
    resolve({ source: 'real', snapshot: testSettlement() })
    await Promise.all([previous, duplicate])
    expect(store.snapshot?.id).toBe('42')
  })
  it('rejects mismatched game/account/rule and mock data', async () => {
    const store = useSettlementStore(pinia)
    for (const result of [
      { source: 'real', snapshot: testSettlement({ id: '42' }) },
      { source: 'real', snapshot: testSettlement({ accountKey: 'other' }) },
      { source: 'real', snapshot: testSettlement({ appliedRule: 'damage' }) },
      { source: 'mock', fixture: {} },
    ]) {
      api.load.mockResolvedValueOnce(result)
      await store.load(request)
      expect(store.snapshot).toBeNull()
      expect(store.errorCode).toBe('lcu.invalid_response')
    }
  })
})
