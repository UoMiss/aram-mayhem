import { describe, expect, it } from 'vitest'
import { i18n } from './index'
import { GAMEFLOW_PHASE_KEYS } from './labels'
import zhCN from './locales/zh-CN'

function leafKeys(value: unknown, prefix = ''): string[] {
  if (typeof value === 'string') return [prefix]
  if (!value || typeof value !== 'object') return []
  return Object.entries(value).flatMap(([key, child]) =>
    leafKeys(child, prefix ? `${prefix}.${key}` : key),
  )
}

function leafValues(value: unknown): string[] {
  if (typeof value === 'string') return [value]
  if (!value || typeof value !== 'object') return []
  return Object.values(value).flatMap(leafValues)
}

describe('zh-CN i18n resource', () => {
  it('registers only zh-CN and no other locale', () => {
    expect(i18n.global.availableLocales).toEqual(['zh-CN'])
    expect(i18n.global.locale.value).toBe('zh-CN')
    expect(i18n.global.fallbackLocale.value).toBe('zh-CN')
  })

  it('contains only non-empty leaf messages and every key resolves', () => {
    const keys = leafKeys(zhCN)
    const values = leafValues(zhCN)

    expect(keys.length).toBeGreaterThan(60)
    expect(values.every((value) => value.trim().length > 0)).toBe(true)
    expect(keys.every((key) => i18n.global.te(key))).toBe(true)
    expect(i18n.global.te('missing.key')).toBe(false)
  })

  it('preserves the original Chinese copy and interpolation spacing', () => {
    const t = i18n.global.t

    expect(t('connection.retryHint', { seconds: 5 })).toBe('连接详情 · 每 5 秒自动重试')
    expect(t('history.recentHint', { count: 20 })).toBe('仅显示最近 20 局 · 点击查看结算')
    expect(t('matchDetail.redPacketNote', { count: 5 })).toBe('本局最后 5 名，请准备好你们的红包！')
    expect(t('team.participantCount', { count: 8 })).toBe('8 人')
    expect(t('team.groupCount', { count: 4 })).toBe('4 人')
    expect(t('team.shuffling', { count: 3 })).toBe('组队中 3s')
    expect(t('team.revealing')).toBe('揭晓中...')
    expect(t('settings.updateLatest')).toBe('已是最新版本！')
    expect(t('rules.none')).toBe('未选择规则')
    expect(t('matchDetail.teams.red')).toBe('我方失败')
    expect(t('matchDetail.stats.taken')).toBe('承伤')
  })
})

describe('gameflow zh-CN labels', () => {
  it('maps every phase contract to a non-empty zh-CN string', () => {
    for (const [phase, key] of Object.entries(GAMEFLOW_PHASE_KEYS)) {
      const value = i18n.global.t(key)
      expect(value, phase).not.toBe(key)
      expect(value.trim().length, phase).toBeGreaterThan(0)
    }
  })
})
