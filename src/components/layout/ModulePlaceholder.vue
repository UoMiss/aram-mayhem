<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useAppStore } from '@/stores/app'

type Accent = 'purple' | 'cyan' | 'rose'

interface Props {
  icon: string
  title: string
  description: string
  accent?: Accent
}

const props = withDefaults(defineProps<Props>(), { accent: 'purple' })
const app = useAppStore()
const { t } = useI18n({ useScope: 'global' })

const accentClasses: Record<Accent, string> = {
  purple: 'border-purple-500/30 bg-purple-600/10 text-purple-300 shadow-purple-600/10',
  cyan: 'border-cyan-500/30 bg-cyan-500/10 text-cyan-300 shadow-cyan-500/10',
  rose: 'border-rose-500/30 bg-rose-500/10 text-rose-300 shadow-rose-500/10',
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

    <h2 class="mt-5 text-xl font-black tracking-wide text-white">{{ title }}</h2>
    <p class="mt-2 max-w-[260px] text-xs leading-relaxed text-slate-400">{{ description }}</p>

    <div
      class="mt-6 w-full max-w-xs rounded-2xl border border-dashed border-white/10 bg-slate-900/30 p-4 text-left"
    >
      <p class="flex items-center gap-1.5 text-[11px] font-semibold text-slate-300">
        <i class="fa-solid fa-code-branch text-purple-400"></i>
        <span>{{ t('placeholder.migrationPending') }}</span>
      </p>
      <p class="mt-1.5 text-[11px] leading-5 text-slate-500">
        {{ t('placeholder.description') }}
      </p>
    </div>

    <button
      type="button"
      class="mt-5 inline-flex cursor-pointer items-center gap-2 rounded-xl border border-white/5 bg-slate-800/80 px-4 py-2 text-xs font-medium text-slate-300 transition-all hover:bg-purple-600/30 hover:text-white active:scale-95"
      @click="app.setActiveTab('home')"
    >
      <i class="fa-solid fa-arrow-left text-[10px]"></i>
      <span>{{ t('common.backHome') }}</span>
    </button>
  </section>
</template>
