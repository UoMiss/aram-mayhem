import { ref } from 'vue'
import { defineStore } from 'pinia'
export type AppTab = 'home' | 'history' | 'tools' | 'settings' | 'match-detail'
export const useUiStore = defineStore('ui', () => {
  const activeTab = ref<AppTab>('home')
  const showDetails = ref(false)
  function setActiveTab(tab: AppTab) {
    activeTab.value = tab
  }
  function toggleDetails() {
    showDetails.value = !showDetails.value
  }
  function resetNavigation() {
    activeTab.value = 'home'
    showDetails.value = false
  }
  return { activeTab, showDetails, setActiveTab, toggleDetails, resetNavigation }
})
