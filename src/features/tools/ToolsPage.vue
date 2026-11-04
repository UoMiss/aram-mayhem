<script setup lang="ts">
import { ref, watch } from 'vue'
import { useUiStore } from '@/stores/ui'
import { useI18n } from 'vue-i18n'
import RuleOption from '@/features/tools/components/RuleOption.vue'
import TeamDrawer from '@/features/tools/components/TeamDrawer.vue'
import { toggleScoreRule } from '@/features/tools/rules'
import { SCORE_RULE_OPTIONS } from '@/mocks/tools'
import { useRulesStore } from '@/stores/rules'
import type { ScoreRule } from '@/types/home'

const rules = useRulesStore()
const { t } = useI18n({ useScope: 'global' })
const isTeamDrawerOpen = ref(false)
const ui = useUiStore()
watch(
  () => ui.activeTab,
  (tab) => {
    if (tab !== 'tools') isTeamDrawerOpen.value = false
  },
)

function onToggleRule(rule: ScoreRule) {
  rules.setCurrentRule(toggleScoreRule(rules.currentRule, rule))
}
</script>

<template>
  <section id="page-tools" class="space-y-5">
    <div class="space-y-3">
      <h3 class="flex items-center gap-2 pl-1 text-sm font-bold text-text-soft">
        <i class="fa-solid fa-calculator text-brand"></i> {{ t('tools.rulesTitle') }}
      </h3>

      <div class="glass-card flex flex-col gap-1 rounded-2xl p-1.5">
        <RuleOption
          v-for="rule in SCORE_RULE_OPTIONS"
          :key="rule.key"
          :rule="rule"
          :active="rules.currentRule === rule.key"
          @toggle="onToggleRule(rule.key)"
        />
      </div>
    </div>

    <div class="space-y-3">
      <h3 class="flex items-center gap-2 pl-1 text-sm font-bold text-text-soft">
        <i class="fa-solid fa-toolbox text-info"></i> {{ t('tools.toolsTitle') }}
      </h3>

      <div class="grid grid-cols-2 gap-3">
        <button
          type="button"
          class="glass-card group flex w-full cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl px-3 py-6 text-center transition-all hover:border-info-bright/40"
          @click="isTeamDrawerOpen = true"
        >
          <div
            class="flex h-12 w-12 items-center justify-center rounded-xl border border-info-bright/30 bg-gradient-to-tr from-info-bright/20 to-link-bright/20 text-info shadow-lg shadow-info-bright/10 transition-transform group-hover:scale-110"
          >
            <i class="fa-solid fa-shuffle text-xl"></i>
          </div>
          <h4 class="text-sm font-bold text-on-solid">{{ t('tools.randomGroup') }}</h4>
        </button>

        <div
          class="glass-card flex cursor-not-allowed flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-on-solid/10 px-3 py-6 opacity-50"
        >
          <div
            class="flex h-12 w-12 items-center justify-center rounded-xl bg-surface-raised/50 text-text-subtle"
          >
            <i class="fa-solid fa-plus text-xl"></i>
          </div>
          <h4 class="text-sm font-bold text-text-muted">{{ t('tools.moreTools') }}</h4>
        </div>
      </div>
    </div>

    <TeamDrawer :open="isTeamDrawerOpen" @close="isTeamDrawerOpen = false" />
  </section>
</template>
