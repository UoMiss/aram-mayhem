import { ref, toValue, type MaybeRefOrGetter, type Ref } from 'vue'
import type { TeamPlayer, TeamSplit } from '@/types/tools'
import { formatBeijingTime, splitCustomTeams } from './teamRandomizer'

export const SHUFFLE_DURATION_MS = 3000
export const COUNTDOWN_STEP_MS = 1000
const PREVIEW_STEP_MS = 120

export interface UseTeamShuffleOptions {
  random?: () => number
  now?: () => Date
  animationMs?: number
  countdownStepMs?: number
  beforeReveal?: () => Promise<boolean>
}

export interface TeamShuffleController {
  isShuffling: Ref<boolean>
  hasResult: Ref<boolean>
  groupA: Ref<TeamPlayer[]>
  groupB: Ref<TeamPlayer[]>
  countdown: Ref<number>
  randomTime: Ref<string>
  start: () => boolean
  dispose: () => void
  reset: () => void
}

/**
 * 随机分组的 Vue 动画控制。纯洗牌算法在 teamRandomizer.ts 中独立测试。
 * 最终分组只计算一次，名单复核通过后才揭晓；组件关闭时调用 reset()。
 */
export function useTeamShuffle(
  players: MaybeRefOrGetter<readonly TeamPlayer[]>,
  options: UseTeamShuffleOptions = {},
): TeamShuffleController {
  const { random, beforeReveal } = options
  const now = options.now ?? (() => new Date())
  const animationMs = options.animationMs ?? SHUFFLE_DURATION_MS
  const countdownStepMs = options.countdownStepMs ?? COUNTDOWN_STEP_MS

  const isShuffling = ref(false)
  const hasResult = ref(false)
  const groupA = ref<TeamPlayer[]>([])
  const groupB = ref<TeamPlayer[]>([])
  const countdown = ref(3)
  const randomTime = ref('')
  let drawPlayers: readonly TeamPlayer[] = []
  let finalSplit: TeamSplit | null = null
  let previewOffset = 0
  let previewTimer: ReturnType<typeof setInterval> | null = null
  let countdownTimer: ReturnType<typeof setInterval> | null = null
  let finishTimer: ReturnType<typeof setTimeout> | null = null

  function clearTimers() {
    if (previewTimer) {
      clearInterval(previewTimer)
      previewTimer = null
    }
    if (countdownTimer) {
      clearInterval(countdownTimer)
      countdownTimer = null
    }
    if (finishTimer) {
      clearTimeout(finishTimer)
      finishTimer = null
    }
  }

  function showPreview() {
    // Visual rotation only: never consume or overwrite the final draw's randomness.
    const preview = [...drawPlayers.slice(previewOffset), ...drawPlayers.slice(0, previewOffset)]
    groupA.value = preview.slice(0, preview.length / 2)
    groupB.value = preview.slice(preview.length / 2)
    previewOffset = (previewOffset + 1) % drawPlayers.length
  }

  async function finish() {
    clearTimers()
    const split = finalSplit
    if (!split) return
    countdown.value = 0
    if (beforeReveal) {
      const confirmed = await beforeReveal().catch(() => false)
      if (finalSplit !== split) return
      if (!confirmed) {
        reset()
        return
      }
    }
    groupA.value = split.groupA
    groupB.value = split.groupB
    finalSplit = null
    randomTime.value = formatBeijingTime(now())
    hasResult.value = true
    isShuffling.value = false
  }

  /** 返回 false 表示当前正在洗牌，重复点击被忽略。 */
  function start(): boolean {
    if (isShuffling.value) return false

    drawPlayers = toValue(players).map((player) => ({ ...player }))
    try {
      finalSplit = splitCustomTeams(drawPlayers, random)
    } catch {
      reset()
      return false
    }
    clearTimers()
    hasResult.value = false
    isShuffling.value = true
    countdown.value = 3
    randomTime.value = ''
    previewOffset = 0
    showPreview()
    const reducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    // Reduced motion disables rapid movement, not the three-second reveal.
    if (!reducedMotion) previewTimer = setInterval(showPreview, PREVIEW_STEP_MS)
    countdownTimer = setInterval(() => {
      countdown.value -= 1
    }, countdownStepMs)

    finishTimer = setTimeout(() => {
      void finish()
    }, animationMs)

    return true
  }

  function dispose() {
    clearTimers()
    finalSplit = null
    isShuffling.value = false
  }

  function reset() {
    dispose()
    hasResult.value = false
    groupA.value = []
    groupB.value = []
    countdown.value = 3
    randomTime.value = ''
    drawPlayers = []
  }

  return {
    reset,
    isShuffling,
    hasResult,
    groupA,
    groupB,
    countdown,
    randomTime,
    start,
    dispose,
  }
}
