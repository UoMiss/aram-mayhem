import { computed, onMounted, onUnmounted, ref, shallowRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { TEAM_DRAW_PLAYERS } from '@/mocks/tools'
import { useConnectionStore } from '@/stores/connection'
import { useHomeStore } from '@/stores/home'
import { getCustomParticipants } from '@/services/participants.service'
import { LcuServiceError, normalizeLcuError } from '@/services/desktop-error'
import { isParticipantSnapshot } from '@/shared/ipc/participants-contract'
import type { TeamPlayer } from '@/types/tools'
import type { ParticipantSnapshot } from '@/types/participants'

export const PARTICIPANTS_REFRESH_MS = 5000
export function useTeamParticipants(isOpen: () => boolean) {
  const connection = useConnectionStore()
  const home = useHomeStore()
  const { t } = useI18n({ useScope: 'global' })
  const isDesktop = computed(() => connection.isDesktopRuntime)
  const active = computed(() => isOpen() && isDesktop.value && connection.isRealLcuConnected)
  const snapshot = shallowRef<ParticipantSnapshot | null>(null)
  const players = shallowRef<readonly TeamPlayer[]>(isDesktop.value ? [] : TEAM_DRAW_PLAYERS)
  const status = computed(() => snapshot.value?.status ?? null)
  const isLoading = ref(false)
  const errorCode = ref<string | null>(null)
  const fingerprint = ref(isDesktop.value ? '' : 'browser-demo')
  const contextStamp = computed(() => {
    const flow = connection.gameflowSnapshot
    return JSON.stringify([
      flow?.connected,
      flow?.source,
      flow?.simulated,
      flow?.code,
      flow?.phase,
      flow?.session?.sessionKey,
      flow?.session?.connectionGeneration,
      flow?.session?.lobby?.lobbyId,
      flow?.session?.modeContext?.isCustomGame,
      home.snapshot?.accountKey,
    ])
  })
  function matchesContext(roster: ParticipantSnapshot): boolean {
    const flow = connection.gameflowSnapshot
    return !!(
      flow?.connected &&
      flow.source === 'real' &&
      !flow.simulated &&
      !flow.code &&
      flow.phase === 'lobby' &&
      flow.session?.modeContext?.isCustomGame === true &&
      roster.context &&
      roster.lobbyKey &&
      flow.session?.sessionKey === roster.context.sessionKey &&
      flow.session.connectionGeneration === roster.context.connectionGeneration &&
      flow.session.lobby?.lobbyId === roster.lobbyKey &&
      (!home.snapshot || home.snapshot.accountKey === roster.accountKey)
    )
  }
  const complete = computed(
    () =>
      !!(
        snapshot.value?.status === 'custom' &&
        snapshot.value.completeness === 'complete' &&
        matchesContext(snapshot.value)
      ),
  )
  let epoch = 0
  let pending: Promise<boolean> | null = null
  let timer: ReturnType<typeof setTimeout> | undefined
  function clear() {
    epoch++
    pending = null
    clearTimeout(timer)
    isLoading.value = false
    errorCode.value = null
    snapshot.value = null
    if (isDesktop.value) {
      players.value = []
      fingerprint.value = ''
    }
  }
  function refresh(): Promise<boolean> {
    if (!active.value) return Promise.resolve(false)
    if (pending) return pending
    clearTimeout(timer)
    const request = epoch
    const context = contextStamp.value
    isLoading.value = true
    errorCode.value = null
    pending = (async () => {
      try {
        const result = await getCustomParticipants()
        if (request !== epoch || !active.value || context !== contextStamp.value) return false
        if (result.source !== 'real' || !isParticipantSnapshot(result.snapshot))
          throw new LcuServiceError('lcu.invalid_response', 'Invalid roster')
        const roster = result.snapshot
        if (roster.context && !matchesContext(roster))
          throw new LcuServiceError('lcu.cancelled', 'Room context changed')
        const sorted = [...roster.players].sort((a, b) => a.id.localeCompare(b.id))
        snapshot.value = roster
        fingerprint.value = JSON.stringify([
          roster.accountKey,
          roster.lobbyKey,
          roster.context,
          roster.status,
          roster.completeness,
          roster.issue,
          roster.unresolvedCount,
          sorted.map((p) => p.id),
        ])
        players.value = sorted.map((player, index) => ({
          id: player.id,
          name: player.name ?? t('team.unknownPlayer', { index: index + 1 }),
        }))
        return complete.value
      } catch (error) {
        if (request !== epoch) return false
        players.value = []
        fingerprint.value = ''
        snapshot.value = null
        errorCode.value = normalizeLcuError(error, 'lcu.participants_failed').code
        return false
      } finally {
        if (request === epoch) {
          isLoading.value = false
          pending = null
          if (active.value)
            timer = setTimeout(() => {
              void refresh()
            }, PARTICIPANTS_REFRESH_MS)
        }
      }
    })()
    return pending
  }
  async function refreshFresh(): Promise<boolean> {
    if (pending) await pending
    return refresh()
  }
  onMounted(() => {
    watch(
      [active, contextStamp],
      () => {
        clear()
        if (active.value) void refresh()
      },
      { immediate: true, flush: 'sync' },
    )
  })
  onUnmounted(clear)
  return {
    players,
    status,
    snapshot,
    complete,
    isLoading,
    errorCode,
    fingerprint,
    isDesktop,
    refresh,
    refreshFresh,
  }
}
