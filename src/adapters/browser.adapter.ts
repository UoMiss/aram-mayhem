import type { AppHealth, DesktopAdapter } from '@/types/desktop'
import type { LcuAdapter, LcuStatusDto } from '@/types/lcu'

/** Browser mode intentionally stays on Mock data; no LCU is contacted. */
export const browserAdapter: DesktopAdapter = {
  async getHealth(): Promise<AppHealth> {
    return {
      status: 'ok',
      runtime: 'browser',
      appName: 'ARAM: Mayhem',
      appVersion: '0.1.0',
      platform: typeof navigator !== 'undefined' ? navigator.platform : 'unknown',
      simulated: true,
    }
  },
}

function mockStatus(overrides: Partial<LcuStatusDto> = {}): LcuStatusDto {
  return {
    status: 'connected',
    code: null,
    message: null,
    source: 'mock',
    simulated: true,
    revision: 1,
    updatedAt: Date.now(),
    monitoring: false,
    ...overrides,
  }
}

/** Browser mode stays explicitly Mock; it never claims a real LCU connection. */
export const browserLcuAdapter: LcuAdapter = {
  async getConnectionStatus() {
    return mockStatus()
  },
  async startMonitoring() {
    return mockStatus({ monitoring: true })
  },
  async stopMonitoring() {
    return mockStatus({
      status: 'not_running',
      code: 'monitoring_stopped',
      revision: 2,
      monitoring: false,
    })
  },
  async subscribe() {
    return () => undefined
  },
}
