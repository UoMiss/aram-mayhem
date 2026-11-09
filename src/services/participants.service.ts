import { isTauri } from '@tauri-apps/api/core'
import { demoParticipants } from '@/mocks/client-demo'
import type { ParticipantSnapshot } from '@/types/participants'
export type ParticipantsResult = { source: 'real' | 'mock'; snapshot: ParticipantSnapshot }
export async function getCustomParticipants(): Promise<ParticipantsResult> {
  if (!isTauri()) return { source: 'mock', snapshot: demoParticipants() }
  const { tauriParticipantsAdapter } = await import('@/adapters/tauri.adapter')
  return { source: 'real', snapshot: await tauriParticipantsAdapter.getCustomParticipants() }
}
