<script setup lang="ts">
import Switch from '@/components/ui/switch/Switch.vue'
import { computed, ref, watch } from 'vue'
import {
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogOverlay,
  DialogPortal,
  DialogRoot,
  DialogTitle,
  DialogTrigger,
} from 'reka-ui'
import { useI18n } from 'vue-i18n'
import { SCORE_RULE_DESCRIPTION_KEYS, SCORE_RULE_NAME_KEYS } from '@/i18n/labels'
import { useUiStore } from '@/stores/ui'
import type { ScoreRuleOption } from '@/types/tools'
import damageImage from '@/assets/rules/pure-damage.png'
import luckyImage from '@/assets/rules/lucky-number.png'
import tailImage from '@/assets/rules/damage-tail.png'

const props = defineProps<{
  rule: ScoreRuleOption
  active: boolean
}>()

const emit = defineEmits<{ toggle: [] }>()
const { t } = useI18n({ useScope: 'global' })
const ui = useUiStore()
const detailsOpen = ref(false)
const ruleImages = { damage: damageImage, lucky: luckyImage, tail: tailImage, damage_size: null }
watch(
  () => ui.activeTab,
  (tab) => {
    if (tab !== 'tools') detailsOpen.value = false
  },
)

const label = computed(() => t(SCORE_RULE_NAME_KEYS[props.rule.key]))
const description = computed(() => t(SCORE_RULE_DESCRIPTION_KEYS[props.rule.key]))

const optionClasses = computed(() =>
  props.active
    ? 'w-full py-3 px-4 rounded-xl flex items-center justify-between gap-3 transition-all duration-200 border border-brand-bright/30 bg-brand-strong/10'
    : 'w-full py-3 px-4 rounded-xl flex items-center justify-between gap-3 transition-all duration-200 border border-transparent hover:bg-surface-raised/30',
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
  <div :id="`rule-item-${rule.key}`" :data-rule="rule.key" :class="optionClasses">
    <div class="flex min-w-0 items-center gap-3">
      <label
        :id="`icon-${rule.key}`"
        :for="`toggle-${rule.key}`"
        class="shrink-0 cursor-pointer"
        :class="iconClasses"
      >
        <i :class="[rule.icon, 'text-lg']" aria-hidden="true"></i>
      </label>
      <div class="flex min-w-0 flex-col">
        <div class="flex items-center gap-1">
          <label
            :id="`text-${rule.key}`"
            :for="`toggle-${rule.key}`"
            class="cursor-pointer"
            :class="textClasses"
            >{{ label }}</label
          >
          <DialogRoot v-model:open="detailsOpen">
            <DialogTrigger
              :aria-label="t('rules.showDetails', { rule: label })"
              class="grid size-7 shrink-0 cursor-pointer place-items-center rounded-full text-sm text-brand-light hover:bg-brand-strong/20 focus-visible:outline-2 focus-visible:outline-ring"
            >
              <i class="fa-solid fa-circle-info" aria-hidden="true"></i>
            </DialogTrigger>
            <DialogPortal>
              <DialogOverlay class="fixed inset-0 z-modal bg-ink/70 backdrop-blur-sm" />
              <DialogContent
                class="fixed top-1/2 left-1/2 z-modal w-[calc(100%_-_1rem)] max-w-3xl -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-2xl border border-brand/25 bg-card shadow-2xl"
              >
                <div class="flex items-center gap-2 p-2.5">
                  <DialogTitle class="mr-auto text-sm font-bold text-on-solid">{{
                    label
                  }}</DialogTitle>
                  <DialogClose
                    :aria-label="t('rules.closeDetails')"
                    class="grid size-8 shrink-0 cursor-pointer place-items-center rounded-full bg-surface-raised text-text-muted hover:text-on-solid focus-visible:outline-2 focus-visible:outline-ring"
                  >
                    <i class="fa-solid fa-xmark" aria-hidden="true"></i>
                  </DialogClose>
                </div>
                <DialogDescription class="sr-only">
                  {{ t(`rules.${rule.key}.detail`) }}
                  {{ t(`rules.${rule.key}.example`) }}
                  {{
                    rule.key === 'damage_size' ? t('rules.damage_size.scope') : t('rules.tieNote')
                  }}
                </DialogDescription>
                <div class="max-h-[75vh] overflow-y-auto">
                  <div
                    v-if="rule.key === 'damage_size'"
                    class="space-y-3 p-5 text-sm leading-relaxed text-text-secondary"
                  >
                    <p>{{ t('rules.damage_size.detail') }}</p>
                    <p>{{ t('rules.damage_size.example') }}</p>
                    <p>{{ t('rules.damage_size.scope') }}</p>
                    <p class="text-xs text-text-muted">{{ t('damageSize.host') }}</p>
                  </div>
                  <img
                    v-else
                    :src="ruleImages[rule.key] ?? undefined"
                    alt=""
                    width="1672"
                    height="941"
                    class="block h-auto w-full"
                  />
                </div>
              </DialogContent>
            </DialogPortal>
          </DialogRoot>
        </div>
        <label
          :for="`toggle-${rule.key}`"
          class="cursor-pointer text-[10px] leading-relaxed text-text-muted"
        >
          {{ description }}
        </label>
      </div>
    </div>

    <Switch
      :id="`toggle-${rule.key}`"
      class="shrink-0"
      :label="label"
      :model-value="active"
      @update:model-value="emit('toggle')"
    />
  </div>
</template>
