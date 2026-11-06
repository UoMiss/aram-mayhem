<script setup lang="ts">
import { defineAsyncComponent, ref, watch } from 'vue'
import AppHeader from '@/components/layout/AppHeader.vue'
import BottomNavigation from '@/components/layout/BottomNavigation.vue'
import HistoryPage from '@/features/history/HistoryPage.vue'
import HomePage from '@/features/home/HomePage.vue'
import SettingsPage from '@/features/settings/SettingsPage.vue'
import ToolsPage from '@/features/tools/ToolsPage.vue'
import { useUiStore } from '@/stores/ui'

const MatchDetailPage = defineAsyncComponent(
  () => import('@/features/match-detail/MatchDetailPage.vue'),
)
const ui = useUiStore()
const mainRef = ref<HTMLElement | null>(null)

/** 原版 showMatchDetail() 在进入结算页时把 main.scrollTop 归零。 */
watch(
  () => ui.activeTab,
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
      <HomePage v-show="ui.activeTab === 'home'" />
      <HistoryPage v-show="ui.activeTab === 'history'" />
      <ToolsPage v-show="ui.activeTab === 'tools'" />
      <MatchDetailPage v-show="ui.activeTab === 'match-detail'" />
      <SettingsPage v-show="ui.activeTab === 'settings'" />
    </main>

    <BottomNavigation />
  </div>
</template>
