import type { UpdateSnapshot } from '@/types/settings'
export function testUpdateSnapshot(overrides: Partial<UpdateSnapshot> = {}): UpdateSnapshot {
  return {
    revision: 0,
    phase: 'idle',
    latest: null,
    notes: null,
    downloaded: 0,
    total: null,
    canDownload: false,
    canInstall: false,
    errorCode: null,
    ...overrides,
  }
}
