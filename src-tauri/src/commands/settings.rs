use crate::lcu::error::LcuError;
use tauri::{State, WebviewWindow};

pub(super) fn check_window(window: &WebviewWindow) -> Result<(), LcuError> {
    if window.label() == "main" {
        Ok(())
    } else {
        Err(LcuError::internal("Settings are restricted to main"))
    }
}

#[tauri::command]
pub fn lcu_set_auto_accept(
    window: WebviewWindow,
    manager: State<'_, crate::lcu::gameflow_monitor::SystemGameflowManager>,
    enabled: bool,
) -> Result<bool, LcuError> {
    check_window(&window)?;
    manager.set_auto_accept(enabled);
    Ok(enabled)
}
