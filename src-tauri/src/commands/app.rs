use serde::Serialize;

/// Stable response contract for the frontend. Camel-case matches the TypeScript type.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppHealth {
    pub status: String,
    pub runtime: String,
    pub app_name: String,
    pub app_version: String,
    pub platform: String,
    pub simulated: bool,
}

/// Minimal typed error. It deliberately contains no host stack trace.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct AppError {
    pub code: String,
    pub message: String,
}

impl AppError {
    pub fn new(code: impl Into<String>, message: impl Into<String>) -> Self {
        Self {
            code: code.into(),
            message: message.into(),
        }
    }
}

pub fn health() -> AppHealth {
    AppHealth {
        status: "ok".to_string(),
        runtime: "tauri".to_string(),
        app_name: "ARAM: Mayhem".to_string(),
        app_version: env!("CARGO_PKG_VERSION").to_string(),
        platform: std::env::consts::OS.to_string(),
        // The project intentionally uses Mock data in this phase; no LCU is connected.
        simulated: true,
    }
}

/// Minimal IPC probe used by the frontend desktop adapter.
/// The project remains Mock-backed; this command only reports shell health.
#[tauri::command]
pub fn app_health_check() -> Result<AppHealth, AppError> {
    let health = health();
    if health.status != "ok" {
        return Err(AppError::new(
            "desktop.unhealthy",
            "Desktop health check failed",
        ));
    }
    println!(
        "[app_health_check] runtime={} status={} version={} simulated={}",
        health.runtime, health.status, health.app_version, health.simulated
    );
    Ok(health)
}

#[tauri::command]
pub fn app_exit(window: tauri::WebviewWindow) -> Result<(), AppError> {
    use tauri::Manager;

    if window.label() != "main" {
        return Err(AppError::new(
            "desktop.exit_failed",
            "Exit is restricted to main",
        ));
    }
    window.app_handle().exit(0);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn health_contract_is_stable_and_mock_only() {
        let health = health();
        assert_eq!(health.status, "ok");
        assert_eq!(health.runtime, "tauri");
        assert_eq!(health.app_name, "ARAM: Mayhem");
        assert_eq!(health.app_version, env!("CARGO_PKG_VERSION"));
        assert_eq!(health.platform, std::env::consts::OS);
        assert!(health.simulated);
    }

    #[test]
    fn error_is_typed_and_has_no_stack_trace() {
        let error = AppError::new("desktop.ipc_failed", "Desktop IPC failed");
        let json = serde_json::to_value(&error).expect("serialize error");
        assert_eq!(json["code"], "desktop.ipc_failed");
        assert_eq!(json["message"], "Desktop IPC failed");
        assert!(json.get("stack").is_none());
    }

    #[test]
    fn health_serializes_to_camel_case_contract() {
        let json = serde_json::to_value(health()).expect("serialize health");
        assert!(json.get("appName").is_some());
        assert!(json.get("appVersion").is_some());
        assert!(json.get("stack").is_none());
    }
}
