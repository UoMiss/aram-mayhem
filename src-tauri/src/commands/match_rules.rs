use crate::lcu::error::{LcuError, LcuErrorCode};
use crate::lcu::gameflow::{GameSessionContext, GameflowPhase};
use crate::lcu::gameflow_monitor::SystemGameflowManager;
use crate::lcu::history::SystemHistorySource;
use crate::lcu::home::load_home;
use crate::lcu::settlement::{SettlementRule, validate_game_id};
use serde::{Deserialize, Serialize};
use std::fs;
use std::io::{self, Write};
use std::path::PathBuf;
use std::time::Duration;
use tauri::{Manager, State, WebviewWindow};

const OPENING_WINDOW: Duration = Duration::from_secs(20);

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct LockedMatchRule {
    pub account_key: String,
    pub game_id: String,
    pub rule: Option<SettlementRule>,
    pub lucky_digit: Option<u8>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OpeningChoice {
    session_key: String,
    game_id: String,
    rule: Option<SettlementRule>,
}

fn unavailable() -> LcuError {
    LcuError::internal("Could not access the saved match rule")
}

fn invalid_context() -> LcuError {
    LcuError::new(
        LcuErrorCode::InvalidResponse,
        "The match is outside the opening window",
    )
}

fn ensure_main(window: &WebviewWindow) -> Result<(), LcuError> {
    if window.label() != "main" {
        return Err(LcuError::internal("Match rules are restricted to main"));
    }
    Ok(())
}

fn draw_digit() -> Result<u8, LcuError> {
    let mut byte = [0];
    loop {
        getrandom::fill(&mut byte).map_err(|_| unavailable())?;
        if byte[0] < 250 {
            return Ok(byte[0] % 10);
        }
    }
}

fn record_path(window: &WebviewWindow, account: &str, game_id: &str) -> Result<PathBuf, LcuError> {
    if account.is_empty()
        || account.len() > 128
        || !account
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || byte == b'-' || byte == b'_')
    {
        return Err(unavailable());
    }
    let id = validate_game_id(game_id)?;
    Ok(window
        .path()
        .app_local_data_dir()
        .map_err(|_| unavailable())?
        .join("match-rules-v2")
        .join(account)
        .join(format!("{id}.json")))
}

fn read_record(path: &std::path::Path) -> Result<Option<LockedMatchRule>, LcuError> {
    match fs::read(path) {
        Ok(bytes) => serde_json::from_slice(&bytes)
            .map(Some)
            .map_err(|_| unavailable()),
        Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(None),
        Err(_) => Err(unavailable()),
    }
}

pub fn find_record(
    window: &WebviewWindow,
    account: &str,
    game_id: &str,
) -> Result<Option<LockedMatchRule>, LcuError> {
    let id = validate_game_id(game_id)?;
    let record = read_record(&record_path(window, account, &id)?)?;
    if record.as_ref().is_some_and(|record| {
        record.account_key != account
            || record.game_id != id
            || record
                .lucky_digit
                .is_some_and(|digit| digit > 9 || record.rule != Some(SettlementRule::Lucky))
    }) {
        return Err(unavailable());
    }
    Ok(record)
}

fn save_once(path: &std::path::Path, record: LockedMatchRule) -> Result<LockedMatchRule, LcuError> {
    let directory = path.parent().ok_or_else(unavailable)?;
    fs::create_dir_all(directory).map_err(|_| unavailable())?;
    let mut file = tempfile::NamedTempFile::new_in(directory).map_err(|_| unavailable())?;
    serde_json::to_writer(&mut file, &record).map_err(|_| unavailable())?;
    file.flush().map_err(|_| unavailable())?;
    file.as_file().sync_all().map_err(|_| unavailable())?;
    match file.persist_noclobber(path) {
        Ok(_) => Ok(record),
        Err(error) if error.error.kind() == io::ErrorKind::AlreadyExists => {
            read_record(path)?.ok_or_else(unavailable)
        }
        Err(_) => Err(unavailable()),
    }
}

pub fn finish_lucky_draw(window: &WebviewWindow, record: &LockedMatchRule) -> Result<u8, LcuError> {
    load_or_draw(
        &record_path(window, &record.account_key, &record.game_id)?,
        record,
    )
}

fn load_or_draw(path: &std::path::Path, opening: &LockedMatchRule) -> Result<u8, LcuError> {
    if opening.rule != Some(SettlementRule::Lucky) {
        return Err(unavailable());
    }
    // Existing settlements retain their original digit after an app update.
    if let Some(digit) = opening.lucky_digit {
        return Ok(digit);
    }
    let path = path.with_extension("draw.json");
    let result = match read_record(&path)? {
        Some(record) => record,
        None => save_once(
            &path,
            LockedMatchRule {
                lucky_digit: Some(draw_digit()?),
                ..opening.clone()
            },
        )?,
    };
    if result.account_key != opening.account_key
        || result.game_id != opening.game_id
        || result.rule != opening.rule
    {
        return Err(unavailable());
    }
    result
        .lucky_digit
        .filter(|digit| *digit <= 9)
        .ok_or_else(unavailable)
}

fn opening_context(
    manager: &SystemGameflowManager,
    choice: &OpeningChoice,
    id: &str,
) -> Result<GameSessionContext, LcuError> {
    let snapshot = manager.snapshot();
    snapshot
        .session
        .filter(|session| {
            snapshot.connected
                && session.session_key == choice.session_key
                && session.game_id.as_deref() == Some(id)
                && matches!(
                    session.phase,
                    GameflowPhase::GameStart | GameflowPhase::InProgress
                )
                && session
                    .opening_observed
                    .is_some_and(|time| time.elapsed() <= OPENING_WINDOW)
        })
        .ok_or_else(invalid_context)
}

#[tauri::command]
pub async fn lcu_lock_match_rule(
    window: WebviewWindow,
    manager: State<'_, SystemGameflowManager>,
    choice: OpeningChoice,
) -> Result<LockedMatchRule, LcuError> {
    ensure_main(&window)?;
    let id = validate_game_id(&choice.game_id)?;
    let opening = opening_context(&manager, &choice, &id)?;
    let account = load_home(&SystemHistorySource::connect()?)
        .await?
        .account_key;
    let current = opening_context(&manager, &choice, &id)?;
    if current.connection_generation != opening.connection_generation {
        return Err(invalid_context());
    }
    if let Some(record) = find_record(&window, &account, &id)? {
        return Ok(record);
    }
    save_once(
        &record_path(&window, &account, &id)?,
        LockedMatchRule {
            account_key: account,
            game_id: id,
            rule: choice.rule,
            lucky_digit: None,
        },
    )
}

#[tauri::command]
pub async fn lcu_get_locked_match_rule(
    window: WebviewWindow,
    game_id: String,
) -> Result<Option<LockedMatchRule>, LcuError> {
    ensure_main(&window)?;
    validate_game_id(&game_id)?;
    let account = load_home(&SystemHistorySource::connect()?)
        .await?
        .account_key;
    find_record(&window, &account, &game_id)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn an_existing_opening_record_cannot_be_replaced() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("42.json");
        let record = LockedMatchRule {
            account_key: "account".into(),
            game_id: "42".into(),
            rule: Some(SettlementRule::Lucky),
            lucky_digit: Some(0),
        };
        let changed = LockedMatchRule {
            lucky_digit: Some(9),
            ..record.clone()
        };
        assert_eq!(save_once(&path, record.clone()).unwrap(), record);
        assert_eq!(save_once(&path, changed).unwrap(), record);
        assert_eq!(read_record(&path).unwrap(), Some(record));
    }

    #[test]
    fn finished_draw_is_persisted_separately_and_reused() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("42.json");
        let record = LockedMatchRule {
            account_key: "account".into(),
            game_id: "42".into(),
            rule: Some(SettlementRule::Lucky),
            lucky_digit: None,
        };
        save_once(&path, record.clone()).unwrap();
        let digit = load_or_draw(&path, &record).unwrap();
        assert!(digit <= 9);
        assert_eq!(load_or_draw(&path, &record).unwrap(), digit);
        assert_eq!(read_record(&path).unwrap(), Some(record));
    }
}
