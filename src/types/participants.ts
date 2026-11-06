export interface LobbyParticipant {
  id: string
  name: string | null
}
export interface ParticipantSnapshot {
  accountKey: string
  lobbyKey: string | null
  status: 'custom' | 'party' | 'champ_select' | 'not_custom' | 'no_lobby'
  players: LobbyParticipant[]
  updatedAt: number
}
