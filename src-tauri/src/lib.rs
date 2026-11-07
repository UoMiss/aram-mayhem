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
use commands::metadata::lcu_get_game_metadata;
use commands::participants::lcu_get_custom_participants;
use commands::settings::lcu_set_auto_accept;
use commands::settlement::lcu_get_settlement;
use commands::updates::{
    UpdateState, app_cancel_update, app_check_update, app_download_update, app_get_update_state,
    app_install_update, app_open_release_page,
};
use lcu::SystemLcuManager;
use lcu::gameflow_monitor::SystemGameflowManager;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default().setup(|app| {
        // Migration only: remove startup registration left by older versions.
        // No command or frontend permission can enable autostart again.
        use tauri_plugin_autostart::ManagerExt;
        let startup = app.autolaunch();
        match startup.is_enabled() {
            Ok(true) => {
                if startup.disable().is_err() {
                    eprintln!("Could not remove legacy startup registration");
                }
            }
            Ok(false) => {}
            Err(_) => eprintln!("Could not inspect legacy startup registration"),
        }
        #[cfg(windows)]
        if let Err(error) = tray::setup(app) {
            eprintln!("Failed to initialize the notification area icon: {error}");
        }
        Ok(())
    });
    #[cfg(windows)]
    let builder = builder.on_window_event(|window, event| {
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
        .plugin(
            tauri_plugin_opener::Builder::new()
                .open_js_links_on_click(false)
                .build(),
        )
        .plugin(tauri_plugin_updater::Builder::new().build())
        .manage(UpdateState::default())
        .manage(lcu::metadata::MetadataCache::default())
        .manage(SystemLcuManager::system())
        .manage(SystemGameflowManager::system())
        .invoke_handler(tauri::generate_handler![
            app_health_check,
            app_exit,
            app_check_update,
            app_download_update,
            app_cancel_update,
            app_install_update,
            app_get_update_state,
            app_open_release_page,
            lcu_set_auto_accept,
            lcu_get_settlement,
            lcu_get_locked_match_rule,
            lcu_lock_match_rule,
            lcu_get_custom_participants,
            lcu_get_match_history,
            lcu_get_home_snapshot,
            lcu_get_game_metadata,
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
