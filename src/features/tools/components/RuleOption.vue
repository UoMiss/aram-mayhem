<script setup lang="ts">
import Switch from '@/components/ui/switch/Switch.vue'
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
    ? 'w-full py-3 px-4 rounded-xl cursor-pointer flex items-center justify-between transition-all duration-200 border border-brand-bright/30 bg-brand-strong/10'
    : 'w-full py-3 px-4 rounded-xl cursor-pointer flex items-center justify-between transition-all duration-200 border border-transparent hover:bg-surface-raised/30',
)

const iconClasses = computed(() =>
  props.active
    ? 'w-10 h-10 rounded-lg bg-brand-strong text-on-solid flex items-center justify-center transition-colors shadow-md shadow-brand-strong/30'
    : 'w-10 h-10 rounded-lg bg-surface-raised text-text-muted flex items-center justify-center transition-colors',
)

const textClasses = computed(() =>
  props.active
    ? 'text-sm font-bold text-on-solid transition-colors'
    : 'text-sm font-bold text-text-soft transition-colors',
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
        <span class="text-[10px] text-text-muted">{{ description }}</span>
      </div>
    </div>

    <Switch
      :id="`toggle-${rule.key}`"
      :label="label"
      :model-value="active"
      @update:model-value="emit('toggle')"
    />
  </label>
</template>
