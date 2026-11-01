import { ref, type Ref } from 'vue'
import type { TeamPlayer } from '@/types/tools'
import { formatBeijingTime, splitTeams } from './teamRandomizer'

export const SHUFFLE_DURATION_MS = 3000
export const SHUFFLE_TICK_MS = 50
export const COUNTDOWN_STEP_MS = 1000

export interface UseTeamShuffleOptions {
  random?: () => number
  now?: () => Date
  animationMs?: number
  tickMs?: number
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
}

/**
 * 随机分组的 Vue 动画控制。纯洗牌算法在 teamRandomizer.ts 中独立测试。
 * 组件负责在卸载时调用 dispose()；关闭抽屉不会销毁状态。
 */
export function useTeamShuffle(
  players: readonly TeamPlayer[],
  options: UseTeamShuffleOptions = {},
): TeamShuffleController {
  const random = options.random ?? Math.random
  const now = options.now ?? (() => new Date())
  const animationMs = options.animationMs ?? SHUFFLE_DURATION_MS
  const tickMs = options.tickMs ?? SHUFFLE_TICK_MS
  const countdownStepMs = options.countdownStepMs ?? COUNTDOWN_STEP_MS

  const isShuffling = ref(false)
  const hasResult = ref(false)
  const groupA = ref<TeamPlayer[]>([])
  const groupB = ref<TeamPlayer[]>([])
  const countdown = ref(3)
  const randomTime = ref('')
  let countdownTimer: ReturnType<typeof setInterval> | null = null
  let shuffleTimer: ReturnType<typeof setInterval> | null = null
  let finishTimer: ReturnType<typeof setTimeout> | null = null

  function clearTimers() {
    if (countdownTimer) {
      clearInterval(countdownTimer)
      countdownTimer = null
    }
    if (shuffleTimer) {
      clearInterval(shuffleTimer)
      shuffleTimer = null
    }
    if (finishTimer) {
      clearTimeout(finishTimer)
      finishTimer = null
    }
  }

  function applySplit() {
    const split = splitTeams(players, random)
    groupA.value = split.groupA
    groupB.value = split.groupB
  }

  function finish() {
    clearTimers()
    applySplit()
    isShuffling.value = false
    countdown.value = 0
    randomTime.value = formatBeijingTime(now())
  }

  /** 返回 false 表示当前正在洗牌，重复点击被忽略。 */
  function start(): boolean {
    if (isShuffling.value) return false

    clearTimers()
    isShuffling.value = true
    hasResult.value = true
    countdown.value = 3
    randomTime.value = ''
    applySplit()

    countdownTimer = setInterval(() => {
      countdown.value -= 1
    }, countdownStepMs)

    shuffleTimer = setInterval(applySplit, tickMs)
    finishTimer = setTimeout(finish, animationMs)

    return true
  }

  function dispose() {
    clearTimers()
    isShuffling.value = false
  }

  return {
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
