import { createDemoUpdater } from '@/mocks/updater'
import { useConnectionStore } from '@/stores/connection'
import { computed, onMounted, onScopeDispose, ref, shallowRef } from 'vue'
import { isTauri } from '@tauri-apps/api/core'
import { useI18n } from 'vue-i18n'
import { DesktopServiceError } from '@/services/desktop-error'
import { useFeedbackStore } from '@/stores/feedback'
import type { UpdateSnapshot } from '@/types/settings'

export function useVersionUpdate() {
  const connection = useConnectionStore()
  const demo = isTauri() ? null : createDemoUpdater(() => connection.gameflowSnapshot?.phase)
  async function adapter() {
    return demo ?? (await import('@/adapters/tauri.adapter')).tauriSettingsAdapter
  }
  const { t } = useI18n({ useScope: 'global' })
  const feedback = useFeedbackStore()
  const snapshot = shallowRef<UpdateSnapshot>({
    revision: 0,
    phase: 'idle',
    latest: null,
    notes: null,
    downloaded: 0,
    total: null,
    canDownload: false,
    canInstall: false,
    errorCode: null,
  })
  const acting = ref(false)
  const opening = ref(false)
  const localError = ref<string | null>(null)
  const confirmInstall = ref(false)
  let disposed = false
  let poll: ReturnType<typeof setTimeout> | undefined
  const running = computed(() =>
    ['checking', 'downloading', 'verifying', 'installing'].includes(snapshot.value.phase),
  )
  const busy = computed(() => acting.value || running.value)
  const checking = computed(() => snapshot.value.phase === 'checking')
  const downloading = computed(() => ['downloading', 'verifying'].includes(snapshot.value.phase))
  const failed = computed(() => !!localError.value || snapshot.value.phase === 'error')
  const progress = computed(() =>
    snapshot.value.total
      ? Math.min(100, Math.floor((snapshot.value.downloaded / snapshot.value.total) * 100))
      : null,
  )
  const errorKeys: Record<string, string> = {
    'update.not_published': 'settings.updateNotPublished',
    'update.unsupported': 'settings.updateUnsupported',
    'update.signature_failed': 'settings.signatureFailed',
    'update.download_failed': 'settings.downloadFailed',
    'update.install_failed': 'settings.installFailed',
    'update.invalid_source': 'settings.invalidUpdateSource',
    'update.game_active': 'settings.updateGameActive',
    'update.busy': 'settings.updateBusy',
    'update.not_ready': 'settings.updateNotReady',
  }
  const message = computed(() => {
    const error = localError.value ?? snapshot.value.errorCode
    if (error) return t(errorKeys[error] ?? 'settings.updateFailed')
    const keys = {
      idle: '',
      checking: 'settings.checking',
      up_to_date: 'settings.upToDate',
      available: 'settings.updateAvailable',
      downloading: 'settings.downloading',
      verifying: 'settings.verifying',
      ready: 'settings.updateReady',
      installing: 'settings.installing',
      error: 'settings.updateFailed',
    }
    const key = keys[snapshot.value.phase]
    return key
      ? t(key, { version: snapshot.value.latest })
      : demo
        ? (snapshot.value.notes ?? '')
        : ''
  })
  function accept(value: UpdateSnapshot) {
    if (!disposed && value.revision >= snapshot.value.revision) snapshot.value = value
  }
  async function sync() {
    if (disposed) return
    try {
      const tauriSettingsAdapter = await adapter()
      if (!disposed) accept(await tauriSettingsAdapter.getUpdateState())
    } catch {
      // An explicit action supplies retry feedback. Background recovery is read-only.
    } finally {
      if (!disposed && running.value)
        poll = setTimeout(() => {
          void sync()
        }, 500)
    }
  }
  onMounted(() => {
    void sync()
  })
  onScopeDispose(() => {
    disposed = true
    clearTimeout(poll)
    demo?.dispose()
  })
  async function run(action: 'check' | 'download' | 'install') {
    if (disposed || busy.value || opening.value) return
    if (action === 'download' && !snapshot.value.canDownload) return
    if (action === 'install' && !snapshot.value.canInstall) return
    acting.value = true
    localError.value = null
    confirmInstall.value = false
    try {
      const tauriSettingsAdapter = await adapter()
      if (disposed) return
      accept(
        await (action === 'check'
          ? tauriSettingsAdapter.checkUpdate()
          : action === 'download'
            ? tauriSettingsAdapter.downloadUpdate(accept)
            : tauriSettingsAdapter.installUpdate()),
      )
    } catch (error) {
      if (!disposed)
        localError.value = error instanceof DesktopServiceError ? error.code : 'update.ipc_failed'
    } finally {
      if (!disposed) acting.value = false
    }
  }
  async function cancel() {
    try {
      const tauriSettingsAdapter = await adapter()
      if (!disposed) await tauriSettingsAdapter.cancelUpdate()
    } catch {
      if (!disposed) feedback.notify(t('settings.cancelUpdateFailed'), 'error')
    }
  }
  async function openRelease() {
    if (disposed || busy.value || opening.value) return
    opening.value = true
    try {
      const tauriSettingsAdapter = await adapter()
      if (!disposed) await tauriSettingsAdapter.openReleasePage()
    } catch {
      if (!disposed) feedback.notify(t('settings.releaseOpenFailed'), 'error')
    } finally {
      if (!disposed) opening.value = false
    }
  }
  return {
    snapshot,
    checking,
    downloading,
    busy,
    opening,
    failed,
    progress,
    message,
    confirmInstall,
    run,
    cancel,
    openRelease,
  }
}
