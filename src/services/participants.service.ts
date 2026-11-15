import { isTauri } from '@tauri-apps/api/core'
import { previewRuntime } from '@/adapters/preview-runtime'
import { requireTauri } from './runtime-source'
import type { ParticipantSnapshot } from '@/types/participants'
export type ParticipantsResult = { source: 'real' | 'mock'; snapshot: ParticipantSnapshot }
export async function getCustomParticipants(): Promise<ParticipantsResult> {
  if (previewRuntime && !isTauri())
    return { source: 'mock', snapshot: previewRuntime.participants() }
  requireTauri()
  const { tauriParticipantsAdapter } = await import('@/adapters/tauri.adapter')
  return { source: 'real', snapshot: await tauriParticipantsAdapter.getCustomParticipants() }
}
