<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { useAppStore, type AppTab } from '@/stores/app'

type NavTab = Exclude<AppTab, 'match-detail'>

interface NavItem {
  key: NavTab
  labelKey: string
  icon: string
}

const app = useAppStore()
const { t } = useI18n({ useScope: 'global' })

const tabs: NavItem[] = [
  { key: 'home', labelKey: 'nav.home', icon: 'fa-solid fa-house' },
  { key: 'history', labelKey: 'nav.history', icon: 'fa-solid fa-clock-rotate-left' },
  { key: 'tools', labelKey: 'nav.tools', icon: 'fa-solid fa-toolbox' },
  { key: 'settings', labelKey: 'nav.settings', icon: 'fa-solid fa-gear' },
]

/** 与原始 switchTab() 一致：结算页归属战绩 Tab。 */
function isActive(tab: NavTab): boolean {
  return app.activeTab === tab || (app.activeTab === 'match-detail' && tab === 'history')
}
</script>

<template>
  <nav
    class="nav-glow glass-card fixed right-0 bottom-0 left-0 z-40 mx-auto max-w-[480px] border-t border-white/10 bg-slate-950/90 transition-transform duration-300"
    :aria-label="t('a11y.mainNav')"
  >
    <div class="grid h-16 grid-cols-4">
      <button
        v-for="tab in tabs"
        :key="tab.key"
        type="button"
        class="flex cursor-pointer flex-col items-center justify-center gap-1 transition-all"
        :class="isActive(tab.key) ? 'active-tab' : 'text-slate-400 hover:text-slate-200'"
        :aria-current="isActive(tab.key) ? 'page' : undefined"
        @click="app.setActiveTab(tab.key)"
      >
        <i :class="[tab.icon, 'text-lg']"></i>
        <span class="text-[11px] font-medium">{{ t(tab.labelKey) }}</span>
      </button>
    </div>
  </nav>
</template>
