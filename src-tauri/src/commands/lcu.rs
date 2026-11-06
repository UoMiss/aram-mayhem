use crate::lcu::error::LcuError;
use crate::lcu::models::LcuStatusDto;
use crate::lcu::monitor::StatusCallback;
use crate::lcu::{LCU_STATUS_EVENT, SystemLcuManager};
use std::sync::Arc;
use tauri::{AppHandle, Emitter, State};

#[tauri::command]
pub fn lcu_get_connection_status(
    state: State<'_, SystemLcuManager>,
) -> Result<LcuStatusDto, LcuError> {
    let status = state.status();
    println!(
        "[lcu_get_connection_status] status={:?} source={:?}",
        status.status, status.source
    );
    Ok(status)
}

#[tauri::command]
pub async fn lcu_start_monitoring(
    app: AppHandle,
    state: State<'_, SystemLcuManager>,
) -> Result<LcuStatusDto, LcuError> {
    let status = start_monitoring(&app, &state);
    println!(
        "[lcu_start_monitoring] status={:?} source={:?} monitoring={}",
        status.status, status.source, status.monitoring
    );
    Ok(status)
}

pub(crate) fn start_monitoring(app: &AppHandle, state: &SystemLcuManager) -> LcuStatusDto {
    let app_handle = app.clone();
    let callback: StatusCallback = Arc::new(move |status| {
        let _ = app_handle.emit(LCU_STATUS_EVENT, status);
        #[cfg(windows)]
        crate::tray::refresh_status(&app_handle);
    });
    state.start_monitoring(callback)
}

#[tauri::command]
pub async fn lcu_stop_monitoring(
    state: State<'_, SystemLcuManager>,
) -> Result<LcuStatusDto, LcuError> {
    let status = state.stop_monitoring().await;
    println!(
        "[lcu_stop_monitoring] status={:?} monitoring={}",
        status.status, status.monitoring
    );
    Ok(status)
}
