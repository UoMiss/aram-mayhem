import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { DesktopServiceError, LcuServiceError } from '@/services/desktop-error'
import type { AppHealth, DesktopAdapter } from '@/types/desktop'
import {
  GAMEFLOW_CHAMP_SELECT_EVENT,
  GAMEFLOW_LOBBY_EVENT,
  GAMEFLOW_SESSION_ENDED_EVENT,
  GAMEFLOW_UPDATED_EVENT,
  LCU_STATUS_EVENT,
  type ChampionSelectSnapshot,
  type GameflowAdapter,
  type GameflowEventListener,
  type GameflowSnapshot,
  type LobbySnapshot,
  type LcuAdapter,
  type LcuStatusDto,
  type LcuStatusListener,
  type LcuUnlisten,
} from '@/types/lcu'

/** The only module allowed to know the Rust command name. */
export const tauriAdapter: DesktopAdapter = {
  async getHealth(): Promise<AppHealth> {
    try {
      return await invoke<AppHealth>('app_health_check')
    } catch {
      // Never surface a raw Rust/host exception or stack trace to the page.
      throw new DesktopServiceError('desktop.ipc_failed', 'Desktop health check failed')
    }
  },
}

function lcuIpcError(code = 'lcu.ipc_failed'): LcuServiceError {
  return new LcuServiceError(code, 'LCU IPC failed')
}

/** The only frontend module that knows the Rust LCU command/event names. */
export const tauriLcuAdapter: LcuAdapter = {
  async getConnectionStatus() {
    try {
      return await invoke<LcuStatusDto>('lcu_get_connection_status')
    } catch {
      throw lcuIpcError('lcu.status_failed')
    }
  },
  async startMonitoring() {
    try {
      return await invoke<LcuStatusDto>('lcu_start_monitoring')
    } catch {
      throw lcuIpcError('lcu.start_failed')
    }
  },
  async stopMonitoring() {
    try {
      return await invoke<LcuStatusDto>('lcu_stop_monitoring')
    } catch {
      throw lcuIpcError('lcu.stop_failed')
    }
  },
  async subscribe(listener: LcuStatusListener): Promise<LcuUnlisten> {
    try {
      return await listen<LcuStatusDto>(LCU_STATUS_EVENT, (event) => listener(event.payload))
    } catch {
      throw lcuIpcError('lcu.subscribe_failed')
    }
  },
}

/** The only frontend module that knows the Rust gameflow command/event names. */
export const tauriGameflowAdapter: GameflowAdapter = {
  async getSnapshot() {
    try {
      return await invoke<GameflowSnapshot>('lcu_get_gameflow_snapshot')
    } catch {
      throw lcuIpcError()
    }
  },
  async startMonitoring() {
    try {
      return await invoke<GameflowSnapshot>('lcu_start_gameflow_monitoring')
    } catch {
      throw lcuIpcError()
    }
  },
  async stopMonitoring() {
    try {
      return await invoke<GameflowSnapshot>('lcu_stop_gameflow_monitoring')
    } catch {
      throw lcuIpcError()
    }
  },
  async subscribe(listener: GameflowEventListener): Promise<LcuUnlisten> {
    const unlisten: LcuUnlisten[] = []
    try {
      unlisten.push(
        await listen<GameflowSnapshot>(GAMEFLOW_UPDATED_EVENT, (event) =>
          listener({ type: 'updated', snapshot: event.payload }),
        ),
      )
      unlisten.push(
        await listen<LobbySnapshot | null>(GAMEFLOW_LOBBY_EVENT, (event) =>
          listener({ type: 'lobby', lobby: event.payload }),
        ),
      )
      unlisten.push(
        await listen<ChampionSelectSnapshot | null>(GAMEFLOW_CHAMP_SELECT_EVENT, (event) =>
          listener({ type: 'champ-select', championSelect: event.payload }),
        ),
      )
      unlisten.push(
        await listen<GameflowSnapshot['session']>(GAMEFLOW_SESSION_ENDED_EVENT, (event) =>
          listener({ type: 'session-ended', session: event.payload }),
        ),
      )
      return () => {
        for (const stop of unlisten) stop()
      }
    } catch {
      for (const stop of unlisten) stop()
      throw lcuIpcError()
    }
  },
}
