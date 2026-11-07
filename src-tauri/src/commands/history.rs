use crate::lcu::error::{LcuError, LcuErrorCode};
use crate::lcu::history::{MatchHistorySnapshot, SystemHistorySource, load_history};

/// Read-only current-account query, only the latest 20 records. No arbitrary player or URL input.
#[tauri::command]
pub async fn lcu_get_match_history(
    window: tauri::WebviewWindow,
) -> Result<MatchHistorySnapshot, LcuError> {
    if window.label() != "main" {
        return Err(LcuError::new(
            LcuErrorCode::Internal,
            "History query is restricted to the main window",
        ));
    }
    load_history(&SystemHistorySource::connect()?).await
}
