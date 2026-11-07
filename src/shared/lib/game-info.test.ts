import { describe, expect, it } from 'vitest'
import { resolveGameInfo } from './game-info'
import { isGameMetadata } from '@/shared/ipc/metadata-contract'
import { isLobby } from '@/shared/ipc/contracts'
import { homeFlow } from '../../../tests/fixtures/home-contract'

describe('map and game type presentation', () => {
  it('uses actual map IDs independently of queues and never guesses from ARAM', () => {
    expect(resolveGameInfo({ queueId: 2400, mapId: 11 })).toMatchObject({
      gameTypeLabel: '海克斯大乱斗',
      mapLabel: '召唤师峡谷',
    })
    expect(resolveGameInfo({ queueId: 2400, mapId: null }).mapLabel).toBe('待客户端确认')
    expect(resolveGameInfo({ queueId: null, mapId: 12, gameMode: 'ARAM' })).toMatchObject({
      gameTypeLabel: '待客户端确认',
      mapLabel: '嚎哭深渊',
    })
    expect(resolveGameInfo(null)).toMatchObject({ gameTypeLabel: '—', mapLabel: '—' })
  })
  it('accepts localized metadata for matching IDs, including new queues and maps', () => {
    const input = { queueId: 9999, mapId: 999 }
    expect(
      resolveGameInfo(input, { ...input, queueName: '新玩法', mapName: '新地图' }),
    ).toMatchObject({
      gameTypeLabel: '新玩法',
      mapLabel: '新地图',
      queueNameSource: 'client',
      mapNameSource: 'client',
    })
    expect(
      resolveGameInfo(input, {
        queueId: 2400,
        mapId: 12,
        queueName: '海克斯大乱斗',
        mapName: '嚎哭深渊',
      }),
    ).toMatchObject({ gameTypeLabel: '未知游戏类型', mapLabel: '未知地图' })
  })
  it('falls back for internal names and preserves custom-room semantics', () => {
    expect(
      resolveGameInfo(
        { queueId: 450, mapId: 12 },
        { queueId: 450, mapId: 12, queueName: 'ARAM', mapName: 'HA' },
      ),
    ).toMatchObject({
      gameTypeLabel: '极地大乱斗',
      mapLabel: '嚎哭深渊',
      queueNameSource: 'fallback',
    })
    for (const input of [
      { queueId: 0, mapId: 12 },
      { queueId: 450, mapId: 12, gameType: 'CUSTOM_GAME' },
      { queueId: null, mapId: 11, isCustomGame: true },
    ]) {
      expect(resolveGameInfo(input).gameTypeLabel).toBe('自定义')
    }
    expect(resolveGameInfo({ queueId: 0, mapId: 12, gameType: 'MATCHED_GAME' }).gameTypeLabel).toBe(
      '未知游戏类型',
    )
  })
  it.each([-1, 0, 1.5, Number.MAX_SAFE_INTEGER + 1])(
    'rejects invalid map ID %s at IPC and display boundaries',
    (id) => {
      expect(resolveGameInfo({ queueId: 2400, mapId: id }).mapLabel).toBe('待客户端确认')
      expect(isLobby({ ...homeFlow().session?.lobby, mapId: id })).toBe(false)
      expect(isGameMetadata({ queueId: 2400, mapId: id, queueName: null, mapName: null })).toBe(
        false,
      )
    },
  )
})
