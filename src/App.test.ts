import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { createSSRApp } from 'vue'
import { renderToString } from 'vue/server-renderer'
import App from './App.vue'
import { createAppI18n } from './i18n'
import { APP_VERSION } from './shared/constants/app'
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

  it('shows connection details immediately and keeps a browser-only demo entry', async () => {
    const { html } = await renderApp()

    expect(html).toContain('等待客户端启动')
    expect(html).toContain('连接详情')
    expect(html).toContain('id="connection-detail-panel"')
    expect(html).toContain('进入浏览器演示')
    expect(html).not.toContain('lcu-connector.sh')
    expect(html).not.toContain(`Mayhem Assistant v${APP_VERSION}`)
  })

  it('renders the migrated home page, header and bottom navigation after connecting', async () => {
    const { html } = await renderApp((store) => {
      store.connect()
      vi.advanceTimersByTime(CONNECT_DELAY_MS)
    })

    expect(html).not.toContain('等待连接英雄联盟')
    expect(html).toContain(`Mayhem Assistant v${APP_VERSION}`)
    expect(html).toContain('id="page-home"')
    expect(html).toContain('峡谷小米')
    expect(html).toContain('房间中')
    expect(html).toContain('匹配模式')
    expect(html).toMatch(/id="home-rule-text"[^>]*>纯伤害规则</)
    expect(html).toContain('当前对局')
    expect(html).toContain('近期对局')
    expect(html).toContain('主导航')
    expect(html).toContain('active-tab')
    expect(html).not.toContain('阶段 2 · UI 基础框架')
  })

  it('reflects a changed score rule in the home page', async () => {
    const { html, store } = await renderApp((store) => {
      store.connect()
      vi.advanceTimersByTime(CONNECT_DELAY_MS)
      store.setCurrentRule('tail')
    })

    expect(store.currentRule).toBe('tail')
    expect(html).toMatch(/id="home-rule-text"[^>]*>伤害尾数规则</)
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
    expect(html).toContain('查看纯伤害规则说明')
    expect(html).toContain('按精确输出伤害从高到低排名')
    expect(html).toContain('幸运数字规则')
    expect(html).toContain('查看幸运数字规则说明')
    expect(html).toContain('尾数与赛后幸运数字的距离越小，排名越高')
    expect(html).toContain('伤害尾数规则')
    expect(html).toContain('查看伤害尾数规则说明')
    expect(html).toContain('个位优先，9 最大、0 最小；同分逐位比较')
    expect(html).toContain('小工具')
    expect(html).toContain('随机分组')
    expect(html).toContain('更多工具')
    expect(html).toContain('参与玩家')
    expect(html).not.toContain('仅生成分队建议，不会自动更改英雄联盟客户端的队伍。')
    expect(html).toContain('开始分队')
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
    expect(html).not.toContain('开机自动启动')
    expect(html).not.toContain('断开连接自动重试')
    expect(html).not.toContain('提示音效')
    expect(html).toContain('关于助手')
    expect(html).toContain('当前版本')
    expect(html).toContain(`v${APP_VERSION}`)
    expect(html).toContain('检查更新')
    const settingsHtml = html.slice(html.indexOf('id="page-settings"')).split('</section>')[0]!
    expect(settingsHtml.match(/role="switch"/g)).toHaveLength(1)
    expect(settingsHtml.match(/aria-checked="true"/g)).toBeNull()
    expect(html).not.toContain('重置设置')
  })
})
