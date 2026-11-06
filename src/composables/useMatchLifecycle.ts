import { onUnmounted, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { getHomeSnapshot } from '@/services/home.service'
import { getLockedMatchRule, lockMatchRule } from '@/services/match-rule.service'
import { normalizeLcuError } from '@/services/desktop-error'
import { playMatchCue } from '@/services/match-sound'
import { useConnectionStore } from '@/stores/connection'
import { useFeedbackStore } from '@/stores/feedback'
import { useHistoryStore } from '@/stores/history'
import { useMatchRulesStore } from '@/stores/match-rules'
import { useRulesStore } from '@/stores/rules'
import { useSettingsStore } from '@/stores/settings'
import type { GameSessionContext } from '@/types/lcu'
import type { OpeningChoice } from '@/types/match-rule-api'

export function useMatchLifecycle() {
  const connection = useConnectionStore()
  const history = useHistoryStore()
  const rules = useRulesStore()
  const matchRules = useMatchRulesStore()
  const feedback = useFeedbackStore()
  const settings = useSettingsStore()
  const { t } = useI18n({ useScope: 'global' })
  let lastSession: GameSessionContext | null = null
  let activeGame: { id: string; accountKey?: string } | null = null
  let opening: Omit<OpeningChoice, 'gameId'> | null = null
  let openingAttempts = 0
  let openingTimer: ReturnType<typeof setTimeout> | undefined
  let lockPending = false
  let recoveredGame: string | null = null
  let finishedGame: string | null = null
  let finishing: { id: string } | null = null
  let finishTimer: ReturnType<typeof setTimeout> | undefined
  let finishAttempts = { id: '', count: 0 }
  let generation = 0
  let disconnectedRevision = -1
  let disposed = false

  function isCurrent(token: number) {
    return !disposed && token === generation && connection.isRealLcuConnected
  }

  function resetOpening() {
    opening = null
    openingAttempts = 0
    clearTimeout(openingTimer)
    openingTimer = undefined
    lockPending = false
  }

  function saveOpening() {
    const session = lastSession
    const gameId = session?.gameId
    const choice = opening
    if (
      !choice ||
      !gameId ||
      session.sessionKey !== choice.sessionKey ||
      (session.phase !== 'game_start' && session.phase !== 'in_progress') ||
      lockPending ||
      openingTimer !== undefined ||
      !connection.isRealLcuConnected
    )
      return
    const token = generation
    lockPending = true
    openingAttempts++
    void lockMatchRule({ ...choice, gameId })
      .then((record) => {
        if (!isCurrent(token) || opening !== choice) return
        matchRules.accept(record)
        activeGame = { id: gameId, accountKey: record.accountKey }
        resetOpening()
        if (settings.settings.soundEffects) playMatchCue()
      })
      .catch((error) => {
        if (!isCurrent(token) || opening !== choice) return
        lockPending = false
        const code = normalizeLcuError(error).code
        if (
          openingAttempts < 4 &&
          code !== 'lcu.invalid_response' &&
          code !== 'lcu.account_changed'
        ) {
          openingTimer = setTimeout(() => {
            openingTimer = undefined
            saveOpening()
          }, 1500)
        } else {
          resetOpening()
          feedback.notify(t('rules.openingSaveFailed'), 'error')
        }
      })
  }

  function restoreActive(gameId: string) {
    if (opening || recoveredGame === gameId) return
    recoveredGame = gameId
    const token = generation
    void getLockedMatchRule(gameId)
      .then((record) => {
        if (isCurrent(token) && activeGame?.id === gameId && record) {
          matchRules.accept(record)
          activeGame = { id: gameId, accountKey: record.accountKey }
        }
      })
      .catch(() => undefined)
  }

  async function finish(session: GameSessionContext | null) {
    const gameId = session?.gameId
    if (
      !connection.isRealLcuConnected ||
      !gameId ||
      finishedGame === gameId ||
      finishing?.id === gameId ||
      (finishTimer !== undefined && finishAttempts.id === gameId) ||
      (activeGame && activeGame.id !== gameId)
    )
      return
    if (
      session.phase !== 'end_of_game' &&
      session.phase !== 'pre_end_of_game' &&
      session.phase !== 'waiting_for_stats'
    )
      return
    const token = generation
    const task = { id: gameId }
    if (finishAttempts.id !== gameId) finishAttempts = { id: gameId, count: 0 }
    if (finishAttempts.count >= 4) return
    finishAttempts.count++
    finishing = task
    try {
      let accountKey: string
      if (activeGame?.id === gameId) {
        const result = await getHomeSnapshot()
        if (result.source !== 'real') return
        accountKey = result.snapshot.accountKey
        if (activeGame?.accountKey && activeGame.accountKey !== accountKey) return
      } else {
        const record = await getLockedMatchRule(gameId)
        if (!record) return
        accountKey = record.accountKey
      }
      if (!isCurrent(token) || finishing !== task || (activeGame && activeGame.id !== gameId))
        return
      finishedGame = gameId
      history.openLiveSettlement(gameId, accountKey)
      if (settings.settings.soundEffects) playMatchCue()
    } catch {
      if (isCurrent(token) && finishing === task) {
        if (finishAttempts.count < 4) {
          finishTimer = setTimeout(() => {
            finishTimer = undefined
            void finish(session)
          }, 1500)
        } else {
          feedback.notify(t('matchDetail.autoUnavailable'), 'error')
        }
      }
    } finally {
      if (finishing === task) finishing = null
    }
  }

  watch(
    () => connection.isRealLcuConnected,
    (connected) => {
      if (!connected) {
        generation++
        disconnectedRevision = connection.gameflowSnapshot?.revision ?? -1
        lastSession = null
        finishing = null
        clearTimeout(finishTimer)
        finishTimer = undefined
        finishAttempts = { id: '', count: 0 }
        recoveredGame = null
        resetOpening()
        // Keep the exact observed game ID so the same round can finish after reconnecting.
      }
    },
    { flush: 'sync' },
  )

  watch(
    () => [connection.gameflowSnapshot, connection.isRealLcuConnected] as const,
    ([snapshot, connected]) => {
      if (
        !connected ||
        !snapshot?.connected ||
        snapshot.revision <= disconnectedRevision ||
        snapshot.source !== 'real' ||
        snapshot.simulated ||
        snapshot.code
      )
        return
      const session = snapshot.session
      const previous = lastSession
      lastSession = session
      if (opening && session?.sessionKey !== opening.sessionKey) resetOpening()
      if (!session) return
      const { phase, sessionKey, gameId } = session
      const justStarted =
        (phase === 'game_start' &&
          (previous?.phase !== 'game_start' || previous.sessionKey !== sessionKey)) ||
        (phase === 'in_progress' &&
          previous?.sessionKey === sessionKey &&
          previous.phase === 'champ_select')
      if (justStarted) opening = { sessionKey, rule: rules.currentRule }
      if (!gameId || !/^[1-9][0-9]{0,19}$/.test(gameId)) return
      if (phase === 'game_start' || phase === 'in_progress' || phase === 'reconnect') {
        if (activeGame?.id !== gameId) activeGame = { id: gameId }
        if (opening) saveOpening()
        else if (phase !== 'game_start' && !activeGame.accountKey) restoreActive(gameId)
      } else if (phase === 'end_of_game') {
        resetOpening()
        void finish(session)
      }
    },
    { flush: 'sync' },
  )

  onUnmounted(() => {
    disposed = true
    resetOpening()
    clearTimeout(finishTimer)
  })
  return { finish }
}
