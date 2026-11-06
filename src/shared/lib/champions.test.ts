/// <reference types="node" />
import { createHash } from 'node:crypto'
import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import catalog from '@/assets/champions/catalog.json'
import { getChampionImage, getChampionName } from './champions'
import { toHistoryItem } from './history-presentation'
import { TEST_HISTORY_MATCH } from '../../../tests/fixtures/history-contract'

const directory = fileURLToPath(new URL('../../assets/champions/', import.meta.url))
describe('bundled champion assets', () => {
  it('uses the same verified resource version for the entire roster', () => {
    expect(catalog.version).toMatch(/^\d+\.\d+\.\d+$/)
    expect(catalog.latestVersion).toBe(catalog.version)
    expect(Number.isFinite(Date.parse(catalog.latestCheckedAt))).toBe(true)
    expect(new Set(catalog.champions.map((champion) => champion.imageVersion))).toEqual(
      new Set([catalog.version]),
    )
  })

  it('ships a verified local PNG and build URL for every catalog entry', () => {
    const files = readdirSync(directory)
      .filter((file) => file.endsWith('.png'))
      .sort()
    expect(files).toEqual(catalog.champions.map((champion) => champion.file).sort())
    expect(new Set(catalog.champions.map((champion) => champion.id)).size).toBe(
      catalog.champions.length,
    )
    for (const champion of catalog.champions) {
      const bytes = readFileSync(resolve(directory, champion.file))
      expect(createHash('sha256').update(bytes).digest('hex'), champion.alias).toBe(champion.sha256)
      expect(bytes.subarray(0, 8).toString('hex'), champion.alias).toBe('89504e470d0a1a0a')
      const url = getChampionImage(champion.id)
      expect(url, champion.alias).toBeTruthy()
      expect(url).not.toMatch(/^https?:/)
    }
  })

  it('resolves previously unavailable champions and uses local Chinese names', () => {
    expect(getChampionImage(103)).toContain('Ahri')
    expect(getChampionImage(777)).toContain('Yone')
    expect(getChampionName(777)).toBe('永恩')
    const match = toHistoryItem({ ...TEST_HISTORY_MATCH, championId: 777, championName: null })
    expect(match.champion).toBe('永恩')
    expect(match.championImage).toBe(getChampionImage(777))
  })

  it('keeps the existing fallback for an unknown future champion', () => {
    const match = toHistoryItem({ ...TEST_HISTORY_MATCH, championId: 999999, championName: null })
    expect(match.championImage).toBe('')
    expect(match.champion).toBe('#999999')
    expect(getChampionName(999999)).toBeNull()
  })
})
