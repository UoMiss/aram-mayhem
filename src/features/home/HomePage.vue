<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { HOME_GAME_MODE_KEYS, HOME_ROOM_PHASE_KEYS, SCORE_RULE_NAME_KEYS } from '@/i18n/labels'
import { useUiStore } from '@/stores/ui'
import { useConnectionStore } from '@/stores/connection'
import { useHomeStore } from '@/stores/home'
import { useRulesStore } from '@/stores/rules'

const ui = useUiStore()
const connection = useConnectionStore()
const home = useHomeStore()
const rules = useRulesStore()
const { t } = useI18n({ useScope: 'global' })

const ruleLabel = computed(() =>
  rules.currentRule ? t(SCORE_RULE_NAME_KEYS[rules.currentRule]) : t('rules.none'),
)
const roomPhaseLabel = computed(() => t(HOME_ROOM_PHASE_KEYS[home.homeView.roomPhase]))
const gameModeLabel = computed(() => t(HOME_GAME_MODE_KEYS[home.homeView.gameMode]))
</script>

<template>
  <section id="page-home" class="flex min-h-[75vh] flex-col items-center justify-center">
    <div class="relative mb-6 flex items-center justify-center">
      <div class="absolute h-24 w-24 rounded-full bg-brand-strong/20 blur-xl"></div>
      <div
        class="relative z-raised flex h-20 w-20 items-center justify-center rounded-full border-2 border-brand-bright/40 bg-shell shadow-home"
      >
        <i class="fa-solid fa-bolt text-4xl text-brand drop-shadow-brand"></i>
      </div>
    </div>

    <h2 class="mb-6 text-3xl font-ink tracking-widest text-on-solid">
      {{ t('connection.connected') }}
    </h2>

    <p
      v-if="connection.isRealLcuConnected"
      class="mb-6 max-w-[240px] text-center text-xs leading-relaxed text-text-muted"
    >
      {{ t('home.realDataPending') }}
    </p>

    <template v-else>
      <p class="mb-2 text-[10px] tracking-wide text-text-subtle">{{ t('connection.demoData') }}</p>
      <div class="mb-3 flex items-center gap-3">
        <span class="text-xl font-bold text-brand">{{ home.homeView.summonerName }}</span>
        <div
          class="flex items-center gap-1.5 rounded-full border border-success-bright/30 bg-success-bright/10 px-2.5 py-1"
        >
          <span class="h-1.5 w-1.5 animate-pulse rounded-full bg-success"></span>
          <span class="text-xs font-bold text-success">{{ roomPhaseLabel }}</span>
        </div>
      </div>

      <p class="mb-6 flex items-center gap-2 text-sm text-text-muted">
        <span>{{ gameModeLabel }}</span>
        <span class="text-text-faint">·</span>
        <span id="home-rule-text" class="text-brand-light">{{ ruleLabel }}</span>
      </p>
    </template>

    <p class="mb-10 max-w-[200px] text-center text-[11px] leading-relaxed text-text-subtle">
      {{ t('home.settlementNote') }}<br />{{ t('home.trayNote') }}
    </p>

    <div class="grid w-full max-w-sm grid-cols-3 gap-3">
      <button
        type="button"
        class="glass-card cursor-pointer rounded-xl py-3.5 text-sm font-bold text-text-soft transition-all hover:bg-surface-raised/80 hover:text-on-solid active:scale-95"
        @click="ui.setActiveTab('match-detail')"
      >
        {{ t('home.previousMatch') }}
      </button>
      <button
        type="button"
        class="glass-card cursor-pointer rounded-xl py-3.5 text-sm font-bold text-text-soft transition-all hover:bg-surface-raised/80 hover:text-on-solid active:scale-95"
        @click="ui.setActiveTab('history')"
      >
        {{ t('home.history') }}
      </button>
      <button
        type="button"
        class="glass-card cursor-pointer rounded-xl py-3.5 text-sm font-bold text-text-soft transition-all hover:bg-surface-raised/80 hover:text-on-solid active:scale-95"
        @click="ui.setActiveTab('settings')"
      >
        {{ t('nav.settings') }}
      </button>
    </div>
  </section>
</template>
