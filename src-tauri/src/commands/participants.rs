use crate::lcu::error::{LcuError, LcuErrorCode};
use crate::lcu::participants::{ParticipantSnapshot, SystemParticipantSource, load_participants};

#[tauri::command]
pub async fn lcu_get_custom_participants(
    window: tauri::WebviewWindow,
) -> Result<ParticipantSnapshot, LcuError> {
    if window.label() != "main" {
        return Err(LcuError::new(
            LcuErrorCode::Internal,
            "Participant query is restricted to main",
        ));
    }
    load_participants(&SystemParticipantSource::connect()?).await
}
