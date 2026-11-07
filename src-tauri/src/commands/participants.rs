use crate::lcu::error::{LcuError, LcuErrorCode};
use crate::lcu::gameflow_monitor::SystemGameflowManager;
use crate::lcu::participants::{ParticipantSnapshot, SystemParticipantSource, load_participants};
use tauri::State;

#[tauri::command]
pub async fn lcu_get_custom_participants(
    window: tauri::WebviewWindow,
    manager: State<'_, SystemGameflowManager>,
) -> Result<ParticipantSnapshot, LcuError> {
    if window.label() != "main" {
        return Err(LcuError::new(
            LcuErrorCode::Internal,
            "Participant query is restricted to main",
        ));
    }
    let (before, before_account) = manager.roster_context();
    let mut roster = load_participants(&SystemParticipantSource::connect()?).await?;
    let (after, after_account) = manager.roster_context();
    if before_account.as_deref() != Some(&roster.account_key) || before_account != after_account {
        return Err(LcuError::new(
            LcuErrorCode::AccountChanged,
            "Roster account context changed",
        ));
    }
    crate::lcu::participants::bind_context(&mut roster, &before, &after)?;
    Ok(roster)
}
