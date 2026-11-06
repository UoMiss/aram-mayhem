mod commands;
mod lcu;
mod scoring;
#[cfg(windows)]
mod tray;

use commands::app::{app_exit, app_health_check};
use commands::gameflow::{
    lcu_get_gameflow_snapshot, lcu_start_gameflow_monitoring, lcu_stop_gameflow_monitoring,
};
use commands::history::lcu_get_match_history;
use commands::home::lcu_get_home_snapshot;
use commands::lcu::{lcu_get_connection_status, lcu_start_monitoring, lcu_stop_monitoring};
use commands::match_rules::{lcu_get_locked_match_rule, lcu_lock_match_rule};
use commands::participants::lcu_get_custom_participants;
use commands::settings::{app_auto_start, app_check_update, lcu_set_auto_retry};
use commands::settlement::lcu_get_settlement;
use lcu::SystemLcuManager;
use lcu::gameflow_monitor::SystemGameflowManager;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default();
    #[cfg(windows)]
    let builder = builder
        .setup(|app| {
            if let Err(error) = tray::setup(app) {
                eprintln!("Failed to initialize the notification area icon: {error}");
            }
            Ok(())
        })
        .on_window_event(|window, event| {
            if window.label() == "main"
                && let tauri::WindowEvent::CloseRequested { api, .. } = event
            {
                api.prevent_close();
                if let Err(error) = window.minimize() {
                    eprintln!("Failed to minimize the main window: {error}");
                }
            }
        });
    let app = builder
        .plugin(tauri_plugin_autostart::Builder::new().build())
        .manage(SystemLcuManager::system())
        .manage(SystemGameflowManager::system())
        .invoke_handler(tauri::generate_handler![
            app_health_check,
            app_exit,
            app_auto_start,
            app_check_update,
            lcu_set_auto_retry,
            lcu_get_settlement,
            lcu_get_locked_match_rule,
            lcu_lock_match_rule,
            lcu_get_custom_participants,
            lcu_get_match_history,
            lcu_get_home_snapshot,
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
