import { defineStore, storeToRefs } from 'pinia'
import { useUiStore } from './ui'
import { useConnectionStore } from './connection'
import { useHomeStore } from './home'
import { useRulesStore } from './rules'
import { useHistoryStore } from './history'
import { useSettingsStore } from './settings'
import { useFeedbackStore } from './feedback'
export { CONNECT_DELAY_MS } from './connection'
export { TOAST_DURATION_MS } from './feedback'
export type { AppTab } from './ui'
export type { ConnectionPhase } from './connection'
export type { ToastTone } from './feedback'
/** Compatibility facade for existing consumers. Domain stores own all state. */
export const useAppStore = defineStore('app', () => {
  const ui = useUiStore()
  const uiRefs = storeToRefs(ui)
  const connection = useConnectionStore()
  const connectionRefs = storeToRefs(connection)
  const home = useHomeStore()
  const homeRefs = storeToRefs(home)
  const rules = useRulesStore()
  const rulesRefs = storeToRefs(rules)
  const history = useHistoryStore()
  const historyRefs = storeToRefs(history)
  const settings = useSettingsStore()
  const settingsRefs = storeToRefs(settings)
  const feedback = useFeedbackStore()
  const feedbackRefs = storeToRefs(feedback)
  return {
    activeTab: uiRefs.activeTab,
    showDetails: uiRefs.showDetails,
    setActiveTab: ui.setActiveTab,
    toggleDetails: ui.toggleDetails,
    connectionPhase: connectionRefs.connectionPhase,
    lcuStatus: connectionRefs.lcuStatus,
    gameflowSnapshot: connectionRefs.gameflowSnapshot,
    lcuBridgeError: connectionRefs.lcuBridgeError,
    isDesktopRuntime: connectionRefs.isDesktopRuntime,
    isRealLcuConnected: connectionRefs.isRealLcuConnected,
    isConnected: connectionRefs.isConnected,
    isConnecting: connectionRefs.isConnecting,
    connect: connection.connect,
    disconnect: connection.disconnect,
    setLcuStatus: connection.setLcuStatus,
    setLcuError: connection.setLcuError,
    clearLcuError: connection.clearLcuError,
    setGameflowSnapshot: connection.setGameflowSnapshot,
    homeProfile: homeRefs.homeProfile,
    homeView: homeRefs.homeView,
    currentRule: rulesRefs.currentRule,
    setCurrentRule: rules.setCurrentRule,
    matchHistory: historyRefs.matchHistory,
    historyFilter: historyRefs.historyFilter,
    selectedMatchId: historyRefs.selectedMatchId,
    selectedMatch: historyRefs.selectedMatch,
    setHistoryFilter: history.setHistoryFilter,
    openMatchDetail: history.openMatchDetail,
    settings: settingsRefs.settings,
    setSetting: settings.setSetting,
    toastMessage: feedbackRefs.toastMessage,
    toastTone: feedbackRefs.toastTone,
    toastVisible: feedbackRefs.toastVisible,
    hideToast: feedback.hideToast,
    notify: feedback.notify,
  }
})
