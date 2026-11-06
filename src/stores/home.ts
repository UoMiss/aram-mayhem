import { computed, onScopeDispose, ref, shallowRef, watch } from 'vue'
import { defineStore } from 'pinia'
import { createMockHomeProfile } from '@/mocks/home'
import { getHomeSnapshot } from '@/services/home.service'
import { LcuServiceError, normalizeLcuError } from '@/services/desktop-error'
import type { HomeProfile, HomeViewModel, HomeGameMode } from '@/types/home'
import type { HomeSnapshot } from '@/types/home-api'
import { useConnectionStore } from './connection'

export const useHomeStore = defineStore('home', () => {
  const connection = useConnectionStore()
  const homeProfile = ref<HomeProfile | null>(
    connection.isDesktopRuntime ? null : createMockHomeProfile(),
  )
  const snapshot = shallowRef<HomeSnapshot | null>(null)
  const isLoading = ref(false)
  const errorCode = ref<string | null>(null)
  let generation = 0
  let pending: Promise<void> | null = null
  let disconnectedFlowRevision = -1

  const liveFlow = computed(() => {
    const flow = connection.gameflowSnapshot
    return connection.isRealLcuConnected &&
      flow?.connected &&
      flow.source === 'real' &&
      !flow.simulated &&
      flow.revision > disconnectedFlowRevision &&
      !flow.code
      ? flow
      : null
  })
  const lobby = computed(() =>
    liveFlow.value?.phase === 'lobby' ? (liveFlow.value.session?.lobby ?? null) : null,
  )
  const gameMode = computed<HomeGameMode | null>(() => {
    const room = lobby.value ?? liveFlow.value?.session?.game
    if (!room) return null
    if (room.queueId === 2400) return 'hex'
    if (room.queueId === 0) return 'custom'
    if (room.queueId === 450 || room.gameMode === 'ARAM') return 'aram'
    if (room.queueId !== null || room.gameMode) return 'other'
    return null
  })
  const homeView = computed<HomeViewModel>(() => ({
    isConnected: connection.isConnected,
    summonerName: connection.isDesktopRuntime
      ? (snapshot.value?.displayName ?? null)
      : (homeProfile.value?.summonerName ?? null),
    roomPhase: connection.isDesktopRuntime
      ? (liveFlow.value?.phase ?? null)
      : (homeProfile.value?.roomPhase ?? null),
    gameMode: connection.isDesktopRuntime ? gameMode.value : (homeProfile.value?.gameMode ?? null),
  }))

  function clearRealHome() {
    generation++
    pending = null
    isLoading.value = false
    errorCode.value = null
    snapshot.value = null
  }
  function loadHome(): Promise<void> {
    if (pending) return pending
    if (connection.isDesktopRuntime && !connection.isRealLcuConnected) return Promise.resolve()
    const request = ++generation
    isLoading.value = true
    errorCode.value = null
    pending = (async () => {
      try {
        const result = await getHomeSnapshot()
        if (request !== generation) return
        if (connection.isDesktopRuntime && result.source !== 'real')
          throw new LcuServiceError('lcu.invalid_response', 'Unexpected home source')
        if (result.source === 'real') snapshot.value = result.snapshot
        else homeProfile.value = result.profile
      } catch (error) {
        if (request === generation) {
          snapshot.value = null
          errorCode.value = normalizeLcuError(error, 'lcu.home_failed').code
        }
      } finally {
        if (request === generation) {
          isLoading.value = false
          pending = null
        }
      }
    })()
    return pending
  }
  watch(
    () => connection.isRealLcuConnected,
    (connected) => {
      if (connection.isDesktopRuntime && !connected) {
        disconnectedFlowRevision = connection.gameflowSnapshot?.revision ?? -1
        clearRealHome()
      }
    },
    { flush: 'sync' },
  )
  onScopeDispose(clearRealHome)
  return {
    homeProfile,
    homeView,
    snapshot,
    isLoading,
    errorCode,
    lobby,
    liveGame: computed(() => liveFlow.value?.session?.game ?? null),
    loadHome,
    clearRealHome,
  }
})
