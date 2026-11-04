import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { createMockHomeProfile } from '@/mocks/home'
import type { HomeProfile, HomeViewModel } from '@/types/home'
import { useConnectionStore } from './connection'
export const useHomeStore = defineStore('home', () => {
  const connection = useConnectionStore()
  const homeProfile = ref<HomeProfile>(createMockHomeProfile())
  const homeView = computed<HomeViewModel>(() => ({
    isConnected: connection.isConnected,
    summonerName: homeProfile.value.summonerName,
    roomPhase: homeProfile.value.roomPhase,
    gameMode: homeProfile.value.gameMode,
  }))
  return { homeProfile, homeView }
})
