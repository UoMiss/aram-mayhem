import { ref, toValue, type MaybeRefOrGetter, type Ref } from 'vue'
import type { TeamPlayer } from '@/types/tools'
import { formatBeijingTime, splitCustomTeams } from './teamRandomizer'

export const SHUFFLE_DURATION_MS = 3000
export const COUNTDOWN_STEP_MS = 1000

export interface UseTeamShuffleOptions {
  random?: () => number
  now?: () => Date
  animationMs?: number
  countdownStepMs?: number
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
 * 最终分组只计算一次；组件关闭时调用 reset()，动画仅控制展示。
 */
export function useTeamShuffle(
  players: MaybeRefOrGetter<readonly TeamPlayer[]>,
  options: UseTeamShuffleOptions = {},
): TeamShuffleController {
  const random = options.random
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
  let countdownTimer: ReturnType<typeof setInterval> | null = null
  let finishTimer: ReturnType<typeof setTimeout> | null = null

  function clearTimers() {
    if (countdownTimer) {
      clearInterval(countdownTimer)
      countdownTimer = null
    }
    if (finishTimer) {
      clearTimeout(finishTimer)
      finishTimer = null
    }
  }

  function applySplit() {
    const split = splitCustomTeams(drawPlayers, random)
    groupA.value = split.groupA
    groupB.value = split.groupB
  }

  function finish() {
    clearTimers()
    isShuffling.value = false
    countdown.value = 0
    randomTime.value = formatBeijingTime(now())
  }

  /** 返回 false 表示当前正在洗牌，重复点击被忽略。 */
  function start(): boolean {
    if (isShuffling.value) return false

    drawPlayers = toValue(players).map((player) => ({ ...player }))
    try {
      applySplit()
    } catch {
      reset()
      return false
    }
    clearTimers()
    hasResult.value = true
    if (
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    ) {
      finish()
      return true
    }
    isShuffling.value = true
    countdown.value = 3
    randomTime.value = ''
    countdownTimer = setInterval(() => {
      countdown.value -= 1
    }, countdownStepMs)

    finishTimer = setTimeout(finish, animationMs)

    return true
  }

  function dispose() {
    clearTimers()
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
