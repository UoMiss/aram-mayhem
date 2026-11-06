import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { createSSRApp } from 'vue'
import { renderToString } from 'vue/server-renderer'
import type { LcuStatusDto } from '@/types/lcu'

vi.mock('@tauri-apps/api/core', () => ({ isTauri: () => true }))

import App from './App.vue'
import { createAppI18n } from './i18n'
import { useAppStore } from './stores/app'

function status(overrides: Partial<LcuStatusDto> = {}): LcuStatusDto {
  return {
    status: 'connected',
    code: null,
    message: null,
    source: 'real',
    simulated: false,
    revision: 1,
    updatedAt: 1,
    monitoring: true,
    ...overrides,
  }
}

async function renderWith(statusValue?: LcuStatusDto) {
  const pinia = createPinia()
  setActivePinia(pinia)
  const store = useAppStore(pinia)
  if (statusValue) store.setLcuStatus(statusValue)
  const app = createSSRApp(App)
  app.use(pinia)
  app.use(createAppI18n())
  return { html: await renderToString(app), store }
}

describe('Tauri AppShell state binding', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('shows the connection screen while the real client is not running', async () => {
    const { html } = await renderWith(status({ status: 'not_running', code: 'client_not_found' }))
    expect(html).toContain('未检测到英雄联盟客户端')
    expect(html).toContain('id="connection-detail-panel"')
    expect(html).toContain('client_not_found')
    expect(html).not.toContain('connection-dot')
    expect(html).not.toContain('打开并登录客户端后会自动连接')
    expect(html).not.toContain('请在选英雄前启动助手')
    expect(html).not.toContain('<button')
    expect(html).not.toContain('2999')
    expect(html).not.toContain('id="page-home"')
  })

  it('automatically shows AppShell and home after a real connected snapshot', async () => {
    const { html } = await renderWith(status())
    expect(html).toContain('id="page-home"')
    expect(html).toContain('已连接')
    expect(html).toContain('账号名称暂不可用')
    expect(html).toContain('当前对局')
    expect(html).not.toContain('等待连接英雄联盟')
    expect(html).not.toContain('峡谷小米')
  })

  it('returns to the connection screen after a real disconnected snapshot', async () => {
    const { html } = await renderWith(
      status({ revision: 2, status: 'disconnected', code: 'client_exited' }),
    )
    expect(html).toContain('LCU 连接已断开')
    expect(html).not.toContain('id="page-home"')
  })

  it('does not treat a simulated connected snapshot as real', async () => {
    const { html } = await renderWith(status({ source: 'mock', simulated: true }))
    expect(html).not.toContain('id="page-home"')
  })

  it('never renders the removed hard-coded port/process diagnostics', async () => {
    const { html } = await renderWith(status({ status: 'error', code: 'authentication_failed' }))
    expect(html).toContain('LCU 连接失败')
    expect(html).toContain('authentication_failed')
    expect(html).toContain('请重新登录英雄联盟客户端')
    expect(html).not.toContain('2999')
    expect(html).not.toContain("Process 'LeagueClient.exe' NOT found")
  })
})
