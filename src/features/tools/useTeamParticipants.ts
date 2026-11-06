import { computed, onMounted, onUnmounted, ref, shallowRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { TEAM_DRAW_PLAYERS } from '@/mocks/tools'
import { useConnectionStore } from '@/stores/connection'
import { getCustomParticipants } from '@/services/participants.service'
import { LcuServiceError, normalizeLcuError } from '@/services/desktop-error'
import type { TeamPlayer } from '@/types/tools'
import type { ParticipantSnapshot } from '@/types/participants'

export const PARTICIPANTS_REFRESH_MS = 5000
export function useTeamParticipants(isOpen: () => boolean) {
  const connection = useConnectionStore()
  const { t } = useI18n({ useScope: 'global' })
  const isDesktop = computed(() => connection.isDesktopRuntime)
  const active = computed(() => isOpen() && isDesktop.value && connection.isRealLcuConnected)
  const players = shallowRef<readonly TeamPlayer[]>(isDesktop.value ? [] : TEAM_DRAW_PLAYERS)
  const status = ref<ParticipantSnapshot['status'] | null>(null)
  const isLoading = ref(false)
  const errorCode = ref<string | null>(null)
  const fingerprint = ref(isDesktop.value ? '' : 'browser-demo')
  let epoch = 0
  let pending: Promise<boolean> | null = null
  let timer: ReturnType<typeof setTimeout> | undefined
  function clear() {
    epoch++
    pending = null
    clearTimeout(timer)
    isLoading.value = false
    errorCode.value = null
    status.value = null
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
    isLoading.value = true
    errorCode.value = null
    pending = (async () => {
      try {
        const result = await getCustomParticipants()
        if (request !== epoch || !active.value) return false
        if (result.source !== 'real')
          throw new LcuServiceError('lcu.invalid_response', 'Unexpected participants source')
        const roster = result.snapshot
        const sorted = [...roster.players].sort((left, right) => left.id.localeCompare(right.id))
        fingerprint.value = JSON.stringify([
          roster.accountKey,
          roster.lobbyKey,
          roster.status,
          sorted,
        ])
        players.value = sorted.map((player, index) => ({
          id: player.id,
          name: player.name ?? t('team.unknownPlayer', { index: index + 1 }),
        }))
        status.value = roster.status
        return roster.status !== 'not_custom' && roster.status !== 'no_lobby'
      } catch (error) {
        if (request !== epoch) return false
        players.value = []
        fingerprint.value = ''
        status.value = null
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
  onMounted(() => {
    watch(
      active,
      (enabled) => {
        clear()
        if (enabled) void refresh()
      },
      { immediate: true, flush: 'sync' },
    )
    watch(
      () => connection.gameflowSnapshot?.phase,
      () => {
        if (!active.value) return
        clear()
        void refresh()
      },
      { flush: 'sync' },
    )
  })
  onUnmounted(clear)
  return { players, status, isLoading, errorCode, fingerprint, isDesktop, refresh }
}
