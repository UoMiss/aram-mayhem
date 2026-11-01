import type { AppHealth, DesktopAdapter } from '@/types/desktop'

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
