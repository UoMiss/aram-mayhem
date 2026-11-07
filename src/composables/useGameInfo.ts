import { computed, toValue, watch, type MaybeRefOrGetter } from 'vue'
import { useGameInfoStore } from '@/stores/game-info'
import { resolveGameInfo, validMapId, validQueueId } from '@/shared/lib/game-info'
import type { GameInfoInput } from '@/types/game-info'

export function useGameInfo(
  input: MaybeRefOrGetter<GameInfoInput | null>,
  account: MaybeRefOrGetter<string | null | undefined>,
) {
  const store = useGameInfoStore()
  const request = computed(() => {
    const info = toValue(input)
    const accountKey = toValue(account)
    if (!info || !accountKey) return null
    const queueId = validQueueId(info.queueId) ? info.queueId : null
    const mapId = validMapId(info.mapId) ? info.mapId : null
    return queueId === null && mapId === null ? null : { accountKey, queueId, mapId }
  })
  watch(
    [request, () => store.scope],
    () => {
      if (request.value) void store.ensure(request.value)
    },
    { immediate: true },
  )
  return computed(() =>
    resolveGameInfo(toValue(input), request.value ? store.records[store.key(request.value)] : null),
  )
}
