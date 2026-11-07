import { isUpdateSnapshot } from '@/shared/ipc/settings-contract'
import type { GameMetadataRequest } from '@/types/game-info'
import { isGameMetadata } from '@/shared/ipc/metadata-contract'
import type { MatchRuleRecord, OpeningChoice } from '@/types/match-rule-api'
import { isSettlementSnapshot } from '@/shared/ipc/settlement-contract'
import type { SettlementRequest } from '@/types/settlement-api'
import { isParticipantSnapshot } from '@/shared/ipc/participants-contract'
import { isHomeSnapshot } from '@/shared/ipc/home-contract'
import { isHistorySnapshot } from '@/shared/ipc/history-contract'
import {
  isAppHealth,
  isLcuStatus,
  isGameflow,
  isLobby,
  isChampionSelect,
  isSession,
  nullable,
  parseContract,
} from '@/shared/ipc/contracts'
import { invoke, Channel } from '@tauri-apps/api/core'
import type { UpdateSnapshot } from '@/types/settings'
import { listen } from '@tauri-apps/api/event'
import { DesktopServiceError, normalizeLcuError } from '@/services/desktop-error'
import type { AppHealth, DesktopAdapter } from '@/types/desktop'
import {
  GAMEFLOW_CHAMP_SELECT_EVENT,
  GAMEFLOW_LOBBY_EVENT,
  GAMEFLOW_SESSION_ENDED_EVENT,
  GAMEFLOW_UPDATED_EVENT,
  LCU_STATUS_EVENT,
  type GameflowAdapter,
  type GameflowEventListener,
  type LcuAdapter,
  type LcuStatusListener,
  type LcuUnlisten,
} from '@/types/lcu'

/** The only module allowed to know the Rust command name. */
export const tauriAdapter: DesktopAdapter = {
  async getHealth(): Promise<AppHealth> {
    try {
      return parseContract(await invoke<unknown>('app_health_check'), isAppHealth)
    } catch {
      // Never surface a raw Rust/host exception or stack trace to the page.
      throw new DesktopServiceError('desktop.ipc_failed', 'Desktop health check failed')
    }
  },
}

export async function exitDesktopApp() {
  try {
    await invoke('app_exit')
  } catch {
    throw new DesktopServiceError('desktop.ipc_failed', 'Desktop exit failed')
  }
}

/** The only frontend module that knows the Rust LCU command/event names. */
export const tauriLcuAdapter: LcuAdapter = {
  async getConnectionStatus() {
    try {
      return parseContract(await invoke<unknown>('lcu_get_connection_status'), isLcuStatus)
    } catch (error) {
      throw normalizeLcuError(error, 'lcu.status_failed')
    }
  },
  async startMonitoring() {
    try {
      return parseContract(await invoke<unknown>('lcu_start_monitoring'), isLcuStatus)
    } catch (error) {
      throw normalizeLcuError(error, 'lcu.start_failed')
    }
  },
  async stopMonitoring() {
    try {
      return parseContract(await invoke<unknown>('lcu_stop_monitoring'), isLcuStatus)
    } catch (error) {
      throw normalizeLcuError(error, 'lcu.stop_failed')
    }
  },
  async subscribe(listener: LcuStatusListener, onError): Promise<LcuUnlisten> {
    try {
      return await listen<unknown>(LCU_STATUS_EVENT, (event) => {
        try {
          listener(parseContract(event.payload, isLcuStatus))
        } catch (error) {
          onError?.(normalizeLcuError(error))
        }
      })
    } catch (error) {
      throw normalizeLcuError(error, 'lcu.subscribe_failed')
    }
  },
}

/** The only frontend module that knows the Rust gameflow command/event names. */
export const tauriGameflowAdapter: GameflowAdapter = {
  async getSnapshot() {
    try {
      return parseContract(await invoke<unknown>('lcu_get_gameflow_snapshot'), isGameflow)
    } catch (error) {
      throw normalizeLcuError(error)
    }
  },
  async startMonitoring() {
    try {
      return parseContract(await invoke<unknown>('lcu_start_gameflow_monitoring'), isGameflow)
    } catch (error) {
      throw normalizeLcuError(error)
    }
  },
  async stopMonitoring() {
    try {
      return parseContract(await invoke<unknown>('lcu_stop_gameflow_monitoring'), isGameflow)
    } catch (error) {
      throw normalizeLcuError(error)
    }
  },
  async subscribe(listener: GameflowEventListener, onError): Promise<LcuUnlisten> {
    const unlisten: LcuUnlisten[] = []
    function deliver(callback: () => void) {
      try {
        callback()
      } catch (error) {
        onError?.(normalizeLcuError(error))
      }
    }
    try {
      unlisten.push(
        await listen<unknown>(GAMEFLOW_UPDATED_EVENT, (event) =>
          deliver(() =>
            listener({ type: 'updated', snapshot: parseContract(event.payload, isGameflow) }),
          ),
        ),
      )
      unlisten.push(
        await listen<unknown>(GAMEFLOW_LOBBY_EVENT, (event) =>
          deliver(() =>
            listener({ type: 'lobby', lobby: parseContract(event.payload, nullable(isLobby)) }),
          ),
        ),
      )
      unlisten.push(
        await listen<unknown>(GAMEFLOW_CHAMP_SELECT_EVENT, (event) =>
          deliver(() =>
            listener({
              type: 'champ-select',
              championSelect: parseContract(event.payload, nullable(isChampionSelect)),
            }),
          ),
        ),
      )
      unlisten.push(
        await listen<unknown>(GAMEFLOW_SESSION_ENDED_EVENT, (event) =>
          deliver(() =>
            listener({
              type: 'session-ended',
              session: parseContract(event.payload, nullable(isSession)),
            }),
          ),
        ),
      )
      return () => {
        for (const stop of unlisten) stop()
      }
    } catch (error) {
      for (const stop of unlisten) stop()
      throw normalizeLcuError(error)
    }
  },
}

/** Read-only history commands share the same validated IPC boundary. */
export const tauriHistoryAdapter = {
  async getMatchHistory() {
    try {
      return parseContract(await invoke<unknown>('lcu_get_match_history'), isHistorySnapshot)
    } catch (error) {
      throw normalizeLcuError(error, 'lcu.history_failed')
    }
  },
}

export const tauriHomeAdapter = {
  async getHomeSnapshot() {
    try {
      return parseContract(await invoke<unknown>('lcu_get_home_snapshot'), isHomeSnapshot)
    } catch (error) {
      throw normalizeLcuError(error, 'lcu.home_failed')
    }
  },
}

export const tauriParticipantsAdapter = {
  async getCustomParticipants() {
    try {
      return parseContract(
        await invoke<unknown>('lcu_get_custom_participants'),
        isParticipantSnapshot,
      )
    } catch (error) {
      throw normalizeLcuError(error, 'lcu.participants_failed')
    }
  },
}

export const tauriSettlementAdapter = {
  async getSettlement(request: SettlementRequest) {
    try {
      return parseContract(
        await invoke<unknown>('lcu_get_settlement', { ...request }),
        isSettlementSnapshot,
      )
    } catch (error) {
      throw normalizeLcuError(error, 'lcu.settlement_failed')
    }
  },
}

function updateError(error: unknown): DesktopServiceError {
  const codes = [
    'update.busy',
    'update.not_ready',
    'update.denied',
    'update.unsupported',
    'update.game_active',
  ]
  const code =
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    typeof error.code === 'string' &&
    codes.includes(error.code)
      ? error.code
      : 'update.ipc_failed'
  return new DesktopServiceError(code, 'Update operation failed')
}
async function updateCommand(
  command: string,
  args?: Record<string, unknown>,
): Promise<UpdateSnapshot> {
  try {
    const result = args ? await invoke<unknown>(command, args) : await invoke<unknown>(command)
    if (!isUpdateSnapshot(result))
      throw new DesktopServiceError('update.invalid_response', 'Invalid update response')
    return result
  } catch (error) {
    if (error instanceof DesktopServiceError) throw error
    throw updateError(error)
  }
}

export const tauriSettingsAdapter = {
  async setAutoAccept(enabled: boolean) {
    try {
      return parseContract(
        await invoke<unknown>('lcu_set_auto_accept', { enabled }),
        (value): value is boolean => typeof value === 'boolean',
      )
    } catch (error) {
      throw normalizeLcuError(error, 'lcu.auto_accept_failed')
    }
  },
  getUpdateState() {
    return updateCommand('app_get_update_state')
  },
  checkUpdate() {
    return updateCommand('app_check_update')
  },
  downloadUpdate(onProgress: (snapshot: UpdateSnapshot) => void) {
    const channel = new Channel<unknown>()
    channel.onmessage = (value) => {
      if (isUpdateSnapshot(value)) onProgress(value)
    }
    return updateCommand('app_download_update', { onProgress: channel })
  },
  installUpdate() {
    return updateCommand('app_install_update')
  },
  async cancelUpdate() {
    try {
      await invoke('app_cancel_update')
    } catch (error) {
      throw updateError(error)
    }
  },
  async openReleasePage() {
    try {
      await invoke('app_open_release_page')
    } catch (error) {
      throw updateError(error)
    }
  },
}

function isLockedMatchRule(value: unknown): value is MatchRuleRecord {
  if (!value || typeof value !== 'object') return false
  const record = value as Record<string, unknown>
  return (
    typeof record.accountKey === 'string' &&
    /^[A-Za-z0-9_-]{1,128}$/.test(record.accountKey) &&
    typeof record.gameId === 'string' &&
    /^[1-9][0-9]{0,19}$/.test(record.gameId) &&
    (record.rule === null ||
      record.rule === 'damage' ||
      record.rule === 'tail' ||
      record.rule === 'lucky') &&
    (record.luckyDigit === null || (record.rule === 'lucky' && isLuckyDigit(record.luckyDigit)))
  )
}

function isLuckyDigit(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 9
}

export const tauriMatchRuleAdapter = {
  async lock(choice: OpeningChoice) {
    try {
      const record = parseContract(
        await invoke<unknown>('lcu_lock_match_rule', { choice }),
        isLockedMatchRule,
      )
      if (record.gameId !== choice.gameId) throw new Error('Mismatched locked match')
      return record
    } catch (error) {
      throw normalizeLcuError(error, 'lcu.match_rule_failed')
    }
  },
  async get(gameId: string) {
    try {
      const record = parseContract(
        await invoke<unknown>('lcu_get_locked_match_rule', { gameId }),
        nullable(isLockedMatchRule),
      )
      if (record && record.gameId !== gameId) throw new Error('Mismatched locked match')
      return record
    } catch (error) {
      throw normalizeLcuError(error, 'lcu.match_rule_failed')
    }
  },
}

export const tauriMetadataAdapter = {
  async get(request: GameMetadataRequest) {
    try {
      const result = parseContract(
        await invoke<unknown>('lcu_get_game_metadata', { ...request }),
        isGameMetadata,
      )
      if (result.queueId !== request.queueId || result.mapId !== request.mapId)
        throw new Error('Metadata IDs changed')
      return result
    } catch (error) {
      throw normalizeLcuError(error, 'lcu.metadata_failed')
    }
  },
}
