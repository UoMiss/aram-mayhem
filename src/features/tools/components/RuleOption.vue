<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { SCORE_RULE_DESCRIPTION_KEYS, SCORE_RULE_NAME_KEYS } from '@/i18n/labels'
import type { ScoreRuleOption } from '@/types/tools'

const props = defineProps<{
  rule: ScoreRuleOption
  active: boolean
}>()

const emit = defineEmits<{ toggle: [] }>()
const { t } = useI18n({ useScope: 'global' })

const label = computed(() => t(SCORE_RULE_NAME_KEYS[props.rule.key]))
const description = computed(() => t(SCORE_RULE_DESCRIPTION_KEYS[props.rule.key]))

const optionClasses = computed(() =>
  props.active
    ? 'w-full py-3 px-4 rounded-xl cursor-pointer flex items-center justify-between transition-all duration-200 border border-purple-500/30 bg-purple-600/10'
    : 'w-full py-3 px-4 rounded-xl cursor-pointer flex items-center justify-between transition-all duration-200 border border-transparent hover:bg-slate-800/30',
)

const iconClasses = computed(() =>
  props.active
    ? 'w-10 h-10 rounded-lg bg-purple-600 text-white flex items-center justify-center transition-colors shadow-md shadow-purple-600/30'
    : 'w-10 h-10 rounded-lg bg-slate-800 text-slate-400 flex items-center justify-center transition-colors',
)

const textClasses = computed(() =>
  props.active
    ? 'text-sm font-bold text-white transition-colors'
    : 'text-sm font-bold text-slate-200 transition-colors',
)
</script>

<template>
  <label
    :id="`rule-item-${rule.key}`"
    :for="`toggle-${rule.key}`"
    :data-rule="rule.key"
    :class="optionClasses"
  >
    <div class="flex items-center gap-3">
      <div :id="`icon-${rule.key}`" :class="iconClasses">
        <i :class="[rule.icon, 'text-lg']"></i>
      </div>
      <div class="flex flex-col">
        <span :id="`text-${rule.key}`" :class="textClasses">{{ label }}</span>
        <span class="text-[10px] text-slate-400">{{ description }}</span>
      </div>
    </div>

    <div class="relative inline-flex items-center">
      <input
        :id="`toggle-${rule.key}`"
        type="checkbox"
        class="sr-only peer"
        :checked="active"
        @change="emit('toggle')"
      />
      <div
        class="peer h-6 w-11 rounded-full bg-slate-800 after:absolute after:top-[2px] after:left-[2px] after:h-5 after:w-5 after:rounded-full after:border after:border-gray-300 after:bg-white after:content-[''] after:transition-all peer-checked:bg-purple-600 peer-checked:after:translate-x-full peer-checked:after:border-white"
      ></div>
    </div>
  </label>
</template>
