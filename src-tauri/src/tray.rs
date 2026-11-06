use crate::lcu::SystemLcuManager;
use crate::lcu::models::LcuStatus;
use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIcon, TrayIconBuilder, TrayIconEvent};
use tauri::{App, AppHandle, Manager};

struct TrayStatus {
    icon: TrayIcon,
    item: MenuItem<tauri::Wry>,
}

fn status_label(status: LcuStatus) -> &'static str {
    match status {
        LcuStatus::UnsupportedPlatform => "当前平台不支持连接",
        LcuStatus::NotRunning => "未检测到英雄联盟客户端",
        LcuStatus::Discovering => "正在检测客户端",
        LcuStatus::Connecting => "正在连接",
        LcuStatus::Connected => "已连接",
        LcuStatus::Disconnected => "连接已断开",
        LcuStatus::Reconnecting => "正在重新连接",
        LcuStatus::Error => "连接失败",
    }
}

pub fn setup(app: &App) -> tauri::Result<()> {
    let icon = app
        .default_window_icon()
        .cloned()
        .ok_or(tauri::Error::InvalidIcon(std::io::Error::new(
            std::io::ErrorKind::NotFound,
            "Application icon missing",
        )))?;
    let status = status_label(app.state::<SystemLcuManager>().status().status);
    let status_item = MenuItem::new(app, format!("连接状态 · {status}"), false, None::<&str>)?;
    let open = MenuItem::with_id(app, "tray-open", "打开助手", true, None::<&str>)?;
    let minimize = MenuItem::with_id(app, "tray-minimize", "最小化窗口", true, None::<&str>)?;
    let retry = MenuItem::with_id(app, "tray-retry", "重新检测客户端", true, None::<&str>)?;
    let exit = MenuItem::with_id(app, "tray-exit", "退出助手", true, None::<&str>)?;
    let separator = PredefinedMenuItem::separator(app)?;
    let menu = Menu::with_items(
        app,
        &[&status_item, &open, &minimize, &retry, &separator, &exit],
    )?;

    let icon = TrayIconBuilder::with_id("aram-mayhem")
        .icon(icon)
        .tooltip(format!("ARAM: Mayhem · {status}"))
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id().as_ref() {
            "tray-open" => show_window(app),
            "tray-minimize" => {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.minimize();
                }
            }
            "tray-retry" => {
                let app = app.clone();
                tauri::async_runtime::spawn(async move {
                    crate::commands::lcu::start_monitoring(&app, &app.state::<SystemLcuManager>());
                });
            }
            "tray-exit" => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if matches!(
                event,
                TrayIconEvent::Click {
                    button: MouseButton::Left,
                    button_state: MouseButtonState::Up,
                    ..
                }
            ) {
                show_window(tray.app_handle());
            }
        })
        .build(app)?;
    app.manage(TrayStatus {
        icon,
        item: status_item,
    });
    Ok(())
}

fn show_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}

pub fn refresh_status(app: &AppHandle) {
    let handle = app.clone();
    let _ = app.run_on_main_thread(move || {
        if let Some(tray) = handle.try_state::<TrayStatus>() {
            // Read the latest state on the UI thread so queued callbacks cannot restore stale labels.
            let label = status_label(handle.state::<SystemLcuManager>().status().status);
            let _ = tray.item.set_text(format!("连接状态 · {label}"));
            let _ = tray
                .icon
                .set_tooltip(Some(format!("ARAM: Mayhem · {label}")));
        }
    });
}
