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
import { invoke } from '@tauri-apps/api/core'
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
