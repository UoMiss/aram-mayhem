<script setup lang="ts">
import { ref, watch } from 'vue'
import AppHeader from '@/components/layout/AppHeader.vue'
import BottomNavigation from '@/components/layout/BottomNavigation.vue'
import HistoryPage from '@/features/history/HistoryPage.vue'
import HomePage from '@/features/home/HomePage.vue'
import MatchDetailPage from '@/features/match-detail/MatchDetailPage.vue'
import SettingsPage from '@/features/settings/SettingsPage.vue'
import ToolsPage from '@/features/tools/ToolsPage.vue'
import { useAppStore } from '@/stores/app'

const app = useAppStore()
const mainRef = ref<HTMLElement | null>(null)

/** 原版 showMatchDetail() 在进入结算页时把 main.scrollTop 归零。 */
watch(
  () => app.activeTab,
  (tab) => {
    if (tab === 'match-detail') {
      mainRef.value?.scrollTo({ top: 0 })
    }
  },
)
</script>

<template>
  <div class="flex h-full w-full flex-col">
    <AppHeader />

    <main ref="mainRef" class="no-scrollbar min-h-0 flex-1 overflow-y-auto px-4 pt-4 pb-24">
      <HomePage v-show="app.activeTab === 'home'" />
      <HistoryPage v-show="app.activeTab === 'history'" />
      <ToolsPage v-show="app.activeTab === 'tools'" />
      <MatchDetailPage v-show="app.activeTab === 'match-detail'" />
      <SettingsPage v-show="app.activeTab === 'settings'" />
    </main>

    <BottomNavigation />
  </div>
</template>
