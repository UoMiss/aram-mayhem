use crate::commands::match_rules::{find_record, finish_lucky_draw};
use crate::lcu::error::{LcuError, LcuErrorCode};
use crate::lcu::gameflow::GameflowPhase;
use crate::lcu::gameflow_monitor::SystemGameflowManager;
use crate::lcu::settlement::{
    SettlementRule, SettlementSnapshot, SystemSettlementSource, load_settlement, validate_game_id,
};
#[tauri::command]
pub async fn lcu_get_settlement(
    window: tauri::WebviewWindow,
    manager: tauri::State<'_, SystemGameflowManager>,
    game_id: String,
    account_key: String,
    rule: Option<SettlementRule>,
) -> Result<SettlementSnapshot, LcuError> {
    if window.label() != "main" {
        return Err(LcuError::new(
            LcuErrorCode::Internal,
            "Settlement is restricted to main",
        ));
    }
    validate_game_id(&game_id)?;
    let record = find_record(&window, &account_key, &game_id)?;
    let applied_rule = record.as_ref().map_or(rule, |record| record.rule);
    let mut snapshot = load_settlement(
        &SystemSettlementSource::connect()?,
        &game_id,
        &account_key,
        applied_rule,
        || {
            let Some(record) = record.as_ref() else {
                return Ok(None);
            };
            if manager.snapshot().session.is_some_and(|session| {
                session.game_id.as_deref() == Some(&game_id)
                    && matches!(
                        session.phase,
                        GameflowPhase::ChampSelect
                            | GameflowPhase::GameStart
                            | GameflowPhase::InProgress
                            | GameflowPhase::Reconnect
                    )
            }) {
                return Err(LcuError::new(
                    LcuErrorCode::InvalidResponse,
                    "Match is still active",
                ));
            }
            finish_lucky_draw(&window, record).map(Some)
        },
    )
    .await?;
    snapshot.locked_rule = record.is_some();
    Ok(snapshot)
}
