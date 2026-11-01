import type { HistoryFilter, MatchMode, MatchResult } from '@/types/history'
import type { HomeGameMode, HomeRoomPhase, ScoreRule } from '@/types/home'
import type { PlayerRelation, SettlementStat, TeamSide } from '@/types/match-detail'
import type { SettingKey } from '@/types/settings'
import type { GameflowPhase } from '@/types/lcu'

export const SCORE_RULE_NAME_KEYS: Record<ScoreRule, string> = {
  damage: 'rules.damage.name',
  lucky: 'rules.lucky.name',
  tail: 'rules.tail.name',
}

export const SCORE_RULE_DESCRIPTION_KEYS: Record<ScoreRule, string> = {
  damage: 'rules.damage.description',
  lucky: 'rules.lucky.description',
  tail: 'rules.tail.description',
}

export const HOME_ROOM_PHASE_KEYS: Record<HomeRoomPhase, string> = {
  inRoom: 'home.inRoom',
}

export const HOME_GAME_MODE_KEYS: Record<HomeGameMode, string> = {
  normal: 'home.matchMode',
}

export const HISTORY_FILTER_KEYS: Record<HistoryFilter, string> = {
  all: 'history.filters.all',
  hex: 'history.modes.hex',
  custom: 'history.modes.custom',
}

export const MATCH_MODE_KEYS: Record<MatchMode, string> = {
  hex: 'history.modes.hex',
  custom: 'history.modes.custom',
}

export const MATCH_RESULT_KEYS: Record<MatchResult, string> = {
  victory: 'history.results.victory',
  defeat: 'history.results.defeat',
}

export const TEAM_TITLE_KEYS: Record<TeamSide, string> = {
  red: 'matchDetail.teams.red',
  blue: 'matchDetail.teams.blue',
}

export const TEAM_BADGE_KEYS: Record<TeamSide, string> = {
  red: 'matchDetail.badges.red',
  blue: 'matchDetail.badges.blue',
}

export const PLAYER_RELATION_KEYS: Record<PlayerRelation, string> = {
  self: 'common.self',
  friend: 'common.friend',
}

export const STAT_LABEL_KEYS: Record<SettlementStat['key'], string> = {
  damage: 'matchDetail.stats.damage',
  taken: 'matchDetail.stats.taken',
  healing: 'matchDetail.stats.healing',
}

export const SETTING_LABEL_KEYS: Record<SettingKey, string> = {
  autoStart: 'settings.autoStart',
  autoRetry: 'settings.autoRetry',
  soundEffects: 'settings.soundEffects',
}

export const GAMEFLOW_PHASE_KEYS: Record<GameflowPhase, string> = {
  none: 'gameflow.phases.none',
  lobby: 'gameflow.phases.lobby',
  matchmaking: 'gameflow.phases.matchmaking',
  ready_check: 'gameflow.phases.ready_check',
  champ_select: 'gameflow.phases.champ_select',
  game_start: 'gameflow.phases.game_start',
  in_progress: 'gameflow.phases.in_progress',
  reconnect: 'gameflow.phases.reconnect',
  waiting_for_stats: 'gameflow.phases.waiting_for_stats',
  pre_end_of_game: 'gameflow.phases.pre_end_of_game',
  end_of_game: 'gameflow.phases.end_of_game',
  terminated_in_error: 'gameflow.phases.terminated_in_error',
  unknown: 'gameflow.phases.unknown',
}
