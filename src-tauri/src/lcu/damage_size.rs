//! Non-ranking settlement. Only native, verified final data may create a draw.
use super::{
    error::{LcuError, LcuErrorCode},
    history::profile_identity,
    models::now_ms,
    settlement::{
        SettlementRule, SettlementSnapshot, SettlementSource, friend_puuids, parse_settlement,
    },
};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::{
    collections::HashSet,
    fs,
    io::{self, Write},
    path::Path,
};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SizeOutcome {
    Big,
    Small,
}
pub fn group(damage: u64) -> SizeOutcome {
    if damage % 10 < 5 {
        SizeOutcome::Small
    } else {
        SizeOutcome::Big
    }
}
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SizeParticipant {
    pub id: String,
    pub identity: String,
    pub nickname: Option<String>,
    pub damage: Option<String>,
    pub group: Option<SizeOutcome>,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SizeResult {
    pub status: String,
    pub reason: Option<String>,
    pub outcome: Option<SizeOutcome>,
    pub participants: Vec<SizeParticipant>,
    pub red_packet_player_ids: Option<Vec<String>>,
    pub frozen_at: Option<u64>,
}
#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct FrozenRecord {
    schema_version: u32,
    rule_version: String,
    client_version: String,
    identity_evidence: String,
    end_evidence: String,
    snapshot: SettlementSnapshot,
}
fn error(code: LcuErrorCode) -> LcuError {
    LcuError::new(code, "Damage size settlement could not be verified")
}
pub fn valid_identity(id: &str) -> bool {
    !id.is_empty()
        && id.len() <= 128
        && id
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_')
        && id.bytes().any(|b| b != b'0' && b != b'-')
}
fn exact(value: &str) -> Option<u64> {
    value.parse::<u64>().ok().filter(|n| n.to_string() == value)
}
fn validate_record(record: &FrozenRecord, account: &str, id: &str) -> Result<(), LcuError> {
    let snapshot = &record.snapshot;
    let fail = || error(LcuErrorCode::SizeRecordInvalid);
    let result = snapshot.damage_size.as_ref().ok_or_else(fail)?;
    if record.schema_version != 1
        || record.rule_version != "damage_size/v1"
        || record.client_version.is_empty()
        || record.identity_evidence != "summoner_profile/v1"
        || record.end_evidence != "end_of_game+early_surrender_false/v1"
        || snapshot.account_key != account
        || snapshot.id != id
        || snapshot.applied_rule != Some(SettlementRule::DamageSize)
        || !snapshot.locked_rule
        || snapshot.lucky_digit.is_some()
        || snapshot.ranking_status != "not_applicable"
        || result.status != "ready"
        || result.reason.is_some()
        || result
            .frozen_at
            .is_none_or(|n| n == 0 || n > 8_640_000_000_000_000)
        || snapshot.created_at == 0
        || snapshot.duration_seconds == 0
        || snapshot.players.len() > 100
        || snapshot.players.len() < 2
        || snapshot.players.iter().filter(|p| p.is_self).count() != 1
        || snapshot.players.iter().any(|p| {
            p.rank.is_some() || p.rule_value.is_some() || p.team_id == 0 || p.champion_id == 0
        })
        || snapshot
            .players
            .iter()
            .map(|p| &p.id)
            .collect::<HashSet<_>>()
            .len()
            != snapshot.players.len()
    {
        return Err(fail());
    }
    let eligible = snapshot
        .players
        .iter()
        .filter(|p| snapshot.is_custom || p.is_self || p.is_friend)
        .collect::<Vec<_>>();
    if eligible.is_empty()
        || (snapshot.is_custom && !(3..=10).contains(&eligible.len()))
        || eligible.len() != result.participants.len()
        || result
            .participants
            .iter()
            .map(|p| &p.id)
            .collect::<HashSet<_>>()
            .len()
            != eligible.len()
        || result
            .participants
            .iter()
            .map(|p| &p.identity)
            .collect::<HashSet<_>>()
            .len()
            != eligible.len()
    {
        return Err(fail());
    }
    for participant in &result.participants {
        let damage = participant
            .damage
            .as_deref()
            .and_then(exact)
            .ok_or_else(fail)?;
        if !valid_identity(&participant.identity)
            || exact(&participant.id).is_none_or(|n| n == 0)
            || participant.group != Some(group(damage))
            || participant
                .nickname
                .as_ref()
                .is_some_and(|n| n.is_empty() || n.chars().count() > 1025)
            || !eligible.iter().any(|p| {
                p.id == participant.id
                    && p.damage == Some(damage)
                    && p.nickname == participant.nickname
                    && (!p.is_self || participant.identity == account)
            })
        {
            return Err(fail());
        }
    }
    let outcome = result.outcome.ok_or_else(fail)?;
    let ids = result.red_packet_player_ids.as_ref().ok_or_else(fail)?;
    let expected = result
        .participants
        .iter()
        .filter(|p| p.group == Some(outcome))
        .map(|p| &p.id)
        .collect::<HashSet<_>>();
    if ids.len() != expected.len() || ids.iter().collect::<HashSet<_>>() != expected {
        return Err(fail());
    }
    Ok(())
}
fn read(path: &Path, account: &str, id: &str) -> Result<Option<FrozenRecord>, LcuError> {
    match fs::read(path) {
        Ok(bytes) => {
            if bytes.len() > 2_000_000 {
                return Err(error(LcuErrorCode::SizeRecordInvalid));
            }
            let record = serde_json::from_slice(&bytes)
                .map_err(|_| error(LcuErrorCode::SizeRecordInvalid))?;
            validate_record(&record, account, id)?;
            Ok(Some(record))
        }
        Err(e) if e.kind() == io::ErrorKind::NotFound => Ok(None),
        Err(_) => Err(error(LcuErrorCode::SizeRecordInvalid)),
    }
}
fn draw() -> Result<SizeOutcome, LcuError> {
    let mut byte = [0];
    getrandom::fill(&mut byte).map_err(|_| error(LcuErrorCode::SizeRandomFailed))?;
    Ok(if byte[0] & 1 == 0 {
        SizeOutcome::Small
    } else {
        SizeOutcome::Big
    })
}
fn freeze(
    path: &Path,
    mut snapshot: SettlementSnapshot,
    rng: impl FnOnce() -> Result<SizeOutcome, LcuError>,
) -> Result<SettlementSnapshot, LcuError> {
    if let Some(record) = read(path, &snapshot.account_key, &snapshot.id)? {
        return Ok(record.snapshot);
    }
    let outcome = rng()?;
    let result = snapshot
        .damage_size
        .as_mut()
        .ok_or_else(|| error(LcuErrorCode::SizeRecordInvalid))?;
    result.status = "ready".into();
    result.reason = None;
    result.outcome = Some(outcome);
    result.frozen_at = Some(now_ms());
    result.red_packet_player_ids = Some(
        result
            .participants
            .iter()
            .filter(|p| p.group == Some(outcome))
            .map(|p| p.id.clone())
            .collect(),
    );
    let record = FrozenRecord {
        schema_version: 1,
        rule_version: "damage_size/v1".into(),
        client_version: env!("CARGO_PKG_VERSION").into(),
        identity_evidence: "summoner_profile/v1".into(),
        end_evidence: "end_of_game+early_surrender_false/v1".into(),
        snapshot,
    };
    validate_record(&record, &record.snapshot.account_key, &record.snapshot.id)?;
    let storage = |_| error(LcuErrorCode::SizeStorageFailed);
    let dir = path
        .parent()
        .ok_or_else(|| error(LcuErrorCode::SizeStorageFailed))?;
    fs::create_dir_all(dir).map_err(storage)?;
    let mut file = tempfile::NamedTempFile::new_in(dir).map_err(storage)?;
    serde_json::to_writer(&mut file, &record)
        .map_err(|_| error(LcuErrorCode::SizeStorageFailed))?;
    file.flush().map_err(storage)?;
    file.as_file().sync_all().map_err(storage)?;
    match file.persist_noclobber(path) {
        Ok(_) => Ok(record.snapshot),
        Err(e) if e.error.kind() == io::ErrorKind::AlreadyExists => {
            read(path, &record.snapshot.account_key, &record.snapshot.id)?
                .map(|r| r.snapshot)
                .ok_or_else(|| error(LcuErrorCode::SizeStorageFailed))
        }
        Err(_) => Err(error(LcuErrorCode::SizeStorageFailed)),
    }
}
fn state(snapshot: &mut SettlementSnapshot, status: &str, reason: &str) {
    if let Some(result) = snapshot.damage_size.as_mut() {
        result.status = status.into();
        result.reason = Some(reason.into());
    }
}
fn end_issue(detail: &Value, snapshot: &SettlementSnapshot) -> Option<&'static str> {
    let Some(players) = detail.get("participants").and_then(Value::as_array) else {
        return Some("end_unverified");
    };
    if players.iter().any(|p| {
        p.pointer("/stats/gameEndedInEarlySurrender")
            .and_then(Value::as_bool)
            == Some(true)
    }) {
        return Some("invalid_match");
    }
    if snapshot.duration_seconds == 0
        || !snapshot.players.iter().any(|p| p.win)
        || players.is_empty()
        || players.iter().any(|p| {
            p.pointer("/stats/gameEndedInEarlySurrender")
                .and_then(Value::as_bool)
                != Some(false)
        })
    {
        return Some("end_unverified");
    }
    None
}
async fn verify_account(source: &impl SettlementSource, account: &str) -> Result<(), LcuError> {
    source.verify_client().await?;
    if profile_identity(&source.profile().await?)? != account {
        return Err(error(LcuErrorCode::AccountChanged));
    }
    Ok(())
}
fn participants(detail: &Value, snapshot: &SettlementSnapshot) -> Option<Vec<SizeParticipant>> {
    let identities = detail.get("participantIdentities")?.as_array()?;
    let stats = detail.get("participants")?.as_array()?;
    let mut seen = HashSet::new();
    snapshot
        .players
        .iter()
        .filter(|p| snapshot.is_custom || p.is_self || p.is_friend)
        .map(|p| {
            let row = identities
                .iter()
                .find(|r| {
                    r.get("participantId")
                        .and_then(Value::as_u64)
                        .map(|n| n.to_string())
                        .as_ref()
                        == Some(&p.id)
                })?
                .get("player")?;
            let identity = row.get("puuid")?.as_str()?;
            let stats = stats.iter().find(|r| {
                r.get("participantId")
                    .and_then(Value::as_u64)
                    .map(|n| n.to_string())
                    .as_ref()
                    == Some(&p.id)
            })?;
            if !valid_identity(identity)
                || !seen.insert(identity)
                || row.get("isBot").and_then(Value::as_bool) == Some(true)
                || row.get("isSpectator").and_then(Value::as_bool) == Some(true)
                || stats.get("isBot").and_then(Value::as_bool) == Some(true)
                || stats.get("isSpectator").and_then(Value::as_bool) == Some(true)
            {
                return None;
            }
            Some(SizeParticipant {
                id: p.id.clone(),
                identity: identity.into(),
                nickname: p.nickname.clone(),
                damage: p.damage.map(|d| d.to_string()),
                group: p.damage.map(group),
            })
        })
        .collect()
}
fn conflicts(saved: &SettlementSnapshot, current: &SettlementSnapshot) -> bool {
    let roster = |snapshot: &SettlementSnapshot| {
        snapshot.damage_size.as_ref().map(|s| {
            s.participants
                .iter()
                .map(|p| (p.id.clone(), p.identity.clone(), p.damage.clone(), p.group))
                .collect::<HashSet<_>>()
        })
    };
    saved.is_custom != current.is_custom
        || saved.queue_id != current.queue_id
        || saved.game_type != current.game_type
        || saved.created_at != current.created_at
        || saved.duration_seconds != current.duration_seconds
        || roster(saved) != roster(current)
}
/// Authorization closure is re-read immediately before synchronous persist, after all awaits.
pub async fn load(
    source: &impl SettlementSource,
    id: &str,
    account: &str,
    locked: bool,
    path: &Path,
    authorized_end: impl Fn() -> bool,
) -> Result<SettlementSnapshot, LcuError> {
    verify_account(source, account).await?;
    if locked && let Some(record) = read(path, account, id)? {
        let mut saved = record.snapshot;
        let detail = source.detail(id).await;
        verify_account(source, account).await?;
        if let Ok(detail) = detail {
            let friends = saved
                .damage_size
                .as_ref()
                .unwrap()
                .participants
                .iter()
                .map(|p| p.identity.clone())
                .collect();
            let current = parse_settlement(
                &detail,
                id,
                account,
                Some(SettlementRule::DamageSize),
                Some(&friends),
                None,
            );
            let mismatch = match current {
                Ok(mut current) => {
                    current.damage_size = Some(SizeResult {
                        participants: participants(&detail, &current).unwrap_or_default(),
                        ..saved.damage_size.clone().unwrap()
                    });
                    conflicts(&saved, &current)
                }
                Err(_) => true,
            };
            if mismatch {
                state(&mut saved, "conflict", "data_conflict");
            }
        }
        return Ok(saved);
    }
    let detail = source.detail(id).await;
    verify_account(source, account).await?;
    let detail = detail?;
    let custom = super::settlement::is_custom_match(&detail);
    let friends = if custom {
        None
    } else {
        source.friends().await.ok().and_then(|f| friend_puuids(&f))
    };
    let mut snapshot = parse_settlement(
        &detail,
        id,
        account,
        Some(SettlementRule::DamageSize),
        friends.as_ref(),
        None,
    )?;
    snapshot.locked_rule = locked;
    let eligible = participants(&detail, &snapshot);
    snapshot.damage_size = Some(SizeResult {
        status: "preview".into(),
        reason: Some("unlocked".into()),
        outcome: None,
        participants: eligible.clone().unwrap_or_default(),
        red_packet_player_ids: None,
        frozen_at: None,
    });
    if !locked {
        verify_account(source, account).await?;
        return Ok(snapshot);
    }
    if !custom && friends.is_none() {
        state(&mut snapshot, "pending", "missing_friends");
    } else if eligible.is_none() {
        state(&mut snapshot, "unsupported", "identity_unverified");
    } else if custom
        && !(3..=10).contains(&snapshot.damage_size.as_ref().unwrap().participants.len())
    {
        state(&mut snapshot, "unsupported", "unsupported_count");
    } else if snapshot
        .damage_size
        .as_ref()
        .unwrap()
        .participants
        .iter()
        .any(|p| p.damage.is_none())
    {
        state(&mut snapshot, "pending", "missing_damage");
    } else if let Some(reason) = end_issue(&detail, &snapshot) {
        state(&mut snapshot, "unsupported", reason);
    } else if !authorized_end() {
        state(&mut snapshot, "pending", "current_game_active");
    } else {
        let mut verified = true;
        for participant in &snapshot.damage_size.as_ref().unwrap().participants {
            if !source.human(&participant.identity).await? {
                verified = false;
                break;
            }
        }
        verify_account(source, account).await?;
        if !verified {
            state(&mut snapshot, "unsupported", "identity_unverified");
        } else if !authorized_end() {
            state(&mut snapshot, "pending", "current_game_active");
        } else {
            return freeze(path, snapshot, draw);
        }
    }
    verify_account(source, account).await?;
    Ok(snapshot)
}

#[cfg(test)]
mod tests {
    use super::*;
    use async_trait::async_trait;
    use serde_json::json;
    use std::sync::{
        Arc, Barrier,
        atomic::{AtomicUsize, Ordering},
    };
    const ACCOUNT: &str = "test-current-account";
    const ID: &str = "18446744073709551615";
    fn detail() -> Value {
        let mut value: Value =
            serde_json::from_str(include_str!("../../../tests/fixtures/lcu-settlement.json"))
                .unwrap();
        value["gameType"] = json!("CUSTOM_GAME");
        value["queueId"] = json!(0);
        for player in value["participants"].as_array_mut().unwrap() {
            player["stats"]["gameEndedInEarlySurrender"] = json!(false);
        }
        value
    }
    fn candidate(value: &Value) -> SettlementSnapshot {
        let mut snapshot = parse_settlement(
            value,
            ID,
            ACCOUNT,
            Some(SettlementRule::DamageSize),
            Some(&HashSet::from(["ally-2".into()])),
            None,
        )
        .unwrap();
        snapshot.locked_rule = true;
        snapshot.damage_size = Some(SizeResult {
            status: "pending".into(),
            reason: Some("missing_damage".into()),
            outcome: None,
            participants: participants(value, &snapshot).unwrap(),
            red_packet_player_ids: None,
            frozen_at: None,
        });
        snapshot
    }
    struct Source {
        value: Value,
        human: bool,
        friends: bool,
        profiles: AtomicUsize,
        switch_after: usize,
    }
    impl Source {
        fn new(value: Value) -> Self {
            Self {
                value,
                human: true,
                friends: true,
                profiles: AtomicUsize::new(0),
                switch_after: usize::MAX,
            }
        }
    }
    #[async_trait]
    impl SettlementSource for Source {
        async fn profile(&self) -> Result<Value, LcuError> {
            Ok(
                json!({"puuid": if self.profiles.fetch_add(1, Ordering::SeqCst) >= self.switch_after { "other" } else { ACCOUNT }}),
            )
        }
        async fn detail(&self, _: &str) -> Result<Value, LcuError> {
            Ok(self.value.clone())
        }
        async fn friends(&self) -> Result<Value, LcuError> {
            if self.friends {
                Ok(json!([{"puuid":"ally-2"}]))
            } else {
                Err(error(LcuErrorCode::Timeout))
            }
        }
        async fn human(&self, _: &str) -> Result<bool, LcuError> {
            Ok(self.human)
        }
    }
    #[test]
    fn exact_groups_and_complementary_sets() {
        for digit in 0..10 {
            assert_eq!(
                group(digit),
                if digit < 5 {
                    SizeOutcome::Small
                } else {
                    SizeOutcome::Big
                }
            );
        }
        assert_eq!(group(u64::MAX), SizeOutcome::Big);
        let source = candidate(&detail());
        let dir = tempfile::tempdir().unwrap();
        let a = freeze(&dir.path().join("a"), source.clone(), || {
            Ok(SizeOutcome::Big)
        })
        .unwrap();
        let b = freeze(&dir.path().join("b"), source, || Ok(SizeOutcome::Small)).unwrap();
        let a = a.damage_size.unwrap().red_packet_player_ids.unwrap();
        let b = b.damage_size.unwrap().red_packet_player_ids.unwrap();
        assert_eq!(a.len() + b.len(), 4);
        assert!(a.iter().all(|id| !b.contains(id)));
    }
    #[test]
    fn zero_and_everyone_are_valid_frozen_results() {
        let mut value = detail();
        for p in value["participants"].as_array_mut().unwrap() {
            p["stats"]["totalDamageDealtToChampions"] = json!(u64::MAX);
        }
        let dir = tempfile::tempdir().unwrap();
        for (outcome, count) in [(SizeOutcome::Small, 0), (SizeOutcome::Big, 4)] {
            let path = dir.path().join(count.to_string());
            let result = freeze(&path, candidate(&value), || Ok(outcome)).unwrap();
            assert_eq!(
                result
                    .damage_size
                    .unwrap()
                    .red_packet_player_ids
                    .unwrap()
                    .len(),
                count
            );
            let again = freeze(&path, candidate(&value), || panic!("no redraw")).unwrap();
            assert_eq!(again.damage_size.unwrap().outcome, Some(outcome));
        }
    }
    #[test]
    fn concurrent_different_candidates_return_whole_winning_snapshot() {
        let dir = tempfile::tempdir().unwrap();
        let path = Arc::new(dir.path().join("draw"));
        let barrier = Arc::new(Barrier::new(2));
        let threads = [SizeOutcome::Big, SizeOutcome::Small]
            .into_iter()
            .enumerate()
            .map(|(i, outcome)| {
                let path = path.clone();
                let barrier = barrier.clone();
                std::thread::spawn(move || {
                    let mut value = detail();
                    value["participants"][0]["stats"]["totalDamageDealtToChampions"] =
                        json!(i as u64);
                    let candidate = candidate(&value);
                    freeze(&path, candidate, || {
                        barrier.wait();
                        Ok(outcome)
                    })
                    .unwrap()
                })
            })
            .collect::<Vec<_>>();
        let results = threads
            .into_iter()
            .map(|t| t.join().unwrap())
            .collect::<Vec<_>>();
        assert_eq!(
            serde_json::to_value(&results[0]).unwrap(),
            serde_json::to_value(&results[1]).unwrap()
        );
    }
    #[test]
    fn corrupt_identity_and_rng_or_storage_failures_never_redraw() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("draw");
        fs::write(&path, b"broken").unwrap();
        assert!(freeze(&path, candidate(&detail()), || panic!("must not draw")).is_err());
        let good = dir.path().join("good");
        freeze(&good, candidate(&detail()), || Ok(SizeOutcome::Small)).unwrap();
        assert!(read(&good, "other", ID).is_err());
        assert!(read(&good, ACCOUNT, "42").is_err());
        let rng = dir.path().join("rng");
        assert!(
            freeze(&rng, candidate(&detail()), || Err(error(
                LcuErrorCode::SizeRandomFailed
            )))
            .is_err()
        );
        assert!(!rng.exists());
        let bad = path.join("not-directory");
        assert!(freeze(&bad, candidate(&detail()), || Ok(SizeOutcome::Big)).is_err());
        let mut record: Value = serde_json::from_slice(&fs::read(&good).unwrap()).unwrap();
        record["snapshot"]["damageSize"]["redPacketPlayerIds"] = json!(["999"]);
        fs::write(&good, serde_json::to_vec(&record).unwrap()).unwrap();
        assert!(read(&good, ACCOUNT, ID).is_err());
    }
    #[tokio::test]
    async fn missing_damage_unlocked_unknown_end_or_identity_never_write() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("draw");
        let mut missing = detail();
        missing["participants"][0]["stats"]["totalDamageDealtToChampions"] = Value::Null;
        let pending = load(&Source::new(missing), ID, ACCOUNT, true, &path, || true)
            .await
            .unwrap();
        assert_eq!(
            pending.damage_size.unwrap().reason.as_deref(),
            Some("missing_damage")
        );
        assert!(!path.exists());
        let preview = load(&Source::new(detail()), ID, ACCOUNT, false, &path, || true)
            .await
            .unwrap();
        assert_eq!(preview.damage_size.unwrap().status, "preview");
        assert!(!path.exists());
        let mut early = detail();
        early["participants"][0]["stats"]["gameEndedInEarlySurrender"] = json!(true);
        for (value, reason) in [
            (early, "invalid_match"),
            (
                {
                    let mut v = detail();
                    v["participants"][0]["stats"]
                        .as_object_mut()
                        .unwrap()
                        .remove("gameEndedInEarlySurrender");
                    v
                },
                "end_unverified",
            ),
        ] {
            let result = load(&Source::new(value), ID, ACCOUNT, true, &path, || true)
                .await
                .unwrap();
            assert_eq!(result.damage_size.unwrap().reason.as_deref(), Some(reason));
            assert!(!path.exists());
        }
        let mut source = Source::new(detail());
        source.human = false;
        let result = load(&source, ID, ACCOUNT, true, &path, || true)
            .await
            .unwrap();
        assert_eq!(
            result.damage_size.unwrap().reason.as_deref(),
            Some("identity_unverified")
        );
        assert!(!path.exists());
        let result = load(&Source::new(detail()), ID, ACCOUNT, true, &path, || false)
            .await
            .unwrap();
        assert_eq!(result.damage_size.unwrap().status, "pending");
        assert!(!path.exists());
    }
    #[tokio::test]
    async fn account_change_and_late_phase_change_cannot_persist() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("draw");
        let mut source = Source::new(detail());
        source.switch_after = 2;
        assert_eq!(
            load(&source, ID, ACCOUNT, true, &path, || true)
                .await
                .unwrap_err()
                .code,
            "account_changed"
        );
        assert!(!path.exists());
        let checks = AtomicUsize::new(0);
        let result = load(&Source::new(detail()), ID, ACCOUNT, true, &path, || {
            checks.fetch_add(1, Ordering::SeqCst) == 0
        })
        .await
        .unwrap();
        assert_eq!(result.damage_size.unwrap().status, "pending");
        assert!(!path.exists());
    }
    #[tokio::test]
    async fn matching_any_mode_only_self_and_friends_then_freezes_scope() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("draw");
        let mut value = detail();
        value["gameType"] = json!("MATCHED_GAME");
        value["queueId"] = json!(1700);
        value["gameMode"] = json!("CHERRY");
        value["participants"][0]["teamId"] = json!(1);
        value["participants"][1]["teamId"] = json!(2);
        let saved = load(
            &Source::new(value.clone()),
            ID,
            ACCOUNT,
            true,
            &path,
            || true,
        )
        .await
        .unwrap();
        assert_eq!(saved.damage_size.as_ref().unwrap().participants.len(), 2);
        assert!(saved.players.iter().all(|p| p.rank.is_none()));
        let mut source = Source::new(value);
        source.friends = false;
        let restored = load(&source, ID, ACCOUNT, true, &path, || false)
            .await
            .unwrap();
        assert_eq!(restored.damage_size.as_ref().unwrap().status, "ready");
        assert_eq!(
            serde_json::to_value(&saved).unwrap(),
            serde_json::to_value(restored).unwrap()
        );
        source.value["participants"]
            .as_array_mut()
            .unwrap()
            .reverse();
        source.value["participantIdentities"][3]["player"]["gameName"] = json!("Renamed");
        let reordered = load(&source, ID, ACCOUNT, true, &path, || false)
            .await
            .unwrap();
        assert_eq!(
            serde_json::to_value(&saved).unwrap(),
            serde_json::to_value(reordered).unwrap()
        );
        source.value["participants"][3]["stats"]["totalDamageDealtToChampions"] = json!(10);
        let conflict = load(&source, ID, ACCOUNT, true, &path, || false)
            .await
            .unwrap();
        assert_eq!(conflict.damage_size.as_ref().unwrap().status, "conflict");
        assert_eq!(
            read(&path, ACCOUNT, ID)
                .unwrap()
                .unwrap()
                .snapshot
                .damage_size
                .unwrap()
                .status,
            "ready"
        );
    }

    #[tokio::test]
    async fn custom_counts_missing_friends_and_explicit_bots_are_guarded() {
        let dir = tempfile::tempdir().unwrap();
        for count in 2..=11 {
            let mut value = detail();
            let template = value["participants"][0].clone();
            value["participants"] = json!(
                (0..count)
                    .map(|i| {
                        let mut p = template.clone();
                        p["participantId"] = json!(i + 1);
                        p["teamId"] = json!(if i % 2 == 0 { 100 } else { 200 });
                        p["stats"]["win"] = json!(i % 2 == 0);
                        // Eight-player case yields six big and two small participants.
                        p["stats"]["totalDamageDealtToChampions"] =
                            json!(if i < 6 { 15 } else { 10 });
                        p
                    })
                    .collect::<Vec<_>>()
            );
            value["participantIdentities"] = json!((0..count).map(|i| json!({
                "participantId": i + 1, "player": { "puuid": if i == 0 { ACCOUNT.into() } else { format!("player-{i}") } }
            })).collect::<Vec<_>>());
            let path = dir.path().join(count.to_string());
            let result = load(
                &Source::new(value.clone()),
                ID,
                ACCOUNT,
                true,
                &path,
                || true,
            )
            .await
            .unwrap();
            let size = result.damage_size.unwrap();
            if (3..=10).contains(&count) {
                assert_eq!(size.status, "ready");
                assert_eq!(size.participants.len(), count);
                if count == 8 {
                    assert_eq!(
                        size.red_packet_player_ids.unwrap().len(),
                        if size.outcome == Some(SizeOutcome::Big) {
                            6
                        } else {
                            2
                        }
                    );
                }
            } else {
                assert_eq!(size.reason.as_deref(), Some("unsupported_count"));
                assert!(!path.exists());
            }
        }
        let path = dir.path().join("blocked");
        let mut value = detail();
        value["gameType"] = json!("MATCHED_GAME");
        value["queueId"] = json!(2400);
        let mut source = Source::new(value);
        source.friends = false;
        let result = load(&source, ID, ACCOUNT, true, &path, || true)
            .await
            .unwrap();
        assert_eq!(
            result.damage_size.unwrap().reason.as_deref(),
            Some("missing_friends")
        );
        assert!(!path.exists());
        for identity_flag in [true, false] {
            let mut value = detail();
            if identity_flag {
                value["participantIdentities"][3]["player"]["isBot"] = json!(true);
            } else {
                value["participants"][0]["isBot"] = json!(true);
            }
            let result = load(&Source::new(value), ID, ACCOUNT, true, &path, || true)
                .await
                .unwrap();
            assert_eq!(
                result.damage_size.unwrap().reason.as_deref(),
                Some("identity_unverified")
            );
            assert!(!path.exists());
        }
    }
}
