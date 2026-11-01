<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import RuleOption from '@/features/tools/components/RuleOption.vue'
import TeamDrawer from '@/features/tools/components/TeamDrawer.vue'
import { toggleScoreRule } from '@/features/tools/rules'
import { SCORE_RULE_OPTIONS } from '@/mocks/tools'
import { useAppStore } from '@/stores/app'
import type { ScoreRule } from '@/types/home'

const app = useAppStore()
const { t } = useI18n({ useScope: 'global' })
const isTeamDrawerOpen = ref(false)

function onToggleRule(rule: ScoreRule) {
  app.setCurrentRule(toggleScoreRule(app.currentRule, rule))
}
</script>

<template>
  <section id="page-tools" class="space-y-5">
    <div class="space-y-3">
      <h3 class="flex items-center gap-2 pl-1 text-sm font-bold text-slate-200">
        <i class="fa-solid fa-calculator text-purple-400"></i> {{ t('tools.rulesTitle') }}
      </h3>

      <div class="glass-card flex flex-col gap-1 rounded-2xl p-1.5">
        <RuleOption
          v-for="rule in SCORE_RULE_OPTIONS"
          :key="rule.key"
          :rule="rule"
          :active="app.currentRule === rule.key"
          @toggle="onToggleRule(rule.key)"
        />
      </div>
    </div>

    <div class="space-y-3">
      <h3 class="flex items-center gap-2 pl-1 text-sm font-bold text-slate-200">
        <i class="fa-solid fa-toolbox text-cyan-400"></i> {{ t('tools.toolsTitle') }}
      </h3>

      <div class="grid grid-cols-2 gap-3">
        <button
          type="button"
          class="glass-card group flex w-full cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl px-3 py-6 text-center transition-all hover:border-cyan-500/40"
          @click="isTeamDrawerOpen = true"
        >
          <div
            class="flex h-12 w-12 items-center justify-center rounded-xl border border-cyan-500/30 bg-gradient-to-tr from-cyan-500/20 to-blue-500/20 text-cyan-400 shadow-lg shadow-cyan-500/10 transition-transform group-hover:scale-110"
          >
            <i class="fa-solid fa-shuffle text-xl"></i>
          </div>
          <h4 class="text-sm font-bold text-white">{{ t('tools.randomGroup') }}</h4>
        </button>

        <div
          class="glass-card flex cursor-not-allowed flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-white/10 px-3 py-6 opacity-50"
        >
          <div
            class="flex h-12 w-12 items-center justify-center rounded-xl bg-slate-800/50 text-slate-500"
          >
            <i class="fa-solid fa-plus text-xl"></i>
          </div>
          <h4 class="text-sm font-bold text-slate-400">{{ t('tools.moreTools') }}</h4>
        </div>
      </div>
    </div>

    <TeamDrawer :open="isTeamDrawerOpen" @close="isTeamDrawerOpen = false" />
  </section>
</template>
