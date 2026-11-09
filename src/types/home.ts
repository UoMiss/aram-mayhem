import type { GameflowPhase } from './lcu'
import type { MatchMode } from './history'

/** 原始 HTML 中首页展示的算分规则集合。 */
export type ScoreRule = 'damage' | 'lucky' | 'tail' | 'damage_size'

/** 规则可以被关闭；关闭后首页显示“未选择规则”。 */
export type ScoreRuleSelection = ScoreRule | null

/** 首页房间与真实对局阶段；稳定业务值，显示文案由 i18n 映射。 */
export type HomeRoomPhase = 'inRoom' | GameflowPhase

/** 首页游戏模式；稳定业务值，显示文案由 i18n 映射。 */
export type HomeGameMode = 'normal' | MatchMode

/** 首页演示资料；昵称属于数据，不进入语言包。 */
export interface HomeProfile {
  summonerName: string
  roomPhase: HomeRoomPhase
  gameMode: HomeGameMode
}

/** HomePage.vue 的只读视图模型；只保留业务值，不保存展示文案。 */
export interface HomeViewModel {
  isConnected: boolean
  summonerName: string | null
  roomPhase: HomeRoomPhase | null
  gameMode: HomeGameMode | null
}
