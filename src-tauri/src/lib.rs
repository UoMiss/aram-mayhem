mod commands;
mod lcu;

use commands::app::app_health_check;
use commands::lcu::{lcu_get_connection_status, lcu_start_monitoring, lcu_stop_monitoring};
use lcu::SystemLcuManager;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app = tauri::Builder::default()
        .manage(SystemLcuManager::system())
        .invoke_handler(tauri::generate_handler![
            app_health_check,
            lcu_get_connection_status,
            lcu_start_monitoring,
            lcu_stop_monitoring
        ])
        .build(tauri::generate_context!())
        .expect("error while building ARAM: Mayhem");

    app.run(|app_handle, event| {
        if let tauri::RunEvent::Exit = event {
            if let Some(manager) = app_handle.try_state::<SystemLcuManager>() {
                manager.shutdown();
            }
        }
    });
}
