import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { createSSRApp } from 'vue'
import { renderToString } from 'vue/server-renderer'
import App from './App.vue'
import { createAppI18n } from './i18n'
import { CONNECT_DELAY_MS, useAppStore } from './stores/app'

type AppStore = ReturnType<typeof useAppStore>

async function renderApp(setup?: (store: AppStore) => void) {
  const pinia = createPinia()
  setActivePinia(pinia)
  const store = useAppStore(pinia)
  setup?.(store)

  const app = createSSRApp(App)
  app.use(pinia)
  app.use(createAppI18n())
  const html = await renderToString(app)

  return { html, store }
}

function historyIds(html: string): string[] {
  return [...html.matchAll(/data-match-id="([^"]+)"/g)].map((match) => match[1] ?? '')
}

describe('App shell rendering', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.clearAllTimers()
    vi.useRealTimers()
  })

  it('renders the original disconnected screen first', async () => {
    const { html } = await renderApp()

    expect(html).toContain('等待连接英雄联盟')
    expect(html).toContain('打开并登录客户端后会自动连接。')
    expect(html).toContain('重新连接')
    expect(html).toContain('连接详情 · 每')
    expect(html).not.toContain('lcu-connector.sh')
    expect(html).not.toContain('Mayhem Assistant v0.1.0')
  })

  it('expands the connection details panel through reactive state', async () => {
    const { html } = await renderApp((store) => {
      store.toggleDetails()
    })

    expect(html).toContain('aria-expanded="true"')
    expect(html).toContain('rotate-90')
    expect(html).toContain('lcu-connector.sh')
    expect(html).toContain('connection-detail-panel')
  })

  it('renders the migrated home page, header and bottom navigation after connecting', async () => {
    const { html } = await renderApp((store) => {
      store.connect()
      vi.advanceTimersByTime(CONNECT_DELAY_MS)
    })

    expect(html).not.toContain('等待连接英雄联盟')
    expect(html).toContain('Mayhem Assistant v0.1.0')
    expect(html).toContain('id="page-home"')
    expect(html).toContain('峡谷小米')
    expect(html).toContain('房间中')
    expect(html).toContain('匹配模式')
    expect(html).toContain('伤害尾数规则')
    expect(html).toContain('对局结束自动结算')
    expect(html).toContain('关闭窗口可收进托盘。')
    expect(html).toContain('上一局')
    expect(html).toContain('历史对局')
    expect(html).toContain('主导航')
    expect(html).toContain('active-tab')
    expect(html).not.toContain('阶段 2 · UI 基础框架')
  })

  it('reflects a changed score rule in the home page', async () => {
    const { html, store } = await renderApp((store) => {
      store.connect()
      vi.advanceTimersByTime(CONNECT_DELAY_MS)
      store.setCurrentRule('damage')
    })

    expect(store.currentRule).toBe('damage')
    expect(html).toMatch(/id="home-rule-text"[^>]*>纯伤害规则</)
  })

  it('renders all seven original history cards', async () => {
    const { html } = await renderApp((store) => {
      store.connect()
      vi.advanceTimersByTime(CONNECT_DELAY_MS)
      store.setActiveTab('history')
    })

    expect(html).toContain('id="page-history"')
    expect(html).toContain('仅显示最近 20 局 · 点击查看结算')
    expect(historyIds(html)).toEqual([
      'match-001',
      'match-002',
      'match-003',
      'match-004',
      'match-005',
      'match-006',
      'match-007',
    ])
    expect(html).toContain('Zeri')
    expect(html).toContain('18/13/22')
    expect(html).toContain('9小时前')
    expect(html).toContain('海克斯大乱斗')
    expect(html).toContain('自定义')
  })

  it('filters history to five hex matches and two custom matches', async () => {
    const hex = await renderApp((store) => {
      store.connect()
      vi.advanceTimersByTime(CONNECT_DELAY_MS)
      store.setActiveTab('history')
      store.setHistoryFilter('hex')
    })
    expect(historyIds(hex.html)).toEqual([
      'match-001',
      'match-002',
      'match-003',
      'match-004',
      'match-005',
    ])

    const custom = await renderApp((store) => {
      store.connect()
      vi.advanceTimersByTime(CONNECT_DELAY_MS)
      store.setActiveTab('history')
      store.setHistoryFilter('custom')
    })
    expect(historyIds(custom.html)).toEqual(['match-006', 'match-007'])
  })

  it('records a clicked history id before opening match detail', async () => {
    const { html, store } = await renderApp((store) => {
      store.connect()
      vi.advanceTimersByTime(CONNECT_DELAY_MS)
      store.setActiveTab('history')
      store.openMatchDetail('match-004')
    })

    expect(store.selectedMatchId).toBe('match-004')
    expect(store.selectedMatch?.champion).toBe('Neeko')
    expect(store.activeTab).toBe('match-detail')
    expect(html).toContain('对局结算')
  })

  it('renders the shared match-detail fixture with both layouts and copy action', async () => {
    const { html } = await renderApp((store) => {
      store.connect()
      vi.advanceTimersByTime(CONNECT_DELAY_MS)
      store.setActiveTab('match-detail')
    })

    expect(html).toContain('对局结算')
    expect(html).toContain('自定义 (屠夫之桥)')
    expect(html).toContain('24:48')
    expect(html).toContain('发红包名单')
    expect(html).toContain('本局最后 5 名，请准备好你们的红包！')
    expect(html).toContain('分组模式')
    expect(html).toContain('全局排行')
    expect(html).toContain('我方失败')
    expect(html).toContain('敌方胜利')
    expect(html).toContain('Ezreal#60943')
    expect(html).toContain('翻斗花园牛爷爷#70976')
    expect(html).toContain('13.5')
    expect(html).toContain('id="screenshot-area"')
    expect(html).toContain('id="copyBtn"')
    expect(html).toContain('复制截图')
  })

  it('renders the tools page, rule options and team drawer', async () => {
    const { html } = await renderApp((store) => {
      store.connect()
      vi.advanceTimersByTime(CONNECT_DELAY_MS)
      store.setActiveTab('tools')
    })

    expect(html).toContain('算分规则')
    expect(html).toContain('纯伤害规则')
    expect(html).toContain('按伤害排名结算')
    expect(html).toContain('幸运数字规则')
    expect(html).toContain('按尾数匹配结算')
    expect(html).toContain('伤害尾数规则')
    expect(html).toContain('按伤害尾数排名')
    expect(html).toContain('小工具')
    expect(html).toContain('随机分组')
    expect(html).toContain('更多工具')
    expect(html).toContain('参与玩家')
    expect(html).toContain('从当前参与玩家中随机均分为 A、B 两组。')
    expect(html).toContain('开始分组')
    expect(html).toContain('复制图片')
    expect(html).toContain('id="teamDrawer"')
    expect(html).toContain('id="teamCaptureArea"')
    expect(html).toContain('洞爷湖')
    expect(html).toContain('黛乃奈昭姿')
    expect(html).toContain('奢谨筱箅栗')
  })

  it('renders the settings page with defaults, version and update action', async () => {
    const { html } = await renderApp((store) => {
      store.connect()
      vi.advanceTimersByTime(CONNECT_DELAY_MS)
      store.setActiveTab('settings')
    })

    expect(html).toContain('id="page-settings"')
    expect(html).toContain('通用设置')
    expect(html).toContain('自动启动并后台运行')
    expect(html).toContain('断开连接自动重试')
    expect(html).toContain('提示音效')
    expect(html).toContain('关于助手')
    expect(html).toContain('当前版本')
    expect(html).toContain('v0.1.0')
    expect(html).toContain('检查更新')
    const settingsHtml = html.slice(html.indexOf('id="page-settings"')).split('</section>')[0]!
    expect(settingsHtml.match(/role="switch"/g)).toHaveLength(3)
    expect(settingsHtml.match(/aria-checked="true"/g)).toHaveLength(3)
    expect(html).not.toContain('重置设置')
  })
})
