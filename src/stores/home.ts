import { demoHome } from '@/mocks/client-demo'
import { isRuntimeFlow } from '@/services/runtime-source'
import { useGameInfo } from '@/composables/useGameInfo'
import { resolveGameMode } from '@/shared/lib/game-mode'
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
  const snapshot = shallowRef<HomeSnapshot | null>(connection.isDesktopRuntime ? null : demoHome())
  const isLoading = ref(false)
  const errorCode = ref<string | null>(null)
  let generation = 0
  let pending: Promise<void> | null = null
  let disconnectedFlowRevision = -1

  const liveFlow = computed(() => {
    const flow = connection.gameflowSnapshot
    return connection.canReadAccountData &&
      flow?.connected &&
      isRuntimeFlow(flow) &&
      flow.revision > disconnectedFlowRevision &&
      !flow.code
      ? flow
      : null
  })
  const lobby = computed(() =>
    liveFlow.value?.phase === 'lobby' ? (liveFlow.value.session?.lobby ?? null) : null,
  )
  const currentMetadata = computed(() => {
    const session = liveFlow.value?.session
    if (!session || liveFlow.value?.phase === 'none') return null
    return session.modeContext ?? { queueId: null, mapId: null }
  })
  const gameInfo = useGameInfo(currentMetadata, () => snapshot.value?.accountKey)
  const gameMode = computed<HomeGameMode | null>(() => {
    const session = liveFlow.value?.session
    if (!session) return null
    const mode = session.modeContext
    return mode ? resolveGameMode(mode) : null
  })
  const homeView = computed<HomeViewModel>(() => ({
    isConnected: connection.isConnected,
    summonerName: snapshot.value?.displayName ?? null,
    roomPhase: liveFlow.value?.phase ?? null,
    gameMode: gameMode.value,
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
    if (!connection.canReadAccountData) return Promise.resolve()
    const request = ++generation
    isLoading.value = true
    errorCode.value = null
    pending = (async () => {
      try {
        const result = await getHomeSnapshot()
        if (request !== generation) return
        if (connection.isDesktopRuntime && result.source !== 'real')
          throw new LcuServiceError('lcu.invalid_response', 'Unexpected home source')
        snapshot.value = result.snapshot
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
    () => connection.canReadAccountData,
    (connected) => {
      if (!connected) {
        disconnectedFlowRevision = connection.gameflowSnapshot?.revision ?? -1
        clearRealHome()
      }
    },
    { flush: 'sync' },
  )
  onScopeDispose(clearRealHome)
  return {
    readyCheckStatus: computed(() =>
      liveFlow.value?.phase === 'ready_check' ? liveFlow.value.readyCheckStatus : null,
    ),
    gameInfo,
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
