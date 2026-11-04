<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useUiStore } from '@/stores/ui'

type Accent = 'purple' | 'cyan' | 'rose'

interface Props {
  icon: string
  title: string
  description: string
  accent?: Accent
}

const props = withDefaults(defineProps<Props>(), { accent: 'purple' })
const ui = useUiStore()
const { t } = useI18n({ useScope: 'global' })

const accentClasses: Record<Accent, string> = {
  purple: 'border-brand-bright/30 bg-brand-strong/10 text-brand-light shadow-brand-strong/10',
  cyan: 'border-info-bright/30 bg-info-bright/10 text-info-light shadow-info-bright/10',
  rose: 'border-danger-bright/30 bg-danger-bright/10 text-danger-light shadow-danger-bright/10',
}

const accentClass = computed(() => accentClasses[props.accent])
</script>

<template>
  <section class="flex min-h-[70vh] flex-col items-center justify-center text-center">
    <div
      class="flex h-16 w-16 items-center justify-center rounded-2xl border shadow-lg"
      :class="accentClass"
    >
      <i :class="[icon, 'text-2xl']"></i>
    </div>

    <h2 class="mt-5 text-xl font-ink tracking-wide text-on-solid">{{ title }}</h2>
    <p class="mt-2 max-w-[260px] text-xs leading-relaxed text-text-muted">{{ description }}</p>

    <div
      class="mt-6 w-full max-w-xs rounded-2xl border border-dashed border-on-solid/10 bg-surface-sunken/30 p-4 text-left"
    >
      <p class="flex items-center gap-1.5 text-[11px] font-semibold text-text-secondary">
        <i class="fa-solid fa-code-branch text-brand"></i>
        <span>{{ t('placeholder.migrationPending') }}</span>
      </p>
      <p class="mt-1.5 text-[11px] leading-5 text-text-subtle">
        {{ t('placeholder.description') }}
      </p>
    </div>

    <button
      type="button"
      class="mt-5 inline-flex cursor-pointer items-center gap-2 rounded-xl border border-on-solid/5 bg-surface-raised/80 px-4 py-2 text-xs font-medium text-text-secondary transition-all hover:bg-brand-strong/30 hover:text-on-solid active:scale-95"
      @click="ui.setActiveTab('home')"
    >
      <i class="fa-solid fa-arrow-left text-[10px]"></i>
      <span>{{ t('common.backHome') }}</span>
    </button>
  </section>
</template>
