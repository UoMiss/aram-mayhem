use super::app::AppError;
use crate::lcu::gameflow_monitor::SystemGameflowManager;
use serde::Serialize;
use std::sync::{Mutex, MutexGuard};
use std::time::Duration;
use tauri::{State, WebviewWindow, ipc::Channel};
use tauri_plugin_opener::OpenerExt;
use tauri_plugin_updater::{Update, UpdaterExt};
use tokio::sync::{Mutex as AsyncMutex, watch};

const RELEASE_PAGE: &str = "https://github.com/UoMiss/aram-mayhem/releases";

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Default)]
#[serde(rename_all = "snake_case")]
pub enum UpdatePhase {
    #[default]
    Idle,
    Checking,
    UpToDate,
    Available,
    Downloading,
    Verifying,
    Ready,
    Installing,
    Error,
}

#[derive(Debug, Clone, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct UpdateSnapshot {
    revision: u64,
    phase: UpdatePhase,
    latest: Option<String>,
    notes: Option<String>,
    downloaded: u64,
    total: Option<u64>,
    can_download: bool,
    can_install: bool,
    error_code: Option<String>,
}

#[derive(Default)]
struct UpdateData {
    snapshot: UpdateSnapshot,
    update: Option<Update>,
    bytes: Option<Vec<u8>>,
    cancel: Option<watch::Sender<bool>>,
}

#[derive(Default)]
pub struct UpdateState {
    operation: AsyncMutex<()>,
    data: Mutex<UpdateData>,
}

impl UpdateState {
    fn data(&self) -> MutexGuard<'_, UpdateData> {
        self.data.lock().unwrap_or_else(|error| error.into_inner())
    }
    fn change(&self, change: impl FnOnce(&mut UpdateData)) -> UpdateSnapshot {
        let mut data = self.data();
        change(&mut data);
        data.snapshot.revision += 1;
        let idle = !matches!(
            data.snapshot.phase,
            UpdatePhase::Checking
                | UpdatePhase::Downloading
                | UpdatePhase::Verifying
                | UpdatePhase::Installing
        );
        data.snapshot.can_download = idle && data.update.is_some() && data.bytes.is_none();
        data.snapshot.can_install = idle && data.update.is_some() && data.bytes.is_some();
        data.snapshot.clone()
    }
    fn fail(&self, code: &str) -> UpdateSnapshot {
        self.change(|data| {
            data.snapshot.phase = UpdatePhase::Error;
            data.snapshot.error_code = Some(code.into());
            data.cancel = None;
        })
    }
}

fn error(code: &str) -> AppError {
    AppError::new(code, "Update operation could not be completed")
}
fn check_window(window: &WebviewWindow) -> Result<(), AppError> {
    if window.label() != "main" {
        return Err(error("update.denied"));
    }
    Ok(())
}
fn platform_supported() -> bool {
    cfg!(all(windows, target_arch = "x86_64"))
}

fn update_error(error: &tauri_plugin_updater::Error, fallback: &'static str) -> &'static str {
    use tauri_plugin_updater::Error::*;
    match error {
        ReleaseNotFound => "update.not_published",
        TargetNotFound(_) | TargetsNotFound(_) | UnsupportedArch | UnsupportedOs => {
            "update.unsupported"
        }
        Minisign(_)
        | Base64(_)
        | SignatureUtf8(_)
        | SignedVersionMismatch { .. }
        | MissingSignedVersion => "update.signature_failed",
        _ => fallback,
    }
}

fn trusted_download(version: &str, url: &str) -> bool {
    if semver::Version::parse(version).is_err() {
        return false;
    }
    [version.to_string(), format!("v{version}")]
        .iter()
        .any(|tag| {
            url == format!("{RELEASE_PAGE}/download/{tag}/aram-mayhem-windows-x64-setup.exe")
        })
}

#[tauri::command]
pub fn app_get_update_state(
    window: WebviewWindow,
    state: State<'_, UpdateState>,
) -> Result<UpdateSnapshot, AppError> {
    check_window(&window)?;
    Ok(state.data().snapshot.clone())
}

#[tauri::command]
pub async fn app_check_update(
    window: WebviewWindow,
    state: State<'_, UpdateState>,
) -> Result<UpdateSnapshot, AppError> {
    check_window(&window)?;
    let _operation = state
        .operation
        .try_lock()
        .map_err(|_| error("update.busy"))?;
    if !platform_supported() {
        return Ok(state.fail("update.unsupported"));
    }
    state.change(|data| {
        let revision = data.snapshot.revision;
        *data = UpdateData::default();
        data.snapshot.revision = revision;
        data.snapshot.phase = UpdatePhase::Checking;
    });
    let updater = match window
        .updater_builder()
        .timeout(Duration::from_secs(15))
        .version_comparator(|current, remote| {
            remote.version.pre.is_empty() && remote.version.cmp_precedence(&current).is_gt()
        })
        .build()
    {
        Ok(updater) => updater,
        Err(_) => return Ok(state.fail("update.check_failed")),
    };
    match updater.check().await {
        Ok(Some(mut update)) => {
            if !trusted_download(&update.version, update.download_url.as_str()) {
                return Ok(state.fail("update.invalid_source"));
            }
            update.timeout = Some(Duration::from_secs(300));
            Ok(state.change(|data| {
                data.snapshot.phase = UpdatePhase::Available;
                data.snapshot.latest = Some(update.version.clone());
                data.snapshot.notes = update
                    .body
                    .as_ref()
                    .map(|body| body.chars().take(6000).collect());
                data.update = Some(update);
            }))
        }
        Ok(None) => Ok(state.change(|data| data.snapshot.phase = UpdatePhase::UpToDate)),
        Err(error) => Ok(state.fail(update_error(&error, "update.check_failed"))),
    }
}

#[tauri::command]
pub async fn app_download_update(
    window: WebviewWindow,
    state: State<'_, UpdateState>,
    on_progress: Channel<UpdateSnapshot>,
) -> Result<UpdateSnapshot, AppError> {
    check_window(&window)?;
    let _operation = state
        .operation
        .try_lock()
        .map_err(|_| error("update.busy"))?;
    let update = {
        let data = state.data();
        if !data.snapshot.can_download {
            return Err(error("update.not_ready"));
        }
        data.update
            .clone()
            .ok_or_else(|| error("update.not_ready"))?
    };
    let (cancel, mut cancelled) = watch::channel(false);
    let snapshot = state.change(|data| {
        data.bytes = None;
        data.cancel = Some(cancel);
        data.snapshot.phase = UpdatePhase::Downloading;
        data.snapshot.downloaded = 0;
        data.snapshot.total = None;
        data.snapshot.error_code = None;
    });
    let _ = on_progress.send(snapshot);
    let result = tokio::select! {
        biased;
        _ = cancelled.changed() => None,
        result = update.download(
            |chunk, total| {
                let snapshot = state.change(|data| {
                    data.snapshot.downloaded = data.snapshot.downloaded.saturating_add(chunk as u64);
                    data.snapshot.total = total.filter(|value| *value > 0);
                });
                let _ = on_progress.send(snapshot);
            },
            || { let _ = on_progress.send(state.change(|data| data.snapshot.phase = UpdatePhase::Verifying)); },
        ) => Some(result),
    };
    // Cancellation may race with the final chunk/signature verification.
    if *cancelled.borrow() || result.is_none() {
        return Ok(state.change(|data| {
            data.cancel = None;
            data.bytes = None;
            data.snapshot.phase = UpdatePhase::Available;
            data.snapshot.downloaded = 0;
            data.snapshot.total = None;
        }));
    }
    match result.expect("download result checked above") {
        Ok(bytes) => Ok(state.change(|data| {
            data.bytes = Some(bytes);
            data.cancel = None;
            data.snapshot.phase = UpdatePhase::Ready;
        })),
        Err(error) => Ok(state.fail(update_error(&error, "update.download_failed"))),
    }
}

#[tauri::command]
pub fn app_cancel_update(
    window: WebviewWindow,
    state: State<'_, UpdateState>,
) -> Result<(), AppError> {
    check_window(&window)?;
    if let Some(cancel) = &state.data().cancel {
        let _ = cancel.send(true);
    }
    Ok(())
}

#[tauri::command]
pub async fn app_install_update(
    window: WebviewWindow,
    state: State<'_, UpdateState>,
    gameflow: State<'_, SystemGameflowManager>,
) -> Result<UpdateSnapshot, AppError> {
    check_window(&window)?;
    let _operation = state
        .operation
        .try_lock()
        .map_err(|_| error("update.busy"))?;
    if !platform_supported() {
        return Ok(state.fail("update.unsupported"));
    }
    if gameflow.install_blocked() {
        return Ok(state.fail("update.game_active"));
    }
    let (update, bytes) = {
        let mut data = state.data();
        if !data.snapshot.can_install {
            return Err(error("update.not_ready"));
        }
        let update = data
            .update
            .clone()
            .ok_or_else(|| error("update.not_ready"))?;
        let bytes = data.bytes.take().ok_or_else(|| error("update.not_ready"))?;
        (update, bytes)
    };
    state.change(|data| {
        data.snapshot.phase = UpdatePhase::Installing;
        data.snapshot.error_code = None;
    });
    // Official installer re-verifies bytes, starts NSIS, and exits only after a successful launch.
    // Installation is never triggered by a download callback or a page lifecycle hook.
    match update.install(&bytes) {
        Ok(()) => Ok(state.data().snapshot.clone()),
        Err(error) => {
            let code = update_error(&error, "update.install_failed");
            if code != "update.signature_failed" {
                state.data().bytes = Some(bytes);
            }
            Ok(state.fail(code))
        }
    }
}

#[tauri::command]
pub fn app_open_release_page(window: WebviewWindow) -> Result<(), AppError> {
    check_window(&window)?;
    window
        .opener()
        .open_url(RELEASE_PAGE, None::<&str>)
        .map_err(|_| error("update.open_failed"))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::lcu::gameflow::{
        GameflowMachine, GameflowPhase, GameflowReading, GameflowTransport,
    };
    use crate::lcu::models::LcuSourceKind;
    use serde_json::json;

    fn observe(machine: &mut GameflowMachine, raw: &str) {
        machine.observe(
            1,
            GameflowReading {
                raw_phase: raw.into(),
                phase: GameflowPhase::parse(raw),
                lobby: None,
                champion_select: None,
                game_id: Some("123".into()),
                game: None,
            },
            GameflowTransport::Polling,
        );
    }
    #[test]
    fn official_updater_rejects_tampering_and_version_relabeling() {
        let fixture: serde_json::Value = serde_json::from_str(include_str!(
            "../../../tests/fixtures/updater-signature.json"
        ))
        .unwrap();
        let mut context = tauri::test::mock_context(tauri::test::noop_assets());
        context.config_mut().plugins.0.insert(
            "updater".into(),
            json!({
                "pubkey": fixture["publicKey"], "requireSignedVersion": true,
                "endpoints": ["https://example.invalid/latest.json"]
            }),
        );
        let app = tauri::test::mock_builder()
            .plugin(tauri_plugin_updater::Builder::new().build())
            .build(context)
            .unwrap();
        let updater = app
            .updater_builder()
            .target("windows-x86_64")
            .build()
            .unwrap();
        let manifest = json!({ "version": "2.0.0", "platforms": {"windows-x86_64": {
            "url": "https://github.com/UoMiss/aram-mayhem/releases/download/v2.0.0/aram-mayhem-windows-x64-setup.exe",
            "signature": fixture["signature"]
        }}});
        let update = updater.restore_update(manifest.clone()).unwrap().unwrap();
        let payload = fixture["payload"].as_str().unwrap().as_bytes();
        assert!(update.verify(payload).is_ok());
        assert!(update.verify(b"tampered installer").is_err());
        let state = UpdateState::default();
        let available = state.change(|data| {
            data.update = Some(update.clone());
            data.snapshot.phase = UpdatePhase::Available;
            data.snapshot.latest = Some(update.version.clone());
        });
        assert!(available.can_download && !available.can_install);
        let verifying = state.change(|data| data.snapshot.phase = UpdatePhase::Verifying);
        assert!(!verifying.can_download && !verifying.can_install);
        let ready = state.change(|data| {
            data.bytes = Some(payload.to_vec());
            data.snapshot.phase = UpdatePhase::Ready;
        });
        assert!(ready.can_install && !ready.can_download);
        let blocked = state.fail("update.game_active");
        assert!(blocked.can_install && !blocked.can_download);
        let mut relabeled = manifest.clone();
        relabeled["version"] = json!("3.0.0");
        assert!(matches!(
            updater
                .restore_update(relabeled)
                .unwrap()
                .unwrap()
                .verify(payload),
            Err(tauri_plugin_updater::Error::SignedVersionMismatch { .. })
        ));
        let mut older = manifest;
        older["version"] = json!("0.0.1");
        assert!(updater.restore_update(older).unwrap().is_none());
    }
    #[test]
    fn rejects_untrusted_installer_urls_and_invalid_versions() {
        assert!(trusted_download(
            "0.2.0",
            "https://github.com/UoMiss/aram-mayhem/releases/download/v0.2.0/aram-mayhem-windows-x64-setup.exe"
        ));
        for url in [
            "file:///setup.exe",
            "https://evil.example/setup.exe",
            "https://github.com/UoMiss/aram-mayhem/releases/download/v0.1.0/aram-mayhem-windows-x64-setup.exe",
        ] {
            assert!(!trusted_download("0.2.0", url));
        }
        assert!(!trusted_download("../../bad", "https://github.com"));
    }
    #[test]
    fn installation_is_blocked_during_matchmaking_and_active_matches() {
        let mut machine = GameflowMachine::new(LcuSourceKind::Real, false);
        for raw in [
            "Matchmaking",
            "ReadyCheck",
            "ChampSelect",
            "GameStart",
            "InProgress",
            "Reconnect",
            "WaitingForStats",
            "PreEndOfGame",
            "UnknownPhase",
        ] {
            observe(&mut machine, raw);
            assert!(machine.install_blocked(), "{raw}");
        }
        for raw in ["None", "Lobby", "EndOfGame", "TerminatedInError"] {
            observe(&mut machine, raw);
            assert!(!machine.install_blocked(), "{raw}");
        }
    }
    #[test]
    fn audit_active_match_disconnect_must_keep_install_blocked() {
        let mut machine = GameflowMachine::new(LcuSourceKind::Real, false);
        observe(&mut machine, "InProgress");
        assert!(machine.install_blocked());
        machine.disconnected("connection_refused", "Temporary transport loss");
        assert!(
            machine.install_blocked(),
            "active game + temporary disconnect incorrectly permits update installation"
        );
        assert!(!machine.snapshot().connected);
        assert!(machine.snapshot().phase.is_none());
        assert!(machine.snapshot().session.is_none());
    }

    #[test]
    fn install_safety_survives_errors_account_changes_and_client_absence() {
        for phase in [
            "Matchmaking",
            "ReadyCheck",
            "ChampSelect",
            "GameStart",
            "InProgress",
            "Reconnect",
            "WaitingForStats",
            "PreEndOfGame",
            "FuturePhase",
        ] {
            let mut machine = GameflowMachine::new(LcuSourceKind::Real, false);
            observe(&mut machine, phase);
            for code in [
                "connection_refused",
                "timeout",
                "authentication_failed",
                "monitoring_stopped",
            ] {
                machine.disconnected(code, "unavailable");
                assert!(machine.install_blocked(), "{phase}/{code}");
            }
            machine.account_invalidated();
            machine.client_not_found();
            assert!(machine.install_blocked(), "{phase}");
            observe(&mut machine, "Reconnect");
            assert!(machine.install_blocked());
            observe(&mut machine, "InProgress");
            assert!(machine.install_blocked());
            observe(&mut machine, "EndOfGame");
            assert!(!machine.install_blocked());
        }
    }

    #[test]
    fn only_trusted_idle_observations_release_installation() {
        let mut machine = GameflowMachine::new(LcuSourceKind::Real, false);
        assert!(machine.install_blocked());
        machine.disconnected("read_failed", "unknown startup state");
        assert!(machine.install_blocked());
        machine.client_not_found();
        assert!(!machine.install_blocked());
        for safe in ["None", "Lobby", "EndOfGame", "TerminatedInError"] {
            observe(&mut machine, "InProgress");
            observe(&mut machine, safe);
            assert!(!machine.install_blocked(), "{safe}");
            machine.disconnected("timeout", "idle observation is no longer current");
            assert!(machine.install_blocked());
            observe(&mut machine, safe);
            assert!(!machine.install_blocked());
            observe(&mut machine, "FuturePhase");
            assert!(machine.install_blocked());
        }
        for (source, simulated) in [
            (LcuSourceKind::Unavailable, false),
            (LcuSourceKind::Real, true),
        ] {
            let mut machine = GameflowMachine::new(source, simulated);
            observe(&mut machine, "Lobby");
            assert!(machine.install_blocked());
            machine.client_not_found();
            assert!(machine.install_blocked());
        }
    }

    #[test]
    fn only_verified_bytes_enable_install_and_failures_allow_retry() {
        let state = UpdateState::default();
        assert!(!state.data().snapshot.can_install);
        let failed = state.fail("update.signature_failed");
        assert!(!failed.can_install);
        assert_eq!(
            failed.error_code.as_deref(),
            Some("update.signature_failed")
        );
        assert_eq!(failed.revision, 1);
    }
    #[test]
    fn download_errors_are_sanitized() {
        assert_eq!(
            update_error(
                &tauri_plugin_updater::Error::SignatureUtf8("secret".into()),
                "update.download_failed"
            ),
            "update.signature_failed"
        );
        assert_eq!(
            update_error(
                &tauri_plugin_updater::Error::ReleaseNotFound,
                "update.check_failed"
            ),
            "update.not_published"
        );
    }
}
