<script setup lang="ts">
import {
  DialogRoot,
  DialogPortal,
  DialogOverlay,
  DialogContent,
  DialogTitle,
  DialogDescription,
  DialogClose,
} from 'reka-ui'
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useVersionUpdate } from './useVersionUpdate'
import { isTauri } from '@tauri-apps/api/core'
import type { SettingKey } from '@/types/settings'
import { useDesktopStore } from '@/stores/desktop'
import { useI18n } from 'vue-i18n'
import { SETTING_LABEL_KEYS } from '@/i18n/labels'
import SettingToggle from '@/features/settings/components/SettingToggle.vue'
import { SETTINGS_OPTIONS } from '@/mocks/settings'
import { useSettingsStore } from '@/stores/settings'
import { useFeedbackStore } from '@/stores/feedback'
import ExitAppButton from '@/components/common/ExitAppButton.vue'

const settings = useSettingsStore()
const desktop = useDesktopStore()
const feedback = useFeedbackStore()
const { t } = useI18n({ useScope: 'global' })

const native = computed(() => isTauri())
const busy = ref<SettingKey | null>(null)
const {
  snapshot,
  checking,
  downloading,
  busy: updateBusy,
  opening,
  failed,
  progress,
  message,
  confirmInstall,
  run,
  cancel,
  openRelease,
} = useVersionUpdate()
let disposed = false
onUnmounted(() => {
  disposed = true
})
onMounted(() => {
  if (native.value) void settings.initializeAutoAccept().catch(() => undefined)
})
async function changeSetting(key: SettingKey, value: boolean) {
  if (!native.value) {
    settings.setSetting(key, value)
    return
  }
  if (busy.value || !settings.autoAcceptReady) return
  busy.value = key
  try {
    const { tauriSettingsAdapter } = await import('@/adapters/tauri.adapter')
    if (disposed) return
    settings.setSetting(key, await tauriSettingsAdapter.setAutoAccept(value))
  } catch {
    if (!disposed) feedback.notify(t('settings.saveFailed'), 'error')
  } finally {
    if (!disposed) busy.value = null
  }
}
</script>

<template>
  <section id="page-settings" class="space-y-4">
    <div class="glass-card space-y-3 rounded-2xl p-4">
      <h3 class="text-xs font-bold tracking-wider text-brand uppercase">
        {{ t('settings.general') }}
      </h3>

      <SettingToggle
        v-for="(key, index) in SETTINGS_OPTIONS"
        :key="key"
        :label="t(SETTING_LABEL_KEYS[key])"
        :bordered="index < SETTINGS_OPTIONS.length - 1"
        :model-value="settings.settings[key]"
        :disabled="busy !== null || !settings.autoAcceptReady"
        @update:model-value="changeSetting(key, $event)"
      />
      <button
        v-if="native && !settings.autoAcceptReady && !busy"
        type="button"
        class="text-xs text-brand-light underline"
        @click="
          settings
            .initializeAutoAccept()
            .catch(() => feedback.notify(t('settings.saveFailed'), 'error'))
        "
      >
        {{ t('settings.retryAutoAccept') }}
      </button>
    </div>

    <div class="glass-card space-y-3 rounded-2xl p-4">
      <h3 class="text-xs font-bold tracking-wider text-brand uppercase">
        {{ t('settings.about') }}
      </h3>

      <div class="flex items-center justify-between text-sm text-text-secondary">
        <span>{{ t('settings.version') }}</span>
        <span class="text-text-subtle">v{{ desktop.appVersion }}</span>
      </div>

      <button
        type="button"
        class="w-full cursor-pointer rounded-xl border border-brand-bright/30 bg-brand-surface/30 py-2.5 text-xs text-brand-light transition-colors hover:bg-brand-deep/40"
        :disabled="updateBusy || opening"
        :aria-busy="checking"
        data-action="check-update"
        @click="run('check')"
      >
        {{ t(checking ? 'settings.checking' : 'settings.checkUpdate') }}
      </button>
      <div v-if="message" class="space-y-2 text-xs" aria-live="polite">
        <p
          :role="failed ? 'alert' : 'status'"
          :class="failed ? 'text-danger-light' : 'text-text-secondary'"
        >
          {{ message }}
        </p>
        <p
          v-if="snapshot.notes"
          class="max-h-36 overflow-y-auto whitespace-pre-wrap break-words text-text-muted"
        >
          {{ snapshot.notes }}
        </p>
        <div v-if="downloading" class="space-y-2">
          <progress
            class="h-2 w-full accent-brand"
            :value="progress ?? undefined"
            max="100"
            :aria-label="t('settings.downloadProgress')"
          ></progress>
          <p class="tabular-nums text-text-muted">
            {{ progress === null ? t('settings.downloadProgressUnknown') : `${progress}%` }}
          </p>
          <button
            v-if="snapshot.phase === 'downloading'"
            type="button"
            data-action="cancel-update"
            class="text-brand-light underline"
            @click="cancel"
          >
            {{ t('settings.cancelDownload') }}
          </button>
        </div>
        <button
          v-if="snapshot.canDownload"
          type="button"
          data-action="download-update"
          class="w-full cursor-pointer rounded-xl bg-brand-strong py-2.5 text-on-solid transition-colors hover:bg-brand-deep disabled:cursor-not-allowed disabled:opacity-50"
          :disabled="updateBusy || opening"
          @click="run('download')"
        >
          <i class="fa-solid fa-download mr-1.5" aria-hidden="true"></i
          >{{ t('settings.downloadUpdate') }}
        </button>
        <button
          v-if="snapshot.canInstall"
          type="button"
          data-action="install-update"
          class="w-full cursor-pointer rounded-xl bg-brand-strong py-2.5 text-on-solid transition-colors hover:bg-brand-deep disabled:opacity-50"
          :disabled="updateBusy || opening"
          @click="confirmInstall = true"
        >
          {{ t('settings.installUpdate') }}
        </button>
      </div>
      <DialogRoot v-model:open="confirmInstall">
        <DialogPortal>
          <DialogOverlay class="fixed inset-0 z-modal bg-ink/70 backdrop-blur-sm" />
          <DialogContent
            class="fixed top-1/2 left-1/2 z-modal w-[calc(100%_-_2rem)] max-w-sm -translate-x-1/2 -translate-y-1/2 space-y-4 rounded-2xl border border-brand/25 bg-card p-5 shadow-2xl"
          >
            <DialogTitle class="font-bold text-on-solid">{{
              t('settings.installConfirmTitle')
            }}</DialogTitle>
            <DialogDescription class="text-sm leading-relaxed text-text-secondary">{{
              t('settings.installConfirmDescription', { version: snapshot.latest })
            }}</DialogDescription>
            <div class="flex justify-end gap-3">
              <DialogClose
                class="rounded-lg bg-surface-raised px-4 py-2 text-sm text-text-secondary"
                >{{ t('settings.installLater') }}</DialogClose
              >
              <button
                type="button"
                data-action="confirm-install"
                class="rounded-lg bg-brand-strong px-4 py-2 text-sm text-on-solid"
                :disabled="updateBusy || !snapshot.canInstall"
                @click="run('install')"
              >
                {{ t('settings.confirmInstall') }}
              </button>
            </div>
          </DialogContent>
        </DialogPortal>
      </DialogRoot>
      <button
        v-if="native"
        type="button"
        data-action="release-page"
        :disabled="updateBusy || opening"
        class="text-xs text-brand-light underline disabled:opacity-50"
        @click="openRelease"
      >
        {{ t('settings.releasePage') }}
      </button>
      <ExitAppButton class="w-full" />
    </div>
  </section>
</template>
