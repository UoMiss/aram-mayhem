import { computed, onScopeDispose, shallowRef, watch } from 'vue'
import { defineStore } from 'pinia'
import { getGameMetadata } from '@/services/game-info.service'
import type { GameMetadata, GameMetadataRequest } from '@/types/game-info'
import { useConnectionStore } from './connection'

export const useGameInfoStore = defineStore('game-info', () => {
  const connection = useConnectionStore()
  const records = shallowRef<Record<string, GameMetadata | null>>({})
  const pending = new Map<string, Promise<void>>()
  const expires = new Map<string, number>()
  let epoch = 0
  const scope = computed(
    () =>
      `${connection.isRealLcuConnected}:${connection.gameflowSnapshot?.session?.connectionGeneration ?? 0}`,
  )
  function clear() {
    epoch++
    records.value = {}
    pending.clear()
    expires.clear()
  }
  watch(scope, clear, { flush: 'sync' })
  onScopeDispose(clear)
  const key = (request: GameMetadataRequest) =>
    JSON.stringify([request.accountKey, request.queueId, request.mapId])
  function ensure(request: GameMetadataRequest): Promise<void> {
    const id = key(request)
    if (
      !connection.isRealLcuConnected ||
      !connection.isDesktopRuntime ||
      (id in records.value && (expires.get(id) ?? 0) > Date.now())
    )
      return Promise.resolve()
    const existing = pending.get(id)
    if (existing) return existing
    const token = epoch
    const work = (async () => {
      let result: GameMetadata | null = null
      try {
        result = await getGameMetadata(request)
      } catch {
        /* Names degrade independently of match data. */
      }
      if (token !== epoch) return
      if (Object.keys(records.value).length >= 512) {
        records.value = {}
        expires.clear()
      }
      expires.set(id, Date.now() + (result?.queueName || result?.mapName ? 300_000 : 30_000))
      records.value = { ...records.value, [id]: result }
    })().finally(() => {
      if (token === epoch) pending.delete(id)
    })
    pending.set(id, work)
    return work
  }
  return { records, scope, ensure, key, clear }
})
