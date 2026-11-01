<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { HOME_GAME_MODE_KEYS, HOME_ROOM_PHASE_KEYS, SCORE_RULE_NAME_KEYS } from '@/i18n/labels'
import { useAppStore } from '@/stores/app'

const app = useAppStore()
const { t } = useI18n({ useScope: 'global' })

const ruleLabel = computed(() =>
  app.currentRule ? t(SCORE_RULE_NAME_KEYS[app.currentRule]) : t('rules.none'),
)
const roomPhaseLabel = computed(() => t(HOME_ROOM_PHASE_KEYS[app.homeView.roomPhase]))
const gameModeLabel = computed(() => t(HOME_GAME_MODE_KEYS[app.homeView.gameMode]))
</script>

<template>
  <section id="page-home" class="flex min-h-[75vh] flex-col items-center justify-center">
    <div class="relative mb-6 flex items-center justify-center">
      <div class="absolute h-24 w-24 rounded-full bg-purple-600/20 blur-xl"></div>
      <div
        class="relative z-10 flex h-20 w-20 items-center justify-center rounded-full border-2 border-purple-500/40 bg-[#0c0b14] shadow-[0_0_20px_rgba(168,85,247,0.2)]"
      >
        <i
          class="fa-solid fa-bolt text-4xl text-purple-400 drop-shadow-[0_0_8px_rgba(168,85,247,0.8)]"
        ></i>
      </div>
    </div>

    <h2 class="mb-6 text-3xl font-black tracking-widest text-white">
      {{ t('connection.connected') }}
    </h2>

    <div class="mb-3 flex items-center gap-3">
      <span class="text-xl font-bold text-purple-400">{{ app.homeView.summonerName }}</span>
      <div
        class="flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1"
      >
        <span class="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400"></span>
        <span class="text-xs font-bold text-emerald-400">{{ roomPhaseLabel }}</span>
      </div>
    </div>

    <p class="mb-6 flex items-center gap-2 text-sm text-slate-400">
      <span>{{ gameModeLabel }}</span>
      <span class="text-slate-600">·</span>
      <span id="home-rule-text" class="text-purple-300">{{ ruleLabel }}</span>
    </p>

    <p class="mb-10 max-w-[200px] text-center text-[11px] leading-relaxed text-slate-500">
      {{ t('home.settlementNote') }}<br />{{ t('home.trayNote') }}
    </p>

    <div class="grid w-full max-w-sm grid-cols-3 gap-3">
      <button
        type="button"
        class="glass-card cursor-pointer rounded-xl py-3.5 text-sm font-bold text-slate-200 transition-all hover:bg-slate-800/80 hover:text-white active:scale-95"
        @click="app.setActiveTab('match-detail')"
      >
        {{ t('home.previousMatch') }}
      </button>
      <button
        type="button"
        class="glass-card cursor-pointer rounded-xl py-3.5 text-sm font-bold text-slate-200 transition-all hover:bg-slate-800/80 hover:text-white active:scale-95"
        @click="app.setActiveTab('history')"
      >
        {{ t('home.history') }}
      </button>
      <button
        type="button"
        class="glass-card cursor-pointer rounded-xl py-3.5 text-sm font-bold text-slate-200 transition-all hover:bg-slate-800/80 hover:text-white active:scale-95"
        @click="app.setActiveTab('settings')"
      >
        {{ t('nav.settings') }}
      </button>
    </div>
  </section>
</template>
