/** Backend codes map to local copy; raw native messages are never displayed. */
const ERROR_KEYS: Record<string, string> = {
  discovery_failed: 'connection.errors.discovery',
  invalid_lockfile: 'connection.errors.discovery',
  authentication_failed: 'connection.errors.authentication',
  connection_refused: 'connection.errors.refused',
  client_exited: 'connection.errors.exited',
  timeout: 'connection.errors.timeout',
  tls_error: 'connection.errors.tls',
  invalid_response: 'connection.errors.invalidResponse',
  http_status: 'connection.errors.unavailable',
  subscribe_failed: 'connection.errors.bridge',
  status_failed: 'connection.errors.bridge',
  start_failed: 'connection.errors.bridge',
  ipc_failed: 'connection.errors.bridge',
  retry_failed: 'connection.errors.bridge',
}
export function connectionErrorKey(code: string): string {
  const key = code.replace(/^lcu\./, '')
  return Object.hasOwn(ERROR_KEYS, key) ? ERROR_KEYS[key]! : 'connection.errors.unknown'
}
