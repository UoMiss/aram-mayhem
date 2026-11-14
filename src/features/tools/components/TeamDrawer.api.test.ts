// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, disposePinia } from 'pinia'
import { createAppI18n } from '@/i18n'
import { useConnectionStore } from '@/stores/connection'
import { LcuServiceError } from '@/services/desktop-error'
import { connectedStatus, homeFlow } from '../../../../tests/fixtures/home-contract'
import { testParticipants } from '../../../../tests/fixtures/participants-contract'
import { PARTICIPANTS_REFRESH_MS } from '../useTeamParticipants'
const api = vi.hoisted(() => ({ load: vi.fn(), capture: vi.fn() }))
vi.mock('@/services/image.service', () => ({ captureAndDeliverScreenshot: api.capture }))
vi.mock('@tauri-apps/api/core', () => ({ isTauri: () => true }))
vi.mock('@/services/participants.service', () => ({ getCustomParticipants: api.load }))
import TeamDrawer from './TeamDrawer.vue'
let pinia: ReturnType<typeof createPinia>
let wrapper: ReturnType<typeof mount> | undefined
function render(open = true) {
  wrapper = mount(TeamDrawer, { props: { open }, global: { plugins: [pinia, createAppI18n()] } })
  return wrapper
}
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] })
  api.capture.mockReset().mockResolvedValue({ status: 'copied' })
  api.load.mockReset()
  api.load.mockResolvedValue({ source: 'real', snapshot: testParticipants() })
  pinia = createPinia()
  useConnectionStore(pinia).setLcuStatus(connectedStatus())
  const flow = homeFlow()
  flow.session!.lobby!.lobbyId = 'room-1'
  flow.session!.modeContext!.isCustomGame = true
  flow.session!.modeContext!.mapId = 12
  useConnectionStore(pinia).setGameflowSnapshot(flow)
})
afterEach(() => {
  wrapper?.unmount()
  wrapper = undefined
  disposePinia(pinia)
  vi.restoreAllMocks()
  vi.useRealTimers()
})
describe('custom lobby team participants', () => {
  it('withholds the result when two players leave before the reveal', async () => {
    const page = render()
    await flushPromises()
    await page.get('#randomBtn').trigger('click')
    await flushPromises()
    expect(api.load).toHaveBeenCalledTimes(2)
    await vi.advanceTimersByTimeAsync(1000)
    api.load.mockResolvedValue({ source: 'real', snapshot: testParticipants(8) })

    await vi.advanceTimersByTimeAsync(2000)

    expect(page.find('#timestampBar').exists()).toBe(false)
    expect(page.get('#copyTeamBtn').attributes('disabled')).toBeDefined()
    expect(api.load).toHaveBeenCalledTimes(3)
    expect(page.get('#playerCount').text()).toBe('8 人')
    expect(page.text()).toContain('房间或玩家名单已变化')
  })

  it('loads both teams, checks freshness before drawing, and keeps all ten players', async () => {
    const page = render(false)
    await flushPromises()
    expect(api.load).not.toHaveBeenCalled()
    expect(page.text()).not.toContain('Ezreal')
    await page.setProps({ open: true })
    await flushPromises()
    expect(page.get('#playerCount').text()).toBe('10 人')
    expect(page.get('#unrandomizedView').findAll('[title]')).toHaveLength(10)
    await page.get('#randomBtn').trigger('click')
    await flushPromises()
    expect(api.load).toHaveBeenCalledTimes(2)
    await vi.advanceTimersByTimeAsync(3000)
    expect(api.load).toHaveBeenCalledTimes(3)
    const a = page.get('#teamA').findAll('[title]')
    const b = page.get('#teamB').findAll('[title]')
    expect(a).toHaveLength(5)
    expect(b).toHaveLength(5)
    expect(new Set([...a, ...b].map((player) => player.text())).size).toBe(10)
    expect(page.find('#timestampBar').exists()).toBe(true)
    api.load.mockResolvedValue({ source: 'real', snapshot: testParticipants(8) })
    await vi.advanceTimersByTimeAsync(PARTICIPANTS_REFRESH_MS)
    await flushPromises()
    expect(page.text()).toContain('房间或玩家名单已变化')
    expect(page.find('#timestampBar').exists()).toBe(false)
    expect(page.get('#teamA').findAll('[title]')).toHaveLength(0)
    expect(page.get('#playerCount').text()).toBe('8 人')
  })
  it('shows the current sides without headings, then draws the combined roster', async () => {
    const snapshot = testParticipants(6)
    snapshot.players = snapshot.players.map((player, index) => ({
      ...player,
      side: index < 2 ? 'blue' : 'red',
    }))
    api.load.mockResolvedValue({ source: 'real', snapshot })
    const page = render()
    await flushPromises()
    const names = (selector: string) =>
      page
        .get(selector)
        .findAll('[title]')
        .map((p) => p.text())
    const left = '#unrandomizedView [data-current-side="blue"]'
    const right = '#unrandomizedView [data-current-side="red"]'
    expect(names(left)).toEqual(['真实玩家1', '真实玩家2'])
    expect(names(right)).toEqual(['真实玩家3', '真实玩家4', '真实玩家5', '真实玩家6'])
    expect(page.get('#unrandomizedView').text()).not.toMatch(/蓝色方|红色方/)

    const moved = {
      ...snapshot,
      players: snapshot.players.map((player) => ({
        ...player,
        side: player.id === 'player-3' ? ('blue' as const) : player.side,
      })),
    }
    api.load.mockResolvedValue({ source: 'real', snapshot: moved })
    await page.get('#refreshTeamPlayers').trigger('click')
    await flushPromises()
    expect(names(left)).toEqual(['真实玩家1', '真实玩家2', '真实玩家3'])
    expect(names(right)).toEqual(['真实玩家4', '真实玩家5', '真实玩家6'])

    await page.get('#randomBtn').trigger('click')
    await flushPromises()
    await vi.advanceTimersByTimeAsync(3000)
    const blue = names('#teamA')
    const red = names('#teamB')
    expect(blue).toHaveLength(3)
    expect(red).toHaveLength(3)
    expect([...blue, ...red].sort()).toEqual(snapshot.players.map((player) => player.name).sort())

    api.load.mockResolvedValue({ source: 'real', snapshot })
    await page.get('#refreshTeamPlayers').trigger('click')
    await flushPromises()
    expect(names('#teamA')).toEqual(blue)
    expect(names('#teamB')).toEqual(red)
    expect(page.get('#copyTeamBtn').attributes('disabled')).toBeUndefined()
  })
  it('distinguishes normal and missing rooms, errors and retry without mock fallback', async () => {
    api.load.mockResolvedValueOnce({
      source: 'real',
      snapshot: testParticipants(0, { status: 'not_custom' }),
    })
    const page = render()
    await flushPromises()
    expect(page.text()).toContain('仅支持自定义房间')
    expect(page.get('#randomBtn').attributes('disabled')).toBeDefined()
    api.load.mockRejectedValueOnce(new LcuServiceError('lcu.timeout', 'password=secret'))
    await page.get('#refreshTeamPlayers').trigger('click')
    await flushPromises()
    expect(page.get('[role="alert"]').text()).toContain('读取失败')
    expect(page.text()).not.toContain('secret')
    expect(page.text()).not.toContain('Ezreal')
    api.load.mockResolvedValueOnce({
      source: 'real',
      snapshot: testParticipants(0, { status: 'no_lobby' }),
    })
    await page.get('#refreshTeamPlayers').trigger('click')
    await flushPromises()
    expect(page.text()).toContain('进入自定义房间')
    await page.get('#refreshTeamPlayers').trigger('click')
    await flushPromises()
    expect(page.get('#randomBtn').attributes('disabled')).toBeUndefined()
  })
  it('requires review when the pre-draw refresh finds a changed roster', async () => {
    const page = render()
    await flushPromises()
    api.load.mockResolvedValueOnce({ source: 'real', snapshot: testParticipants(9) })
    await page.get('#randomBtn').trigger('click')
    await flushPromises()
    expect(page.text()).toContain('请核对名单后重新分组')
    expect(page.text()).toContain('仅支持 6、8、10 人')
    expect(page.get('#teamA').findAll('[title]')).toHaveLength(0)
  })
  it('clears immediately on disconnect and ignores a late response after closing', async () => {
    const page = render()
    await flushPromises()
    useConnectionStore(pinia).setLcuStatus(connectedStatus({ status: 'disconnected', revision: 2 }))
    await flushPromises()
    expect(page.get('#playerCount').text()).toBe('仅已识别 0 人')
    expect(page.get('#randomBtn').attributes('disabled')).toBeDefined()
    let resolve!: (value: unknown) => void
    api.load.mockReturnValueOnce(
      new Promise((done) => {
        resolve = done
      }),
    )
    useConnectionStore(pinia).setLcuStatus(connectedStatus({ revision: 3 }))
    await flushPromises()
    await page.setProps({ open: false })
    resolve({ source: 'real', snapshot: testParticipants() })
    await flushPromises()
    expect(page.get('#playerCount').text()).toBe('仅已识别 0 人')
    await vi.advanceTimersByTimeAsync(PARTICIPANTS_REFRESH_MS * 2)
    expect(api.load).toHaveBeenCalledTimes(2)
    page.unmount()
    wrapper = undefined
    expect(vi.getTimerCount()).toBe(0)
  })
  it('does not restart a draw when an old preflight finishes after closing and reopening', async () => {
    const page = render()
    await flushPromises()
    let resolve!: (value: unknown) => void
    api.load.mockReturnValueOnce(
      new Promise((done) => {
        resolve = done
      }),
    )
    await page.get('#randomBtn').trigger('click')
    await page.setProps({ open: false })
    await page.setProps({ open: true })
    await flushPromises()
    expect(page.get('#randomBtn').attributes('disabled')).toBeUndefined()
    resolve({ source: 'real', snapshot: testParticipants() })
    await flushPromises()
    expect(page.find('#timestampBar').exists()).toBe(false)
    expect(page.get('#teamA').findAll('[title]')).toHaveLength(0)
  })
})

describe('strict draw and result lifecycle', () => {
  it('keeps the result and copy disabled until the fresh roster is confirmed', async () => {
    const page = render()
    await flushPromises()
    await page.get('#randomBtn').trigger('click')
    await flushPromises()
    let resolve!: (value: unknown) => void
    api.load.mockReturnValueOnce(new Promise((done) => (resolve = done)))

    await vi.advanceTimersByTimeAsync(3000)

    expect(api.load).toHaveBeenCalledTimes(3)
    expect(page.find('#team-result-meta').exists()).toBe(false)
    expect(page.find('#timestampBar').exists()).toBe(false)
    expect(page.get('#randomizedView').text()).not.toMatch(/蓝色方|红色方/)
    expect(page.get('#randomBtn').attributes('disabled')).toBeDefined()
    expect(page.get('#copyTeamBtn').attributes('disabled')).toBeDefined()

    const snapshot = testParticipants()
    snapshot.players[0]!.name = '已补全的玩家名'
    resolve({ source: 'real', snapshot })
    await flushPromises()
    expect(page.get('#randomizedView').text()).toContain('已补全的玩家名')
    expect(page.get('#timestampBar').isVisible()).toBe(true)
    expect(page.get('#copyTeamBtn').attributes('disabled')).toBeUndefined()
  })

  it.each(['replacement', 'partial', 'timeout'] as const)(
    'cancels the result when the reveal check returns %s',
    async (change) => {
      const page = render()
      await flushPromises()
      await page.get('#randomBtn').trigger('click')
      await flushPromises()
      const snapshot = testParticipants()
      if (change === 'replacement') snapshot.players[0]!.id = 'new-player'
      if (change === 'partial') {
        snapshot.completeness = 'partial'
        snapshot.issue = 'unresolved_slots'
        snapshot.unresolvedCount = 1
      }
      if (change === 'timeout')
        api.load.mockRejectedValueOnce(new LcuServiceError('lcu.timeout', 'Roster read timed out'))
      else api.load.mockResolvedValueOnce({ source: 'real', snapshot })

      await vi.advanceTimersByTimeAsync(3000)

      expect(page.find('#timestampBar').exists()).toBe(false)
      expect(page.get('#teamA').findAll('[title]')).toHaveLength(0)
      expect(page.get('#copyTeamBtn').attributes('disabled')).toBeDefined()
      if (change === 'timeout') expect(page.get('[role="alert"]').text()).toContain('读取失败')
      else expect(page.text()).toContain('房间或玩家名单已变化')
    },
  )

  it.each(['reopen', 'switch account'] as const)(
    'ignores a pending reveal from before %s',
    async (boundary) => {
      const page = render()
      await flushPromises()
      await page.get('#randomBtn').trigger('click')
      await flushPromises()
      let resolve!: (value: unknown) => void
      api.load.mockReturnValueOnce(new Promise((done) => (resolve = done)))
      await vi.advanceTimersByTimeAsync(3000)
      expect(api.load).toHaveBeenCalledTimes(3)

      if (boundary === 'reopen') {
        await page.get('[aria-label="关闭随机分组"]').trigger('click')
        expect(page.emitted('close')).toHaveLength(1)
        await page.setProps({ open: false })
        await page.setProps({ open: true })
      } else {
        const connection = useConnectionStore(pinia)
        const flow = connection.gameflowSnapshot!
        connection.setGameflowSnapshot({ ...flow, code: 'account_changed', revision: 2 })
        api.load.mockResolvedValue({
          source: 'real',
          snapshot: testParticipants(10, { accountKey: 'account-2' }),
        })
        connection.setGameflowSnapshot({ ...flow, revision: 3 })
      }

      await flushPromises()
      await page.get('#randomBtn').trigger('click')
      await flushPromises()
      resolve({ source: 'real', snapshot: testParticipants() })
      await flushPromises()
      expect(page.find('#timestampBar').exists()).toBe(false)
      expect(page.get('#randomBtn').attributes('aria-busy')).toBe('true')
      await vi.advanceTimersByTimeAsync(3000)
      expect(page.get('#timestampBar').isVisible()).toBe(true)
      expect(page.get('#copyTeamBtn').attributes('disabled')).toBeUndefined()
    },
  )

  it.each([false, true])(
    'reveals only after three seconds with reduced motion = %s',
    async (reducedMotion) => {
      const media = window.matchMedia('(prefers-reduced-motion: reduce)')
      vi.spyOn(window, 'matchMedia').mockReturnValue({ ...media, matches: reducedMotion })
      const page = render()
      await flushPromises()
      await page.get('#randomBtn').trigger('click')
      await flushPromises()
      const preview = page.get('#teamA').text()
      expect(page.get('#randomBtn').attributes('disabled')).toBeDefined()
      expect(page.get('#randomBtn').attributes('aria-busy')).toBe('true')
      expect(page.get('#copyTeamBtn').attributes('disabled')).toBeDefined()
      expect(page.find('#timestampBar').exists()).toBe(false)
      expect(page.get('#randomBtn').text()).toContain('3')
      await vi.advanceTimersByTimeAsync(120)
      if (reducedMotion) expect(page.get('#teamA').text()).toBe(preview)
      else expect(page.get('#teamA').text()).not.toBe(preview)
      await vi.advanceTimersByTimeAsync(880)
      expect(page.get('#randomBtn').text()).toContain('2')
      await vi.advanceTimersByTimeAsync(1000)
      expect(page.get('#randomBtn').text()).toContain('1')
      await vi.advanceTimersByTimeAsync(999)
      expect(page.find('#timestampBar').exists()).toBe(false)
      expect(page.get('#copyTeamBtn').attributes('disabled')).toBeDefined()
      await vi.advanceTimersByTimeAsync(1)
      expect(page.find('#timestampBar').exists()).toBe(true)
      expect(page.get('#randomBtn').text()).toBe('重新分队')
      expect(page.get('#randomBtn').attributes('aria-busy')).toBe('false')
      expect(page.get('#copyTeamBtn').attributes('disabled')).toBeUndefined()
    },
  )

  it.each(['close', 'disconnect', 'session', 'unmount'])(
    'cancels an in-flight shuffle on %s without revealing a stale result',
    async (reason) => {
      const page = render()
      await flushPromises()
      await page.get('#randomBtn').trigger('click')
      await flushPromises()
      await vi.advanceTimersByTimeAsync(120)
      if (reason === 'close') await page.setProps({ open: false })
      if (reason === 'disconnect')
        useConnectionStore(pinia).setLcuStatus(
          connectedStatus({ status: 'disconnected', revision: 2 }),
        )
      if (reason === 'session') {
        const connection = useConnectionStore(pinia)
        const flow = connection.gameflowSnapshot!
        connection.setGameflowSnapshot({
          ...flow,
          revision: 2,
          session: { ...flow.session!, sessionKey: 'new-room-session' },
        })
      }
      if (reason === 'unmount') {
        page.unmount()
        wrapper = undefined
      }
      await flushPromises()
      await vi.advanceTimersByTimeAsync(3000)
      if (reason === 'unmount') expect(vi.getTimerCount()).toBe(0)
      else {
        expect(page.find('#timestampBar').exists()).toBe(false)
        expect(page.get('#teamA').findAll('[title]')).toHaveLength(0)
        expect(page.get('#copyTeamBtn').attributes('disabled')).toBeDefined()
      }
    },
  )

  async function draw(page: ReturnType<typeof render>) {
    await flushPromises()
    await page.get('#randomBtn').trigger('click')
    await flushPromises()
    await vi.advanceTimersByTimeAsync(3000)
  }
  it.each([6, 8, 10])('allows complete custom %i-player rooms', async (count) => {
    api.load.mockResolvedValue({ source: 'real', snapshot: testParticipants(count) })
    const page = render()
    await draw(page)
    expect(page.get('#teamA').findAll('[title]')).toHaveLength(count / 2)
    expect(page.get('#teamB').findAll('[title]')).toHaveLength(count / 2)
    expect(page.get('#teamCaptureArea').text()).not.toContain('名单已确认')
    expect(page.get('#team-result-meta').text()).toBe(
      `自定义 · ${count / 2}v${count / 2} · 嚎哭深渊`,
    )
    expect(page.get('#team-drawer-title').text()).toBe('自定义随机分队')
    expect(page.get('#playerCount').element.parentElement?.textContent).toContain(
      `参与玩家 · ${count} 人`,
    )
    expect(page.text()).not.toContain('仅生成分队建议')
    expect(page.text()).not.toContain('当前自定义房间双方真人玩家')
    expect(page.get('#randomBtn').text()).toBe('重新分队')
    expect(page.get('#teamCaptureArea').text()).toContain('蓝色方')
    expect(page.get('#teamCaptureArea').text()).not.toContain('account-1')
  })
  it.each([3, 4, 5, 7, 9, 11])('blocks unsupported %i-player rooms', async (count) => {
    api.load.mockResolvedValue({ source: 'real', snapshot: testParticipants(count) })
    const page = render()
    await flushPromises()
    expect(page.get('#randomBtn').attributes('disabled')).toBeDefined()
    expect(page.text()).toContain('仅支持 6、8、10 人')
  })
  it.each(['party', 'champ_select'] as const)(
    'blocks %s even with enough players',
    async (status) => {
      api.load.mockResolvedValue({ source: 'real', snapshot: testParticipants(10, { status }) })
      const page = render()
      await flushPromises()
      expect(page.get('#randomBtn').attributes('disabled')).toBeDefined()
      expect(page.text()).toContain('仅支持自定义房间')
    },
  )
  it.each(['partial', 'unknown'] as const)(
    'blocks a %s roster and labels the count as identified only',
    async (completeness) => {
      api.load.mockResolvedValue({
        source: 'real',
        snapshot: testParticipants(8, {
          completeness,
          issue: 'unresolved_slots',
          unresolvedCount: 2,
        }),
      })
      const page = render()
      await flushPromises()
      expect(page.get('#randomBtn').attributes('disabled')).toBeDefined()
      expect(page.get('#playerCount').text()).toBe('仅已识别 8 人')
      expect(page.text()).toContain('参赛资格未核实')
    },
  )
  it('updates names without changing membership, then invalidates when completeness drops', async () => {
    const page = render()
    await draw(page)
    const originalA = page
      .get('#teamA')
      .findAll('[title]')
      .map((p) => p.text())
    const updated = testParticipants()
    updated.players = updated.players.map((p) => ({ ...p, name: `新${p.name}` }))
    api.load.mockResolvedValue({ source: 'real', snapshot: updated })
    await page.get('#refreshTeamPlayers').trigger('click')
    await flushPromises()
    expect(
      page
        .get('#teamA')
        .findAll('[title]')
        .map((p) => p.text()),
    ).toEqual(originalA.map((n) => `新${n}`))
    expect(page.find('#timestampBar').exists()).toBe(true)
    api.load.mockResolvedValue({
      source: 'real',
      snapshot: {
        ...updated,
        completeness: 'partial',
        issue: 'unresolved_slots',
        unresolvedCount: 1,
      },
    })
    await page.get('#refreshTeamPlayers').trigger('click')
    await flushPromises()
    expect(page.find('#timestampBar').exists()).toBe(false)
    expect(page.get('#copyTeamBtn').attributes('disabled')).toBeDefined()
  })
  it('clears results for the same player set in a new session and rejects a stale session response', async () => {
    const page = render()
    await draw(page)
    const connection = useConnectionStore(pinia)
    const old = connection.gameflowSnapshot!
    connection.setGameflowSnapshot({
      ...old,
      revision: 2,
      session: { ...old.session!, sessionKey: 'new-room-session' },
    })
    await flushPromises()
    expect(page.find('#timestampBar').exists()).toBe(false)
    expect(page.get('#randomBtn').attributes('disabled')).toBeDefined()
    expect(page.get('#unrandomizedView').findAll('[title]')).toHaveLength(0)
  })
  it('clears results on close and never restores them simply by reopening', async () => {
    const page = render()
    await draw(page)
    await page.setProps({ open: false })
    await page.setProps({ open: true })
    await flushPromises()
    expect(page.find('#timestampBar').exists()).toBe(false)
    expect(page.get('#copyTeamBtn').attributes('disabled')).toBeDefined()
  })
  it('revalidates at the delivery boundary and rejects a roster changed during capture', async () => {
    const page = render()
    await draw(page)
    let canDeliver!: () => Promise<boolean>
    let finish!: () => void
    api.capture.mockImplementation((_element, options) => {
      canDeliver = options.beforeDeliver
      return new Promise((resolve) => {
        finish = () => resolve({ status: 'copied' })
      })
    })
    await page.get('#copyTeamBtn').trigger('click')
    await flushPromises()
    expect(api.capture).toHaveBeenCalledOnce()
    api.load.mockResolvedValue({ source: 'real', snapshot: testParticipants(8) })
    expect(await canDeliver()).toBe(false)
    expect(page.find('#timestampBar').exists()).toBe(false)
    finish()
    await flushPromises()
    expect(page.get('#copyTeamBtn').attributes('disabled')).toBeDefined()
  })
})
