import { ref } from 'vue'
import { defineStore } from 'pinia'
export type AppTab = 'home' | 'history' | 'tools' | 'settings' | 'match-detail'
export const useUiStore = defineStore('ui', () => {
  const activeTab = ref<AppTab>('home')
  function setActiveTab(tab: AppTab) {
    activeTab.value = tab
  }
  function resetNavigation() {
    activeTab.value = 'home'
  }
  return { activeTab, setActiveTab, resetNavigation }
})
