import { computed, ref } from 'vue'
import { isTauri } from '@tauri-apps/api/core'
import { defineStore } from 'pinia'
import { MATCH_HISTORY } from '@/mocks/history'
import { createMockHomeProfile, INITIAL_SCORE_RULE } from '@/mocks/home'
import type { HistoryFilter, MatchHistoryItem } from '@/types/history'
import type { HomeProfile, HomeViewModel, ScoreRuleSelection } from '@/types/home'
import { createDefaultSettings } from '@/mocks/settings'
import type { SettingKey, SettingsFlags } from '@/types/settings'
import type { GameflowSnapshot, LcuStatusDto } from '@/types/lcu'

/** 演示连接耗时，与原版 simulateConnect() 的 1500ms 保持一致。 */
export const CONNECT_DELAY_MS = 1500
/** 与原版 #toast 相同的展示时长。 */
export const TOAST_DURATION_MS = 2500

export type ConnectionPhase = 'disconnected' | 'connecting' | 'connected'
export type AppTab = 'home' | 'history' | 'tools' | 'settings' | 'match-detail'
export type ToastTone = 'success' | 'error'

/**
 * Phase 7：在既有连接/导航/首页/战绩/工具状态上增加设置页演示开关。
 * 不包含 LCU/Tauri/API、系统开机启动或真实音效；设置仅保存在内存中。
 */
export const useAppStore = defineStore('app', () => {
  const connectionPhase = ref<ConnectionPhase>('disconnected')
  const activeTab = ref<AppTab>('home')
  const showDetails = ref(false)

  const homeProfile = ref<HomeProfile>(createMockHomeProfile())
  const currentRule = ref<ScoreRuleSelection>(INITIAL_SCORE_RULE)

  const matchHistory = MATCH_HISTORY
  const historyFilter = ref<HistoryFilter>('all')
  const selectedMatchId = ref<string | null>(null)

  const settings = ref<SettingsFlags>(createDefaultSettings())
  const lcuStatus = ref<LcuStatusDto | null>(null)
  const gameflowSnapshot = ref<GameflowSnapshot | null>(null)
  const lcuBridgeError = ref<string | null>(null)

  const toastMessage = ref('')
  const toastTone = ref<ToastTone>('success')
  const toastVisible = ref(false)

  const isDesktopRuntime = computed(() => isTauri())
  const isRealLcuConnected = computed(
    () =>
      isDesktopRuntime.value &&
      lcuStatus.value?.source === 'real' &&
      lcuStatus.value.simulated === false &&
      lcuStatus.value.status === 'connected',
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

  /** 首页只组合业务数据；中文展示文本由 HomePage 通过 i18n 取得。 */
  const homeView = computed<HomeViewModel>(() => ({
    isConnected: isConnected.value,
    summonerName: homeProfile.value.summonerName,
    roomPhase: homeProfile.value.roomPhase,
    gameMode: homeProfile.value.gameMode,
  }))

  /** 当前选中战绩，供阶段五结算详情直接读取。 */
  const selectedMatch = computed<MatchHistoryItem | null>(
    () => matchHistory.find((match) => match.id === selectedMatchId.value) ?? null,
  )

  let connectTimer: ReturnType<typeof setTimeout> | null = null
  let toastTimer: ReturnType<typeof setTimeout> | null = null

  function hideToast() {
    if (toastTimer) {
      clearTimeout(toastTimer)
      toastTimer = null
    }
    toastVisible.value = false
  }

  /** 演示连接：1500ms 后进入已连接状态，重复点击会被忽略。 */
  function connect() {
    if (isDesktopRuntime.value) return
    if (connectionPhase.value !== 'disconnected') return

    hideToast()
    connectionPhase.value = 'connecting'
    connectTimer = setTimeout(() => {
      connectTimer = null
      connectionPhase.value = 'connected'
      activeTab.value = 'home'
    }, CONNECT_DELAY_MS)
  }

  /** 回到未连接层；同时取消尚未完成的模拟连接。 */
  function disconnect() {
    if (isDesktopRuntime.value) return
    if (connectTimer) {
      clearTimeout(connectTimer)
      connectTimer = null
    }
    hideToast()
    connectionPhase.value = 'disconnected'
    activeTab.value = 'home'
    showDetails.value = false
    historyFilter.value = 'all'
    selectedMatchId.value = null
  }

  function toggleDetails() {
    showDetails.value = !showDetails.value
  }

  function setActiveTab(tab: AppTab) {
    activeTab.value = tab
  }

  /** 供工具页与首页共享规则业务值；显示文案由组件层 i18n 映射。 */
  function setCurrentRule(rule: ScoreRuleSelection) {
    currentRule.value = rule
  }

  function setHistoryFilter(filter: HistoryFilter) {
    historyFilter.value = filter
  }

  /** 设置页三个演示开关独立更新；不做持久化或系统调用。 */
  function setSetting(key: SettingKey, value: boolean) {
    settings.value[key] = value
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
  }

  /** 记录所点战绩 ID 并进入结算导航；非法 ID 不改变当前状态。 */
  function openMatchDetail(matchId: string) {
    const match = matchHistory.find((item) => item.id === matchId)
    if (!match) return

    selectedMatchId.value = match.id
    activeTab.value = 'match-detail'
  }

  function notify(message: string, tone: ToastTone = 'success') {
    toastMessage.value = message
    toastTone.value = tone
    toastVisible.value = true
    if (toastTimer) clearTimeout(toastTimer)
    toastTimer = setTimeout(() => {
      toastTimer = null
      toastVisible.value = false
    }, TOAST_DURATION_MS)
  }

  return {
    connectionPhase,
    activeTab,
    showDetails,
    homeProfile,
    currentRule,
    homeView,
    matchHistory,
    historyFilter,
    selectedMatchId,
    selectedMatch,
    settings,
    lcuStatus,
    lcuBridgeError,
    isDesktopRuntime,
    isRealLcuConnected,
    gameflowSnapshot,
    toastMessage,
    toastTone,
    toastVisible,
    isConnected,
    isConnecting,
    connect,
    disconnect,
    toggleDetails,
    setActiveTab,
    setCurrentRule,
    setHistoryFilter,
    setSetting,
    setLcuStatus,
    setLcuError,
    clearLcuError,
    setGameflowSnapshot,
    openMatchDetail,
    notify,
  }
})
