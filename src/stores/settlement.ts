import { computed, onScopeDispose, ref, shallowRef } from 'vue'
import { defineStore } from 'pinia'
import { getSettlement } from '@/services/settlement.service'
import { LcuServiceError, normalizeLcuError } from '@/services/desktop-error'
import type { SettlementRequest, SettlementSnapshot } from '@/types/settlement-api'
export const useSettlementStore = defineStore('settlement', () => {
  const snapshot = shallowRef<SettlementSnapshot | null>(null)
  const isLoading = ref(false)
  const errorCode = ref<string | null>(null)
  const isPostGame = ref(false)
  const status = computed(() => {
    if (isLoading.value) return 'loading'
    if (errorCode.value === 'lcu.settlement_pending') return 'pending'
    if (errorCode.value === 'lcu.settlement_unavailable') return 'unavailable'
    if (errorCode.value) return 'error'
    if (!snapshot.value) return 'idle'
    if (['missing_damage', 'missing_friends'].includes(snapshot.value.rankingStatus))
      return isPostGame.value ? 'pending' : 'unavailable'
    if (snapshot.value.rankingStatus === 'missing_lucky') return 'unavailable'
    return 'complete'
  })
  let generation = 0
  let pending: { key: string; task: Promise<void> } | null = null
  function setPostGameContext(value: boolean) {
    isPostGame.value = value
  }
  function clear() {
    generation++
    pending = null
    snapshot.value = null
    isLoading.value = false
    errorCode.value = null
    isPostGame.value = false
  }
  function load(request: SettlementRequest, postGame = false): Promise<void> {
    const key = JSON.stringify([request, postGame])
    if (pending?.key === key) return pending.task
    clear()
    const token = generation
    isLoading.value = true
    isPostGame.value = postGame
    const task = (async () => {
      try {
        const result = await getSettlement(request)
        if (token !== generation) return
        if (
          result.source !== 'real' ||
          result.snapshot.id !== request.gameId ||
          result.snapshot.accountKey !== request.accountKey ||
          (!result.snapshot.lockedRule &&
            (result.snapshot.appliedRule !== request.rule || result.snapshot.luckyDigit !== null))
        )
          throw new LcuServiceError('lcu.invalid_response', 'Unexpected settlement context')
        snapshot.value = result.snapshot
      } catch (error) {
        if (token === generation)
          errorCode.value = normalizeLcuError(error, 'lcu.settlement_failed').code
      } finally {
        if (token === generation) {
          pending = null
          isLoading.value = false
        }
      }
    })()
    pending = { key, task }
    return task
  }
  onScopeDispose(clear)
  return { snapshot, isLoading, errorCode, status, load, clear, setPostGameContext }
})
