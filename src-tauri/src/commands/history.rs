use crate::lcu::error::{LcuError, LcuErrorCode};
use crate::lcu::history::{MatchHistorySnapshot, SystemHistorySource, load_history_page};

/// Read-only current-account query, up to 20 records per page. No arbitrary player or URL input.
#[tauri::command]
pub async fn lcu_get_match_history(
    window: tauri::WebviewWindow,
    offset: Option<u32>,
) -> Result<MatchHistorySnapshot, LcuError> {
    if window.label() != "main" {
        return Err(LcuError::new(
            LcuErrorCode::Internal,
            "History query is restricted to the main window",
        ));
    }
    load_history_page(&SystemHistorySource::connect()?, offset.unwrap_or(0)).await
}
