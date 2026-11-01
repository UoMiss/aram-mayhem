use crate::lcu::error::LcuError;
use crate::lcu::gameflow::GameflowSnapshot;
use crate::lcu::gameflow_monitor::{
    GAMEFLOW_CHAMP_SELECT_EVENT, GAMEFLOW_LOBBY_EVENT, GAMEFLOW_SESSION_ENDED_EVENT,
    GAMEFLOW_UPDATED_EVENT, GameflowCallback, GameflowEvent, SystemGameflowManager,
};
use std::sync::Arc;
use tauri::{AppHandle, Emitter, State};

#[tauri::command]
pub fn lcu_get_gameflow_snapshot(
    state: State<'_, SystemGameflowManager>,
) -> Result<GameflowSnapshot, LcuError> {
    Ok(state.snapshot())
}

#[tauri::command]
pub async fn lcu_start_gameflow_monitoring(
    app: AppHandle,
    state: State<'_, SystemGameflowManager>,
) -> Result<GameflowSnapshot, LcuError> {
    let app_handle = app.clone();
    let callback: GameflowCallback = Arc::new(move |event| match event {
        GameflowEvent::Updated(snapshot) => {
            let _ = app_handle.emit(GAMEFLOW_UPDATED_EVENT, snapshot);
        }
        GameflowEvent::Lobby(lobby) => {
            let _ = app_handle.emit(GAMEFLOW_LOBBY_EVENT, lobby);
        }
        GameflowEvent::ChampionSelect(champion_select) => {
            let _ = app_handle.emit(GAMEFLOW_CHAMP_SELECT_EVENT, champion_select);
        }
        GameflowEvent::SessionEnded(session) => {
            let _ = app_handle.emit(GAMEFLOW_SESSION_ENDED_EVENT, session);
        }
    });
    let snapshot = state.start_monitoring(callback);
    println!(
        "[lcu_start_gameflow_monitoring] connected={} phase={:?} transport={:?}",
        snapshot.connected, snapshot.phase, snapshot.transport
    );
    Ok(snapshot)
}

#[tauri::command]
pub async fn lcu_stop_gameflow_monitoring(
    state: State<'_, SystemGameflowManager>,
) -> Result<GameflowSnapshot, LcuError> {
    let snapshot = state.stop_monitoring().await;
    println!(
        "[lcu_stop_gameflow_monitoring] connected={} transport={:?}",
        snapshot.connected, snapshot.transport
    );
    Ok(snapshot)
}
