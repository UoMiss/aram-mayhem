import { isTauri } from '@tauri-apps/api/core'
import { TEAM_DRAW_PLAYERS } from '@/mocks/tools'
import type { ParticipantSnapshot } from '@/types/participants'
import type { TeamPlayer } from '@/types/tools'
export type ParticipantsResult =
  | { source: 'real'; snapshot: ParticipantSnapshot }
  | { source: 'mock'; players: readonly TeamPlayer[] }
export async function getCustomParticipants(): Promise<ParticipantsResult> {
  if (!isTauri()) return { source: 'mock', players: TEAM_DRAW_PLAYERS }
  const { tauriParticipantsAdapter } = await import('@/adapters/tauri.adapter')
  return { source: 'real', snapshot: await tauriParticipantsAdapter.getCustomParticipants() }
}
