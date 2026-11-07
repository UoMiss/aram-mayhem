import { UPDATE_PHASES, type UpdateSnapshot } from '@/types/settings'
import { boolean, nullable, object, string, unsigned } from './contracts'

const updateShape = object<UpdateSnapshot>({
  revision: unsigned,
  phase: (value): value is UpdateSnapshot['phase'] =>
    string(value) && UPDATE_PHASES.some((phase) => phase === value),
  latest: nullable(string),
  notes: nullable(string),
  downloaded: unsigned,
  total: nullable(unsigned),
  canDownload: boolean,
  canInstall: boolean,
  errorCode: nullable(string),
})
export function isUpdateSnapshot(value: unknown): value is UpdateSnapshot {
  if (!updateShape(value)) return false
  const busy = ['checking', 'downloading', 'verifying', 'installing'].includes(value.phase)
  return (
    (value.latest === null || /^\d+\.\d+\.\d+(?:\+[0-9A-Za-z.-]+)?$/.test(value.latest)) &&
    !(value.canInstall && value.canDownload) &&
    (!(value.canDownload || value.canInstall) || (value.latest !== null && !busy)) &&
    (value.phase !== 'ready' || value.canInstall) &&
    (value.notes === null || value.notes.length <= 12000)
  )
}
