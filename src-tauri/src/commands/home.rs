use crate::lcu::error::{LcuError, LcuErrorCode};
use crate::lcu::history::SystemHistorySource;
use crate::lcu::home::{HomeSnapshot, load_home};

/// Read-only current-account profile. No arbitrary player, path or URL parameters.
#[tauri::command]
pub async fn lcu_get_home_snapshot(window: tauri::WebviewWindow) -> Result<HomeSnapshot, LcuError> {
    if window.label() != "main" {
        return Err(LcuError::new(
            LcuErrorCode::Internal,
            "Home query is restricted to the main window",
        ));
    }
    load_home(&SystemHistorySource::connect()?).await
}
