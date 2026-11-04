import { ref } from 'vue'
import { defineStore } from 'pinia'
import { APP_VERSION } from '@/shared/constants/app'
export const useDesktopStore = defineStore('desktop', () => {
  const appVersion = ref(APP_VERSION)
  function setAppVersion(version: string) {
    appVersion.value = version
  }
  return { appVersion, setAppVersion }
})
