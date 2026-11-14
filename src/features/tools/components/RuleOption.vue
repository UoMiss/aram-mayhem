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

const props = defineProps<{
  rule: ScoreRuleOption
  active: boolean
}>()

const emit = defineEmits<{ toggle: [] }>()
const { t } = useI18n({ useScope: 'global' })
const ui = useUiStore()
const detailsOpen = ref(false)
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
                class="fixed top-1/2 left-1/2 z-modal flex max-h-[calc(100dvh_-_2rem)] w-[calc(100%_-_2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl border border-brand/25 bg-card shadow-2xl"
              >
                <div
                  class="flex shrink-0 items-center gap-3 border-b border-brand/20 bg-linear-to-br from-brand-surface/45 to-card px-4 py-4 min-[400px]:px-5"
                >
                  <span
                    class="grid size-10 shrink-0 place-items-center rounded-xl bg-brand-strong/25 text-brand-pale"
                    aria-hidden="true"
                  >
                    <i :class="[rule.icon, 'text-base']"></i>
                  </span>
                  <DialogTitle
                    class="min-w-0 flex-1 text-xl leading-tight font-bold text-on-solid min-[400px]:text-2xl"
                  >
                    {{ label }}
                  </DialogTitle>
                  <DialogClose
                    :aria-label="t('rules.closeDetails')"
                    class="grid size-9 shrink-0 cursor-pointer place-items-center rounded-full bg-surface-raised text-text-secondary hover:text-on-solid focus-visible:outline-2 focus-visible:outline-ring"
                  >
                    <i class="fa-solid fa-xmark" aria-hidden="true"></i>
                  </DialogClose>
                </div>
                <div
                  tabindex="0"
                  class="min-h-0 space-y-4 overflow-y-auto overscroll-contain p-4 text-sm leading-[1.65] text-text-secondary focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring min-[400px]:px-5"
                >
                  <div class="space-y-1">
                    <h3 class="text-sm font-semibold text-brand-pale">
                      {{ t('rules.details.sections.play') }}
                    </h3>
                    <DialogDescription class="text-base leading-6 text-text-soft">
                      {{ t(`rules.${rule.key}.details.play`) }}
                    </DialogDescription>
                  </div>
                  <div
                    class="space-y-1 rounded-xl border border-brand/20 bg-brand-surface/20 px-3 py-2.5"
                  >
                    <h3 class="text-sm font-semibold text-on-solid">
                      {{ t('rules.details.sections.redPackets') }}
                    </h3>
                    <p>{{ t(`rules.${rule.key}.details.redPackets`) }}</p>
                  </div>
                  <div class="space-y-1">
                    <h3 class="text-sm font-semibold text-on-solid">
                      {{ t('rules.details.sections.settlement') }}
                    </h3>
                    <p>{{ t(`rules.${rule.key}.details.settlement`) }}</p>
                  </div>
                  <p class="border-t border-on-solid/10 pt-3 text-xs leading-5 text-text-muted">
                    {{ t('rules.details.scope') }}
                  </p>
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
