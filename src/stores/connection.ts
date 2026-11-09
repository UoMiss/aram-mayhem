import { configureDemo, demoFlow } from '@/mocks/client-demo'
import { isRuntimeFlow } from '@/services/runtime-source'
import { computed, onScopeDispose, ref } from 'vue'
import { isTauri } from '@tauri-apps/api/core'
import { defineStore } from 'pinia'
import type { GameflowSnapshot, LcuStatusDto } from '@/types/lcu'
import { useUiStore } from './ui'
import { useHistoryStore } from './history'
import { useFeedbackStore } from './feedback'
export const CONNECT_DELAY_MS = 1500
export type ConnectionPhase = 'disconnected' | 'connecting' | 'connected'
export const useConnectionStore = defineStore('connection', () => {
  const ui = useUiStore()
  const history = useHistoryStore()
  const feedback = useFeedbackStore()
  const connectionPhase = ref<ConnectionPhase>('disconnected')
  const lcuStatus = ref<LcuStatusDto | null>(null)
  const gameflowSnapshot = ref<GameflowSnapshot | null>(null)
  const lcuBridgeError = ref<string | null>(null)
  // Once invalidated, only a healthy real gameflow observation can restore account reads.
  const isAccountInvalidated = ref(false)

  const isDesktopRuntime = computed(() => isTauri())
  const isRealLcuConnected = computed(
    () =>
      isDesktopRuntime.value &&
      lcuStatus.value?.source === 'real' &&
      lcuStatus.value.simulated === false &&
      lcuStatus.value.status === 'connected',
  )
  const canReadAccountData = computed(
    () =>
      (isDesktopRuntime.value ? isRealLcuConnected.value : connectionPhase.value === 'connected') &&
      !isAccountInvalidated.value,
  )
  const isConnected = computed(() =>
    isDesktopRuntime.value ? isRealLcuConnected.value : connectionPhase.value === 'connected',
  )
  const isConnecting = computed(() => {
    if (!isDesktopRuntime.value) return connectionPhase.value === 'connecting'
    return (
      lcuStatus.value?.status === 'discovering' ||
      lcuStatus.value?.status === 'connecting' ||
      lcuStatus.value?.status === 'reconnecting'
    )
  })

  let connectTimer: ReturnType<typeof setTimeout> | null = null
  /** 演示连接：1500ms 后进入已连接状态，重复点击会被忽略。 */
  function connect() {
    if (isDesktopRuntime.value) return
    if (connectionPhase.value !== 'disconnected') return

    feedback.hideToast()
    connectionPhase.value = 'connecting'
    connectTimer = setTimeout(() => {
      connectTimer = null
      configureDemo({})
      connectionPhase.value = 'connected'
      setGameflowSnapshot(demoFlow())
      ui.setActiveTab('home')
    }, CONNECT_DELAY_MS)
  }

  /** 回到未连接层；同时取消尚未完成的模拟连接。 */
  function disconnect() {
    if (isDesktopRuntime.value) return
    if (connectTimer) {
      clearTimeout(connectTimer)
      connectTimer = null
    }
    feedback.hideToast()
    connectionPhase.value = 'disconnected'
    ui.resetNavigation()
    history.resetHistoryView()
  }

  /** 桌面 LCU 状态；只接受不比当前旧的快照。 */
  function setLcuStatus(status: LcuStatusDto) {
    if (lcuStatus.value && status.revision < lcuStatus.value.revision) return
    lcuStatus.value = status
  }

  /** 前端桥接失败码；不包含 Rust 堆栈或任何认证信息。 */
  function setLcuError(code: string) {
    lcuBridgeError.value = code
  }

  function clearLcuError() {
    lcuBridgeError.value = null
  }

  /** Only newer gameflow snapshots may overwrite the store. */
  function setGameflowSnapshot(snapshot: GameflowSnapshot) {
    if (gameflowSnapshot.value && snapshot.revision <= gameflowSnapshot.value.revision) {
      return
    }
    gameflowSnapshot.value = snapshot
    if (isRuntimeFlow(snapshot)) {
      if (snapshot.code === 'account_changed') isAccountInvalidated.value = true
      else if (snapshot.connected && !snapshot.code) isAccountInvalidated.value = false
    }
  }

  onScopeDispose(() => {
    if (connectTimer) clearTimeout(connectTimer)
  })
  return {
    connectionPhase,
    lcuStatus,
    gameflowSnapshot,
    lcuBridgeError,
    isDesktopRuntime,
    isRealLcuConnected,
    isAccountInvalidated,
    canReadAccountData,
    isConnected,
    isConnecting,
    connect,
    disconnect,
    setLcuStatus,
    setLcuError,
    clearLcuError,
    setGameflowSnapshot,
  }
})
