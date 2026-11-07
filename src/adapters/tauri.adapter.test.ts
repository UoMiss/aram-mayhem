import { testUpdateSnapshot } from '../../tests/fixtures/update-contract'
import {
  testSettlement,
  TEST_SETTLEMENT_ACCOUNT,
  TEST_SETTLEMENT_ID,
} from '../../tests/fixtures/settlement-contract'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DesktopServiceError, LcuServiceError } from '@/services/desktop-error'
import type { AppHealth } from '@/types/desktop'
import {
  GAMEFLOW_CHAMP_SELECT_EVENT,
  GAMEFLOW_LOBBY_EVENT,
  GAMEFLOW_SESSION_ENDED_EVENT,
  GAMEFLOW_UPDATED_EVENT,
  LCU_STATUS_EVENT,
  type GameflowSnapshot,
  type LcuStatusDto,
} from '@/types/lcu'

const invokeMock = vi.hoisted(() => vi.fn())
const listenMock = vi.hoisted(() => vi.fn())
vi.mock('@tauri-apps/api/core', () => ({
  invoke: invokeMock,
  Channel: class {
    onmessage = () => undefined
  },
}))
vi.mock('@tauri-apps/api/event', () => ({ listen: listenMock }))

import {
  tauriAdapter,
  tauriGameflowAdapter,
  tauriLcuAdapter,
  tauriHistoryAdapter,
  tauriHomeAdapter,
  tauriParticipantsAdapter,
  tauriSettingsAdapter,
  tauriSettlementAdapter,
} from './tauri.adapter'
import { testHistorySnapshot } from '../../tests/fixtures/history-contract'

const health: AppHealth = {
  status: 'ok',
  runtime: 'tauri',
  appName: 'ARAM: Mayhem',
  appVersion: '0.1.0',
  platform: 'macos',
  simulated: true,
}

describe('tauri desktop adapter', () => {
  beforeEach(() => {
    invokeMock.mockReset()
    listenMock.mockReset()
  })

  it('invokes app_health_check and preserves the typed contract', async () => {
    invokeMock.mockResolvedValue(health)

    await expect(tauriAdapter.getHealth()).resolves.toEqual(health)
    expect(invokeMock).toHaveBeenCalledTimes(1)
    expect(invokeMock).toHaveBeenCalledWith('app_health_check')
  })

  it('sanitizes IPC errors and never exposes the host stack', async () => {
    invokeMock.mockRejectedValue(new Error('raw rust stack: do not expose'))

    try {
      await tauriAdapter.getHealth()
      throw new Error('expected adapter to throw')
    } catch (error) {
      expect(error).toBeInstanceOf(DesktopServiceError)
      expect(error).toMatchObject({
        code: 'desktop.ipc_failed',
        message: 'Desktop health check failed',
      })
      expect(String(error)).not.toContain('raw rust stack')
    }
  })
})

const lcuStatus: LcuStatusDto = {
  status: 'connected',
  code: null,
  message: null,
  source: 'real',
  simulated: false,
  revision: 4,
  updatedAt: 123,
  monitoring: true,
}

describe('tauri LCU adapter', () => {
  beforeEach(() => {
    invokeMock.mockReset()
    listenMock.mockReset()
  })

  it('invokes the typed read-only commands', async () => {
    invokeMock.mockResolvedValue(lcuStatus)

    await expect(tauriLcuAdapter.getConnectionStatus()).resolves.toEqual(lcuStatus)
    await expect(tauriLcuAdapter.startMonitoring()).resolves.toEqual(lcuStatus)
    await expect(tauriLcuAdapter.stopMonitoring()).resolves.toEqual(lcuStatus)
    expect(invokeMock).toHaveBeenNthCalledWith(1, 'lcu_get_connection_status')
    expect(invokeMock).toHaveBeenNthCalledWith(2, 'lcu_start_monitoring')
    expect(invokeMock).toHaveBeenNthCalledWith(3, 'lcu_stop_monitoring')
  })

  it('subscribes to the typed event and returns its unlisten function', async () => {
    const unlisten = vi.fn()
    listenMock.mockResolvedValue(unlisten)
    const listener = vi.fn()

    await expect(tauriLcuAdapter.subscribe(listener)).resolves.toBe(unlisten)
    expect(listenMock).toHaveBeenCalledWith(LCU_STATUS_EVENT, expect.any(Function))

    const handler = listenMock.mock.calls[0]?.[1] as (event: { payload: LcuStatusDto }) => void
    handler({ payload: lcuStatus })
    expect(listener).toHaveBeenCalledWith(lcuStatus)
  })

  it('sanitizes LCU IPC errors', async () => {
    invokeMock.mockRejectedValue(new Error('raw rust stack: do not expose'))

    await expect(tauriLcuAdapter.getConnectionStatus()).rejects.toMatchObject({
      name: 'LcuServiceError',
      code: 'lcu.status_failed',
      message: 'LCU IPC failed',
    })
    expect(new LcuServiceError('lcu.ipc_failed', 'LCU IPC failed')).toBeInstanceOf(Error)
  })
})

const gameflowSnapshot: GameflowSnapshot = {
  readyCheckStatus: null,
  revision: 7,
  updatedAt: 123,
  connected: true,
  phase: 'champ_select',
  rawPhase: 'ChampSelect',
  transport: 'websocket',
  source: 'real',
  simulated: false,
  session: null,
  code: null,
  message: null,
}

describe('tauri gameflow adapter', () => {
  beforeEach(() => {
    invokeMock.mockReset()
    listenMock.mockReset()
  })

  it('invokes initial snapshot and monitoring commands', async () => {
    invokeMock.mockResolvedValue(gameflowSnapshot)
    await expect(tauriGameflowAdapter.getSnapshot()).resolves.toEqual(gameflowSnapshot)
    await expect(tauriGameflowAdapter.startMonitoring()).resolves.toEqual(gameflowSnapshot)
    await expect(tauriGameflowAdapter.stopMonitoring()).resolves.toEqual(gameflowSnapshot)
    expect(invokeMock).toHaveBeenNthCalledWith(1, 'lcu_get_gameflow_snapshot')
    expect(invokeMock).toHaveBeenNthCalledWith(2, 'lcu_start_gameflow_monitoring')
    expect(invokeMock).toHaveBeenNthCalledWith(3, 'lcu_stop_gameflow_monitoring')
  })

  it('rejects unknown or missing ready-check feedback from native snapshots', async () => {
    for (const readyCheckStatus of ['success', true, undefined]) {
      invokeMock.mockResolvedValue({ ...gameflowSnapshot, readyCheckStatus })
      await expect(tauriGameflowAdapter.getSnapshot()).rejects.toMatchObject({
        code: 'lcu.invalid_response',
      })
    }
  })

  it('subscribes all typed events and unlistens them together', async () => {
    const unlisten = vi.fn()
    listenMock.mockResolvedValue(unlisten)
    const listener = vi.fn()
    const off = await tauriGameflowAdapter.subscribe(listener)

    expect(listenMock).toHaveBeenCalledTimes(4)
    expect(listenMock).toHaveBeenNthCalledWith(1, GAMEFLOW_UPDATED_EVENT, expect.any(Function))
    expect(listenMock).toHaveBeenNthCalledWith(2, GAMEFLOW_LOBBY_EVENT, expect.any(Function))
    expect(listenMock).toHaveBeenNthCalledWith(3, GAMEFLOW_CHAMP_SELECT_EVENT, expect.any(Function))
    expect(listenMock).toHaveBeenNthCalledWith(
      4,
      GAMEFLOW_SESSION_ENDED_EVENT,
      expect.any(Function),
    )

    const calls = listenMock.mock.calls
    ;(calls[0]?.[1] as (event: { payload: GameflowSnapshot }) => void)({
      payload: gameflowSnapshot,
    })
    ;(calls[1]?.[1] as (event: { payload: null }) => void)({ payload: null })
    expect(listener).toHaveBeenNthCalledWith(1, { type: 'updated', snapshot: gameflowSnapshot })
    expect(listener).toHaveBeenNthCalledWith(2, { type: 'lobby', lobby: null })

    off()
    expect(unlisten).toHaveBeenCalledTimes(4)
  })
})

describe('IPC trust boundaries and subscription cleanup', () => {
  beforeEach(() => {
    invokeMock.mockReset()
    listenMock.mockReset()
  })

  it('preserves a known business code without exposing the native message', async () => {
    invokeMock.mockRejectedValue({ code: 'authentication_failed', message: 'token=secret; stack' })
    await expect(tauriLcuAdapter.startMonitoring()).rejects.toMatchObject({
      code: 'lcu.authentication_failed',
      message: '客户端认证失败，请重新连接',
    })
  })

  it('rejects malformed command results before they enter application state', async () => {
    invokeMock.mockResolvedValue({ ...lcuStatus, revision: '4' })
    await expect(tauriLcuAdapter.getConnectionStatus()).rejects.toMatchObject({
      code: 'lcu.invalid_response',
    })
    invokeMock.mockResolvedValue({ ...gameflowSnapshot, session: { sessionKey: 'incomplete' } })
    await expect(tauriGameflowAdapter.getSnapshot()).rejects.toMatchObject({
      code: 'lcu.invalid_response',
    })
  })

  it('drops malformed events and reports a sanitized error', async () => {
    listenMock.mockResolvedValue(vi.fn())
    const listener = vi.fn()
    const onError = vi.fn()
    const stop = await tauriLcuAdapter.subscribe(listener, onError)
    const handler = listenMock.mock.calls[0]?.[1] as (event: { payload: unknown }) => void
    handler({ payload: { ...lcuStatus, status: 'invented' } })
    expect(listener).not.toHaveBeenCalled()
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ code: 'lcu.invalid_response' }))
    handler({ payload: lcuStatus })
    expect(listener).toHaveBeenCalledWith(lcuStatus)
    stop()
  })

  it('releases earlier subscriptions when a later subscription fails', async () => {
    const stop = vi.fn()
    listenMock.mockResolvedValueOnce(stop).mockRejectedValueOnce(new Error('raw host details'))
    await expect(tauriGameflowAdapter.subscribe(vi.fn())).rejects.toMatchObject({
      code: 'lcu.ipc_failed',
    })
    expect(stop).toHaveBeenCalledOnce()
  })
})

describe('history IPC contract', () => {
  beforeEach(() => {
    invokeMock.mockReset()
  })
  it('validates success and rejects malformed player statistics', async () => {
    const snapshot = testHistorySnapshot()
    invokeMock.mockResolvedValue(snapshot)
    await expect(tauriHistoryAdapter.getMatchHistory()).resolves.toEqual(snapshot)
    expect(invokeMock).toHaveBeenCalledWith('lcu_get_match_history')
    invokeMock.mockResolvedValue({
      ...snapshot,
      matches: [{ ...snapshot.matches[0], kills: '12' }],
    })
    await expect(tauriHistoryAdapter.getMatchHistory()).rejects.toMatchObject({
      code: 'lcu.invalid_response',
    })
    invokeMock.mockRejectedValue({ code: 'not_logged_in', message: 'private host message' })
    await expect(tauriHistoryAdapter.getMatchHistory()).rejects.toMatchObject({
      code: 'lcu.not_logged_in',
      message: '请先登录英雄联盟客户端后重试',
    })
  })
})

describe('home profile IPC contract', () => {
  beforeEach(() => {
    invokeMock.mockReset()
  })
  it('validates successful profiles and rejects malformed native data', async () => {
    const profile = {
      accountKey: 'account-1',
      displayName: '真实玩家#CN1',
      summonerLevel: 321,
      updatedAt: 100,
    }
    invokeMock.mockResolvedValueOnce(profile)
    await expect(tauriHomeAdapter.getHomeSnapshot()).resolves.toEqual(profile)
    expect(invokeMock).toHaveBeenCalledWith('lcu_get_home_snapshot')
    for (const malformed of [
      { ...profile, accountKey: '' },
      { ...profile, summonerLevel: -1 },
      { ...profile, displayName: [] },
    ]) {
      invokeMock.mockResolvedValueOnce(malformed)
      await expect(tauriHomeAdapter.getHomeSnapshot()).rejects.toMatchObject({
        code: 'lcu.invalid_response',
      })
    }
  })
  it('normalizes business and unknown host errors', async () => {
    invokeMock.mockRejectedValueOnce({ code: 'not_logged_in', message: 'secret' })
    await expect(tauriHomeAdapter.getHomeSnapshot()).rejects.toMatchObject({
      code: 'lcu.not_logged_in',
    })
    invokeMock.mockRejectedValueOnce(new Error('secret'))
    await expect(tauriHomeAdapter.getHomeSnapshot()).rejects.toMatchObject({
      code: 'lcu.home_failed',
      message: 'LCU IPC failed',
    })
  })
})

describe('participant IPC contract', () => {
  beforeEach(() => {
    invokeMock.mockReset()
  })
  it('validates unique roster identities, statuses and names', async () => {
    const snapshot = {
      accountKey: 'account-1',
      lobbyKey: 'room-1',
      completeness: 'complete',
      evidence: 'custom_teams',
      issue: null,
      eligibleCount: 1,
      unresolvedCount: 0,
      context: { sessionKey: 'session-1', connectionGeneration: 1 },
      status: 'custom',
      updatedAt: 1,
      players: [{ id: 'one', name: 'Player' }],
    }
    invokeMock.mockResolvedValueOnce(snapshot)
    await expect(tauriParticipantsAdapter.getCustomParticipants()).resolves.toEqual(snapshot)
    expect(invokeMock).toHaveBeenCalledWith('lcu_get_custom_participants')
    for (const invalid of [
      { ...snapshot, players: [...snapshot.players, ...snapshot.players] },
      { ...snapshot, status: 'not_custom' },
      { ...snapshot, players: [{ id: '', name: 'Bad' }] },
      { ...snapshot, eligibleCount: 8 },
      { ...snapshot, unresolvedCount: 1 },
      { ...snapshot, context: null },
      { ...snapshot, evidence: 'members' },
      { ...snapshot, issue: 'unexpected_reason' },
    ]) {
      invokeMock.mockResolvedValueOnce(invalid)
      await expect(tauriParticipantsAdapter.getCustomParticipants()).rejects.toMatchObject({
        code: 'lcu.invalid_response',
      })
    }
  })
  it('normalizes business and unknown errors without leaking host messages', async () => {
    invokeMock.mockRejectedValueOnce({ code: 'account_changed', message: 'secret' })
    await expect(tauriParticipantsAdapter.getCustomParticipants()).rejects.toMatchObject({
      code: 'lcu.account_changed',
    })
    invokeMock.mockRejectedValueOnce(new Error('secret'))
    await expect(tauriParticipantsAdapter.getCustomParticipants()).rejects.toMatchObject({
      code: 'lcu.participants_failed',
      message: 'LCU IPC failed',
    })
  })
})

describe('settlement IPC contract', () => {
  beforeEach(() => {
    invokeMock.mockReset()
  })
  const request = {
    gameId: TEST_SETTLEMENT_ID,
    accountKey: TEST_SETTLEMENT_ACCOUNT,
    rule: 'tail' as const,
  }
  it('preserves exact damage strings and rejects incomplete, lossy or inconsistent responses', async () => {
    const snapshot = testSettlement()
    invokeMock.mockResolvedValueOnce(snapshot)
    await expect(tauriSettlementAdapter.getSettlement(request)).resolves.toEqual(snapshot)
    expect(invokeMock).toHaveBeenCalledWith('lcu_get_settlement', request)
    for (const malformed of [
      { ...snapshot, players: [snapshot.players[0]] },
      {
        ...snapshot,
        players: snapshot.players.map((player) => ({ ...player, damage: Number(player.damage) })),
      },
      { ...snapshot, appliedRule: 'lucky', rankingStatus: 'missing_lucky' },
      { ...snapshot, id: '18446744073709551616' },
    ]) {
      invokeMock.mockResolvedValueOnce(malformed)
      await expect(tauriSettlementAdapter.getSettlement(request)).rejects.toMatchObject({
        code: 'lcu.invalid_response',
      })
    }
  })
  it('preserves pending/unavailable codes and missing-damage snapshots without fabricated ranks', async () => {
    for (const code of ['settlement_pending', 'settlement_unavailable', 'timeout', 'http_status']) {
      invokeMock.mockRejectedValueOnce({ code, message: 'secret' })
      await expect(tauriSettlementAdapter.getSettlement(request)).rejects.toMatchObject({
        code: `lcu.${code}`,
      })
    }
    const partial = testSettlement({ rankingStatus: 'missing_damage' })
    partial.players = partial.players.map((player) => ({
      ...player,
      damage: null,
      rank: null,
      ruleValue: null,
    }))
    invokeMock.mockResolvedValueOnce(partial)
    await expect(tauriSettlementAdapter.getSettlement(request)).resolves.toEqual(partial)
    invokeMock.mockResolvedValueOnce({ ...partial, rankingStatus: 'ready' })
    await expect(tauriSettlementAdapter.getSettlement(request)).rejects.toMatchObject({
      code: 'lcu.invalid_response',
    })
  })
  it('normalizes business and unknown host failures', async () => {
    invokeMock.mockRejectedValueOnce({ code: 'account_changed', message: 'secret' })
    await expect(tauriSettlementAdapter.getSettlement(request)).rejects.toMatchObject({
      code: 'lcu.account_changed',
    })
    invokeMock.mockRejectedValueOnce(new Error('secret'))
    await expect(tauriSettlementAdapter.getSettlement(request)).rejects.toMatchObject({
      code: 'lcu.settlement_failed',
      message: 'LCU IPC failed',
    })
  })
})

describe('native settings updater bridge', () => {
  it('validates native state and never sends a URL or installer bytes from the frontend', async () => {
    const result = testUpdateSnapshot({
      revision: 1,
      phase: 'available',
      latest: '0.2.0',
      canDownload: true,
    })
    invokeMock.mockResolvedValueOnce(result)
    await expect(tauriSettingsAdapter.checkUpdate()).resolves.toEqual(result)
    expect(invokeMock).toHaveBeenLastCalledWith('app_check_update')
    for (const invalid of [
      { ...result, latest: null },
      { ...result, phase: 'downloading' },
      { ...result, canInstall: true },
      { ...result, downloaded: -1 },
    ]) {
      invokeMock.mockResolvedValueOnce(invalid)
      await expect(tauriSettingsAdapter.getUpdateState()).rejects.toMatchObject({
        code: 'update.invalid_response',
      })
    }
    invokeMock.mockResolvedValueOnce(result)
    const onProgress = vi.fn()
    await tauriSettingsAdapter.downloadUpdate(onProgress)
    const [command, args] = invokeMock.mock.lastCall!
    expect(command).toBe('app_download_update')
    expect(Object.keys(args)).toEqual(['onProgress'])
    args.onProgress.onmessage({ malformed: true })
    expect(onProgress).not.toHaveBeenCalled()
    args.onProgress.onmessage(
      testUpdateSnapshot({ phase: 'downloading', revision: 2, latest: '0.2.0', downloaded: 10 }),
    )
    expect(onProgress).toHaveBeenCalledOnce()
    invokeMock.mockResolvedValueOnce(testUpdateSnapshot({ phase: 'installing' }))
    await tauriSettingsAdapter.installUpdate()
    expect(invokeMock).toHaveBeenLastCalledWith('app_install_update')
  })
  it('normalizes failures without exposing host details', async () => {
    invokeMock.mockRejectedValueOnce({ code: 'update.game_active', message: 'private detail' })
    await expect(tauriSettingsAdapter.installUpdate()).rejects.toMatchObject({
      code: 'update.game_active',
      message: 'Update operation failed',
    })
    invokeMock.mockRejectedValueOnce(new Error('private detail'))
    await expect(tauriSettingsAdapter.cancelUpdate()).rejects.toMatchObject({
      code: 'update.ipc_failed',
    })
  })
})
