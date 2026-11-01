export type AppRuntime = 'browser' | 'tauri'

/** Typed contract returned by the Rust app_health_check command. */
export interface AppHealth {
  status: 'ok' | 'degraded'
  runtime: AppRuntime
  appName: string
  appVersion: string
  platform: string
  simulated: boolean
}

/** All desktop abilities behind this adapter; pages never import Tauri directly. */
export interface DesktopAdapter {
  getHealth(): Promise<AppHealth>
}

/** Sanitized desktop service error; never contains a Rust stack trace. */
export interface DesktopServiceErrorShape {
  code: string
  message: string
}
