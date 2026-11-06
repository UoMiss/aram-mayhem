import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  testSettlement,
  TEST_SETTLEMENT_ACCOUNT,
  TEST_SETTLEMENT_ID,
} from '../../tests/fixtures/settlement-contract'
import type { SettlementRequest } from '@/types/settlement-api'
const adapter = vi.hoisted(() => ({ desktop: false, load: vi.fn() }))
vi.mock('@tauri-apps/api/core', () => ({ isTauri: () => adapter.desktop }))
vi.mock('@/adapters/tauri.adapter', () => ({
  tauriSettlementAdapter: { getSettlement: adapter.load },
}))
import { getSettlement } from './settlement.service'
const request: SettlementRequest = {
  gameId: TEST_SETTLEMENT_ID,
  accountKey: TEST_SETTLEMENT_ACCOUNT,
  rule: 'tail',
}
beforeEach(() => {
  adapter.desktop = false
  adapter.load.mockReset()
})
describe('settlement service', () => {
  it('identifies browser fixtures explicitly without IPC', async () => {
    expect((await getSettlement(request)).source).toBe('mock')
    expect(adapter.load).not.toHaveBeenCalled()
  })
  it('loads native details and preserves failures on desktop', async () => {
    adapter.desktop = true
    adapter.load.mockResolvedValueOnce(testSettlement())
    expect((await getSettlement(request)).source).toBe('real')
    expect(adapter.load).toHaveBeenCalledWith(request)
    adapter.load.mockRejectedValueOnce(new Error('offline'))
    await expect(getSettlement(request)).rejects.toThrow('offline')
  })
})
