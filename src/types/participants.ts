export interface LobbyParticipant {
  id: string
  name: string | null
}
export type RosterCompleteness = 'complete' | 'partial' | 'unknown'
export type RosterIssue =
  'missing_teams' | 'unresolved_slots' | 'conflicting_roster' | 'missing_context'
export interface ParticipantSnapshot {
  completeness: RosterCompleteness
  evidence: 'custom_teams' | 'members' | 'none'
  issue: RosterIssue | null
  eligibleCount: number
  unresolvedCount: number
  context: { sessionKey: string; connectionGeneration: number } | null
  accountKey: string
  lobbyKey: string | null
  status: 'custom' | 'party' | 'champ_select' | 'not_custom' | 'no_lobby'
  players: LobbyParticipant[]
  updatedAt: number
}
