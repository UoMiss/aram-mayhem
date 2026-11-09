import { APP_VERSION } from '@/shared/constants/app'
import { DesktopServiceError } from '@/services/desktop-error'
import type { UpdateSnapshot } from '@/types/settings'
import type { GameflowPhase } from '@/types/lcu'
import { i18n } from '@/i18n'

/** UI simulation only: no download, filesystem, process or native IPC access. */
export function createDemoUpdater(phase: () => GameflowPhase | null | undefined) {
  let state: UpdateSnapshot = {
    revision: 0,
    phase: 'idle',
    latest: null,
    notes: null,
    downloaded: 0,
    total: null,
    canDownload: false,
    canInstall: false,
    errorCode: null,
  }
  let generation = 0
  const timers = new Map<ReturnType<typeof setTimeout>, () => void>()
  const wait = (ms: number) =>
    new Promise<void>((resolve) => {
      const timer = setTimeout(() => {
        timers.delete(timer)
        resolve()
      }, ms)
      timers.set(timer, resolve)
    })
  const change = (patch: Partial<UpdateSnapshot>) =>
    (state = { ...state, ...patch, revision: state.revision + 1 })
  const safe = () => ['none', 'lobby', 'end_of_game', 'terminated_in_error'].includes(phase() ?? '')
  const getUpdateState = async () => ({ ...state, canInstall: state.phase === 'ready' && safe() })
  return {
    getUpdateState,
    async checkUpdate() {
      const token = ++generation
      change({ phase: 'checking', canDownload: false, canInstall: false })
      await wait(450)
      if (token !== generation) return getUpdateState()
      const parts = APP_VERSION.split('.').map(Number)
      return change({
        phase: 'available',
        latest: `${parts[0]}.${parts[1]}.${parts[2]! + 1}`,
        notes: i18n.global.t('demo.updateNotice'),
        canDownload: true,
      })
    },
    async downloadUpdate(progress: (value: UpdateSnapshot) => void) {
      const token = ++generation
      progress(
        change({
          phase: 'downloading',
          downloaded: 0,
          total: 100,
          canDownload: false,
          canInstall: false,
        }),
      )
      for (let downloaded = 20; downloaded <= 100; downloaded += 20) {
        await wait(300)
        if (token !== generation) return getUpdateState()
        progress(change({ downloaded }))
      }
      progress(change({ phase: 'verifying' }))
      await wait(300)
      if (token !== generation) return getUpdateState()
      return change({ phase: 'ready', canInstall: safe() })
    },
    async cancelUpdate() {
      generation++
      change({ phase: 'available', downloaded: 0, canDownload: true, canInstall: false })
    },
    async installUpdate() {
      if (!safe()) throw new DesktopServiceError('update.game_active', 'Demo game active')
      if (state.phase !== 'ready')
        throw new DesktopServiceError('update.not_ready', 'Demo not ready')
      const token = ++generation
      change({ phase: 'installing', canInstall: false })
      await wait(600)
      if (token !== generation) return getUpdateState()
      return change({ phase: 'idle', notes: i18n.global.t('demo.installNotice') })
    },
    async openReleasePage() {
      window.open('https://github.com/UoMiss/aram-mayhem/releases', '_blank', 'noopener,noreferrer')
    },
    dispose() {
      generation++
      for (const [timer, resolve] of timers) {
        clearTimeout(timer)
        resolve()
      }
      timers.clear()
    },
  }
}
