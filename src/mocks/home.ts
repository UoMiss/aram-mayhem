import type { HomeProfile, ScoreRule } from '@/types/home'

export const INITIAL_SCORE_RULE: ScoreRule = 'damage'

/** 每次调用返回独立对象，避免多个 store 实例共享可变 Mock 数据。 */
export function createMockHomeProfile(): HomeProfile {
  return {
    summonerName: '峡谷小米',
    roomPhase: 'inRoom',
    gameMode: 'normal',
  }
}
