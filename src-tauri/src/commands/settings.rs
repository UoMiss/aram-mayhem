use crate::lcu::SystemLcuManager;
use crate::lcu::error::LcuError;
use semver::Version;
use serde::Serialize;
use std::time::Duration;
use tauri::{State, WebviewWindow};
use tauri_plugin_autostart::ManagerExt;

fn check_window(window: &WebviewWindow) -> Result<(), LcuError> {
    if window.label() == "main" {
        Ok(())
    } else {
        Err(LcuError::internal("Settings are restricted to main"))
    }
}

#[tauri::command]
pub fn app_auto_start(window: WebviewWindow, enabled: Option<bool>) -> Result<bool, LcuError> {
    check_window(&window)?;
    let manager = window.autolaunch();
    let failure = |_| LcuError::internal("Could not access system startup settings");
    match enabled {
        Some(true) => manager.enable().map_err(failure)?,
        Some(false) => manager.disable().map_err(failure)?,
        None => {}
    }
    manager.is_enabled().map_err(failure)
}

#[tauri::command]
pub fn lcu_set_auto_retry(
    window: WebviewWindow,
    manager: State<'_, SystemLcuManager>,
    enabled: bool,
) -> Result<(), LcuError> {
    check_window(&window)?;
    manager.set_auto_retry(enabled);
    Ok(())
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateCheck {
    configured: bool,
    latest: Option<String>,
    available: bool,
}

#[tauri::command]
pub async fn app_check_update(window: WebviewWindow) -> Result<UpdateCheck, LcuError> {
    check_window(&window)?;
    let failure = || LcuError::internal("Could not read published releases");
    let Some(repository) = option_env!("ARAM_UPDATE_REPOSITORY").filter(|value| !value.is_empty())
    else {
        return Ok(UpdateCheck {
            configured: false,
            latest: None,
            available: false,
        });
    };
    let Some((owner, name)) = repository.split_once('/') else {
        return Err(failure());
    };
    if ![owner, name].iter().all(|part| {
        !part.is_empty()
            && *part != "."
            && *part != ".."
            && part
                .bytes()
                .all(|byte| byte.is_ascii_alphanumeric() || b"._-".contains(&byte))
    }) {
        return Err(failure());
    }
    let response = reqwest::Client::builder()
        .https_only(true)
        .redirect(reqwest::redirect::Policy::none())
        .timeout(Duration::from_secs(8))
        .build()
        .map_err(|_| failure())?
        .get(format!(
            "https://api.github.com/repos/{repository}/releases/latest"
        ))
        .header("Accept", "application/vnd.github+json")
        .header("User-Agent", "ARAM-Mayhem-Desktop")
        .send()
        .await
        .map_err(|_| failure())?;
    if response.status() == reqwest::StatusCode::NOT_FOUND {
        return Ok(UpdateCheck {
            configured: true,
            latest: None,
            available: false,
        });
    }
    let release: serde_json::Value = response
        .error_for_status()
        .map_err(|_| failure())?
        .json()
        .await
        .map_err(|_| failure())?;
    let tag = release
        .get("tag_name")
        .and_then(|value| value.as_str())
        .ok_or_else(failure)?;
    let latest = Version::parse(tag.strip_prefix('v').unwrap_or(tag)).map_err(|_| failure())?;
    let current = Version::parse(env!("CARGO_PKG_VERSION")).map_err(|_| failure())?;
    Ok(UpdateCheck {
        configured: true,
        available: latest.cmp_precedence(&current).is_gt(),
        latest: Some(latest.to_string()),
    })
}
