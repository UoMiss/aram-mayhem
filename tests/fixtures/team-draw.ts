import type { TeamPlayer } from '@/types/tools'

export const TEAM_DRAW_PLAYERS: readonly TeamPlayer[] = Array.from({ length: 8 }, (_, index) => ({
  id: `team-player-${index + 1}`,
  name: `测试玩家 ${index + 1}`,
}))
