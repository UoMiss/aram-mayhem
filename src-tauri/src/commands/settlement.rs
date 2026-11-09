use crate::commands::match_rules::{find_record, finish_lucky_draw};
use crate::lcu::error::{LcuError, LcuErrorCode};
use crate::lcu::gameflow::{GameflowPhase, GameflowSnapshot};
use crate::lcu::gameflow_monitor::SystemGameflowManager;
use crate::lcu::models::LcuSourceKind;
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
    if applied_rule == Some(SettlementRule::DamageSize) {
        let initial = manager.snapshot();
        let path = super::match_rules::record_path(&window, &account_key, &game_id)?
            .with_extension("size-draw.json");
        return crate::lcu::damage_size::load(
            &SystemSettlementSource::connect()?,
            &game_id,
            &account_key,
            record.is_some(),
            &path,
            || {
                let (flow, account) = manager.roster_context();
                flow.connected
                    && flow.source == LcuSourceKind::Real
                    && !flow.simulated
                    && flow.code.is_none()
                    && account.as_deref() == Some(&account_key)
                    && flow.phase == Some(GameflowPhase::EndOfGame)
                    && flow.session.as_ref().is_some_and(|session| {
                        session.game_id.as_deref() == Some(&game_id)
                            && session.phase == GameflowPhase::EndOfGame
                            && initial.session.as_ref().is_some_and(|before| {
                                before.session_key == session.session_key
                                    && before.connection_generation == session.connection_generation
                            })
                    })
            },
        )
        .await
        .map_err(|error| {
            let (flow, account) = manager.roster_context();
            classify_detail_error(error, &flow, account.as_deref(), &account_key, &game_id)
        });
    }
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
    .await
    .map_err(|error| {
        let (flow, current_account) = manager.roster_context();
        classify_detail_error(
            error,
            &flow,
            current_account.as_deref(),
            &account_key,
            &game_id,
        )
    })?;
    snapshot.locked_rule = record.is_some();
    Ok(snapshot)
}

fn classify_detail_error(
    error: LcuError,
    flow: &GameflowSnapshot,
    current_account: Option<&str>,
    account: &str,
    game_id: &str,
) -> LcuError {
    if error.code == LcuErrorCode::SettlementUnavailable.as_str()
        && current_account == Some(account)
        && flow.connected
        && flow.source == LcuSourceKind::Real
        && !flow.simulated
        && flow.code.is_none()
        && flow.session.as_ref().is_some_and(|session| {
            session.game_id.as_deref() == Some(game_id)
                && flow.phase.as_ref() == Some(&session.phase)
                && matches!(
                    session.phase,
                    GameflowPhase::WaitingForStats
                        | GameflowPhase::PreEndOfGame
                        | GameflowPhase::EndOfGame
                )
        })
    {
        LcuError::new(
            LcuErrorCode::SettlementPending,
            "Current post-game statistics are not ready",
        )
    } else {
        error
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::lcu::gameflow::{GameflowMachine, GameflowReading, GameflowTransport};

    fn flow(phase: GameflowPhase) -> GameflowSnapshot {
        let mut machine = GameflowMachine::new(LcuSourceKind::Real, false);
        machine.observe(
            1,
            GameflowReading {
                raw_phase: phase.as_raw().into(),
                phase,
                game_id: Some("42".into()),
                lobby: None,
                game: None,
                champion_select: None,
            },
            GameflowTransport::Polling,
        );
        machine.snapshot()
    }
    fn missing() -> LcuError {
        LcuError::new(LcuErrorCode::SettlementUnavailable, "No resource")
    }
    #[test]
    fn only_missing_current_account_post_game_detail_is_pending() {
        for phase in [
            GameflowPhase::WaitingForStats,
            GameflowPhase::PreEndOfGame,
            GameflowPhase::EndOfGame,
        ] {
            let snapshot = flow(phase);
            assert_eq!(
                classify_detail_error(missing(), &snapshot, Some("A"), "A", "42").code,
                "settlement_pending"
            );
            assert_eq!(
                classify_detail_error(missing(), &snapshot, Some("B"), "A", "42").code,
                "settlement_unavailable"
            );
            assert_eq!(
                classify_detail_error(missing(), &snapshot, Some("A"), "A", "43").code,
                "settlement_unavailable"
            );
            let mut unavailable = snapshot;
            unavailable.connected = false;
            assert_eq!(
                classify_detail_error(missing(), &unavailable, Some("A"), "A", "42").code,
                "settlement_unavailable"
            );
        }
        for phase in [
            GameflowPhase::Lobby,
            GameflowPhase::InProgress,
            GameflowPhase::Unknown("Future".into()),
        ] {
            assert_eq!(
                classify_detail_error(missing(), &flow(phase), Some("A"), "A", "42").code,
                "settlement_unavailable"
            );
        }
    }
    #[test]
    fn request_failures_are_not_relabelled_as_pending() {
        for code in [
            LcuErrorCode::Timeout,
            LcuErrorCode::HttpStatus,
            LcuErrorCode::AuthenticationFailed,
            LcuErrorCode::InvalidResponse,
            LcuErrorCode::AccountChanged,
        ] {
            let error = LcuError::new(code, "failure");
            assert_eq!(
                classify_detail_error(
                    error.clone(),
                    &flow(GameflowPhase::EndOfGame),
                    Some("A"),
                    "A",
                    "42"
                ),
                error
            );
        }
    }
}
