mod commands;
mod lcu;

use commands::app::app_health_check;
use commands::gameflow::{
    lcu_get_gameflow_snapshot, lcu_start_gameflow_monitoring, lcu_stop_gameflow_monitoring,
};
use commands::lcu::{lcu_get_connection_status, lcu_start_monitoring, lcu_stop_monitoring};
use lcu::SystemLcuManager;
use lcu::gameflow_monitor::SystemGameflowManager;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app = tauri::Builder::default()
        .manage(SystemLcuManager::system())
        .manage(SystemGameflowManager::system())
        .invoke_handler(tauri::generate_handler![
            app_health_check,
            lcu_get_connection_status,
            lcu_start_monitoring,
            lcu_stop_monitoring,
            lcu_get_gameflow_snapshot,
            lcu_start_gameflow_monitoring,
            lcu_stop_gameflow_monitoring
        ])
        .build(tauri::generate_context!())
        .expect("error while building ARAM: Mayhem");

    app.run(|app_handle, event| {
        if let tauri::RunEvent::Exit = event {
            if let Some(manager) = app_handle.try_state::<SystemLcuManager>() {
                manager.shutdown();
            }
            if let Some(manager) = app_handle.try_state::<SystemGameflowManager>() {
                manager.shutdown();
            }
        }
    });
}
