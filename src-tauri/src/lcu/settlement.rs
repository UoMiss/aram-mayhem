use crate::lcu::client::LcuHttpClient;
use crate::lcu::discovery::{LcuClient, discover};
use crate::lcu::error::{LcuError, LcuErrorCode};
use crate::lcu::history::profile_identity;
use crate::lcu::models::now_ms;
use crate::scoring::ScoreRule;
use async_trait::async_trait;
use serde::{Deserialize, Serialize, Serializer};
use serde_json::Value;
use std::cmp::Ordering;
use std::collections::HashSet;

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum SettlementRule {
    Damage,
    Tail,
    Lucky,
}
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SettlementPlayer {
    pub id: String,
    pub team_id: u32,
    pub champion_id: u32,
    pub level: Option<u32>,
    pub nickname: Option<String>,
    pub is_self: bool,
    pub is_friend: bool,
    pub win: bool,
    pub kills: u32,
    pub deaths: u32,
    pub assists: u32,
    // Exact integers cross IPC as strings, including values above JS safe integer range.
    #[serde(serialize_with = "serialize_exact")]
    pub damage: Option<u64>,
    #[serde(serialize_with = "serialize_exact")]
    pub taken: Option<u64>,
    #[serde(serialize_with = "serialize_exact")]
    pub healing: Option<u64>,
    pub rank: Option<u32>,
    pub rule_value: Option<String>,
}
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SettlementSnapshot {
    pub id: String,
    pub account_key: String,
    pub queue_id: Option<u32>,
    pub map_id: Option<i64>,
    pub game_mode: Option<String>,
    pub game_type: Option<String>,
    pub created_at: u64,
    pub duration_seconds: u32,
    pub applied_rule: Option<SettlementRule>,
    pub is_custom: bool,
    pub ranking_status: &'static str,
    pub lucky_digit: Option<u8>,
    pub locked_rule: bool,
    pub players: Vec<SettlementPlayer>,
    pub updated_at: u64,
}
fn invalid() -> LcuError {
    LcuError::new(
        LcuErrorCode::InvalidResponse,
        "Settlement data is incomplete or invalid",
    )
}
pub fn validate_game_id(id: &str) -> Result<String, LcuError> {
    if id.is_empty() || id.len() > 20 || !id.bytes().all(|b| b.is_ascii_digit()) {
        return Err(invalid());
    }
    id.parse::<u64>()
        .ok()
        .filter(|id| *id > 0)
        .map(|id| id.to_string())
        .ok_or_else(invalid)
}
fn game_id(value: &Value) -> Result<String, LcuError> {
    if let Some(id) = value.as_str() {
        return validate_game_id(id);
    }
    value
        .as_u64()
        .filter(|id| *id > 0)
        .map(|id| id.to_string())
        .ok_or_else(invalid)
}
fn number(value: &Value, key: &str) -> Result<u32, LcuError> {
    value
        .get(key)
        .and_then(Value::as_u64)
        .and_then(|n| u32::try_from(n).ok())
        .ok_or_else(invalid)
}
fn text(value: &Value, key: &str) -> Option<String> {
    value
        .get(key)
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|name| !name.is_empty() && name.len() <= 512)
        .map(str::to_string)
}
fn serialize_exact<S: Serializer>(value: &Option<u64>, serializer: S) -> Result<S::Ok, S::Error> {
    value.map(|n| n.to_string()).serialize(serializer)
}
fn exact(value: &Value, key: &str) -> Result<Option<u64>, LcuError> {
    match value.get(key) {
        None | Some(Value::Null) => Ok(None),
        Some(value) => value.as_u64().map(Some).ok_or_else(invalid),
    }
}

fn is_custom_match(value: &Value) -> bool {
    match value.get("gameType").and_then(Value::as_str) {
        Some(game_type) if !game_type.is_empty() => game_type == "CUSTOM_GAME",
        _ => value.get("queueId").and_then(Value::as_u64) == Some(0),
    }
}

pub(super) fn friend_puuids(value: &Value) -> Option<HashSet<String>> {
    value
        .as_array()?
        .iter()
        .map(|friend| {
            friend
                .get("puuid")
                .and_then(Value::as_str)
                .filter(|puuid| !puuid.trim().is_empty())
                .map(str::to_owned)
        })
        .collect()
}

fn parse_settlement(
    value: &Value,
    expected_id: &str,
    account: &str,
    rule: Option<SettlementRule>,
    friends: Option<&HashSet<String>>,
    lucky_digit: Option<u8>,
) -> Result<SettlementSnapshot, LcuError> {
    let is_custom = is_custom_match(value);
    let id = game_id(value.get("gameId").ok_or_else(invalid)?)?;
    if id != expected_id {
        return Err(invalid());
    }
    let identities = value
        .get("participantIdentities")
        .and_then(Value::as_array)
        .ok_or_else(invalid)?;
    let participants = value
        .get("participants")
        .and_then(Value::as_array)
        .ok_or_else(invalid)?;
    if participants.is_empty() || participants.len() > 100 || identities.len() != participants.len()
    {
        return Err(invalid());
    }
    let mut identity_ids = HashSet::new();
    for identity in identities {
        if !identity_ids.insert(number(identity, "participantId")?) {
            return Err(invalid());
        }
    }
    let mut player_ids = HashSet::new();
    let mut players = Vec::new();
    let mut own_count = 0;
    for participant in participants {
        let participant_id = number(participant, "participantId")?;
        if !player_ids.insert(participant_id) {
            return Err(invalid());
        }
        let identity = identities
            .iter()
            .find(|identity| {
                identity.get("participantId").and_then(Value::as_u64)
                    == Some(u64::from(participant_id))
            })
            .ok_or_else(invalid)?;
        let player = identity
            .get("player")
            .filter(|player| player.is_object())
            .ok_or_else(invalid)?;
        let puuid = player.get("puuid").and_then(Value::as_str);
        let is_self = puuid == Some(account);
        let is_friend =
            !is_self && friends.is_some_and(|friends| puuid.is_some_and(|id| friends.contains(id)));
        own_count += usize::from(is_self);
        let team_id = number(participant, "teamId")?;
        if !matches!(team_id, 100 | 200) {
            return Err(invalid());
        }
        let champion_id = number(participant, "championId")?;
        if champion_id == 0 {
            return Err(invalid());
        }
        let stats = participant.get("stats").ok_or_else(invalid)?;
        let nickname = text(player, "gameName")
            .map(|name| {
                text(player, "tagLine").map_or_else(|| name.clone(), |tag| format!("{name}#{tag}"))
            })
            .or_else(|| text(player, "summonerName"));
        let damage = exact(stats, "totalDamageDealtToChampions")?;
        let rule_value = match (is_custom || is_self || is_friend, rule) {
            (true, Some(SettlementRule::Damage)) => damage.map(|n| n.to_string()),
            (true, Some(SettlementRule::Tail)) => damage.map(|n| (n % 10).to_string()),
            (true, Some(SettlementRule::Lucky)) => lucky_digit
                .zip(damage)
                .map(|(digit, damage)| (damage % 10).abs_diff(u64::from(digit)).to_string()),
            _ => None,
        };
        players.push(SettlementPlayer {
            id: participant_id.to_string(),
            team_id,
            champion_id,
            level: stats
                .get("champLevel")
                .and_then(Value::as_u64)
                .and_then(|n| u32::try_from(n).ok())
                .filter(|n| *n > 0),
            nickname,
            is_self,
            is_friend,
            win: stats
                .get("win")
                .and_then(Value::as_bool)
                .ok_or_else(invalid)?,
            kills: number(stats, "kills")?,
            deaths: number(stats, "deaths")?,
            assists: number(stats, "assists")?,
            damage,
            taken: exact(stats, "totalDamageTaken")?,
            healing: exact(stats, "totalHeal")?,
            rank: None,
            rule_value,
        });
    }
    if own_count != 1 {
        return Err(invalid());
    }
    for team_id in [100, 200] {
        let team = players
            .iter()
            .filter(|player| player.team_id == team_id)
            .collect::<Vec<_>>();
        let first = team.first().ok_or_else(invalid)?;
        if team.iter().any(|player| player.win != first.win) {
            return Err(invalid());
        }
    }
    // Both sides may lose in an aborted game; do not invent an opposite result.
    let mut eligible = players
        .iter_mut()
        .filter(|player| is_custom || player.is_self || player.is_friend)
        .collect::<Vec<_>>();
    let ranking_status = match rule {
        None => "no_rule",
        Some(SettlementRule::Lucky) if lucky_digit.is_none() => "missing_lucky",
        Some(_) if !is_custom && friends.is_none() => "missing_friends",
        Some(_) if eligible.iter().any(|player| player.damage.is_none()) => "missing_damage",
        Some(_) => "ready",
    };
    if ranking_status == "ready" {
        let scorer = match rule {
            Some(SettlementRule::Damage) => ScoreRule::Damage,
            Some(SettlementRule::Lucky) => ScoreRule::Lucky {
                digit: lucky_digit.expect("ranked lucky match has a digit"),
            },
            _ => ScoreRule::Tail,
        };
        let damage =
            |player: &SettlementPlayer| player.damage.expect("ranked players have exact damage");
        eligible.sort_by(|left, right| {
            scorer
                .compare(damage(left), damage(right))
                .expect("validated rule")
        });
        let mut rank = 1;
        for index in 0..eligible.len() {
            if index > 0
                && scorer
                    .compare(damage(eligible[index - 1]), damage(eligible[index]))
                    .expect("validated rule")
                    != Ordering::Equal
            {
                rank = index as u32 + 1;
            }
            eligible[index].rank = Some(rank);
        }
        players.sort_by_key(|player| player.rank.unwrap_or(u32::MAX));
    }
    let created_at = value
        .get("gameCreation")
        .and_then(Value::as_u64)
        .filter(|n| *n > 0 && *n <= 8_640_000_000_000_000)
        .ok_or_else(invalid)?;
    Ok(SettlementSnapshot {
        id,
        account_key: account.to_string(),
        map_id: crate::lcu::metadata::map_id(value.get("mapId")),
        queue_id: value
            .get("queueId")
            .and_then(Value::as_u64)
            .and_then(|n| u32::try_from(n).ok()),
        game_mode: text(value, "gameMode"),
        game_type: text(value, "gameType"),
        created_at,
        duration_seconds: number(value, "gameDuration")?,
        applied_rule: rule,
        is_custom,
        ranking_status,
        lucky_digit,
        locked_rule: false,
        players,
        updated_at: now_ms(),
    })
}

#[async_trait]
pub trait SettlementSource: Send + Sync {
    async fn profile(&self) -> Result<Value, LcuError>;
    async fn detail(&self, id: &str) -> Result<Value, LcuError>;
    async fn friends(&self) -> Result<Value, LcuError>;
}
pub async fn load_settlement(
    source: &impl SettlementSource,
    id: &str,
    account: &str,
    rule: Option<SettlementRule>,
    resolve_lucky_digit: impl FnOnce() -> Result<Option<u8>, LcuError>,
) -> Result<SettlementSnapshot, LcuError> {
    let id = validate_game_id(id)?;
    let before = source.profile().await?;
    if profile_identity(&before)? != account {
        return Err(LcuError::new(
            LcuErrorCode::AccountChanged,
            "Account context changed",
        ));
    }
    let detail = source.detail(&id).await;
    // Even a missing/failed detail response must not revive an old account's retry context.
    if detail.is_err() && profile_identity(&source.profile().await?)? != account {
        return Err(LcuError::new(
            LcuErrorCode::AccountChanged,
            "Account changed during settlement query",
        ));
    }
    let detail = detail?;
    let unranked_lucky = if rule == Some(SettlementRule::Lucky) {
        Some(parse_settlement(&detail, &id, account, rule, None, None)?)
    } else {
        None
    };
    let friends = if !is_custom_match(&detail) && rule.is_some() {
        source
            .friends()
            .await
            .ok()
            .and_then(|value| friend_puuids(&value))
    } else {
        None
    };
    let after = source.profile().await?;
    if profile_identity(&after)? != account {
        return Err(LcuError::new(
            LcuErrorCode::AccountChanged,
            "Account changed during settlement query",
        ));
    }
    let lucky_digit = if let Some(unranked) = unranked_lucky {
        match resolve_lucky_digit()? {
            Some(digit @ 0..=9) => Some(digit),
            Some(_) => return Err(invalid()),
            None => return Ok(unranked),
        }
    } else {
        None
    };
    parse_settlement(&detail, &id, account, rule, friends.as_ref(), lucky_digit)
}
pub struct SystemSettlementSource {
    http: LcuHttpClient,
    client: LcuClient,
}
impl SystemSettlementSource {
    pub fn connect() -> Result<Self, LcuError> {
        let client = discover()?.ok_or_else(|| {
            LcuError::new(
                LcuErrorCode::ConnectionRefused,
                "League client is not running",
            )
        })?;
        Ok(Self {
            http: LcuHttpClient::new()?,
            client,
        })
    }
}
#[async_trait]
impl SettlementSource for SystemSettlementSource {
    async fn profile(&self) -> Result<Value, LcuError> {
        self.http
            .get_json_optional(&self.client, "/lol-summoner/v1/current-summoner")
            .await?
            .ok_or_else(|| LcuError::new(LcuErrorCode::NotLoggedIn, "Login required"))
    }
    async fn friends(&self) -> Result<Value, LcuError> {
        self.http
            .get_json(&self.client, "/lol-chat/v1/friends")
            .await
    }

    async fn detail(&self, id: &str) -> Result<Value, LcuError> {
        let id = validate_game_id(id)?;
        self.http
            .get_json_optional(&self.client, &format!("/lol-match-history/v1/games/{id}"))
            .await?
            .ok_or_else(|| {
                LcuError::new(
                    LcuErrorCode::SettlementUnavailable,
                    "Match detail is not available",
                )
            })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    use std::collections::VecDeque;
    use std::sync::{
        Mutex,
        atomic::{AtomicUsize, Ordering as AtomicOrdering},
    };
    const ID: &str = "18446744073709551615";
    const ACCOUNT: &str = "test-current-account";
    fn fixture() -> Value {
        let mut value: Value =
            serde_json::from_str(include_str!("../../../tests/fixtures/lcu-settlement.json"))
                .unwrap();
        value["gameType"] = json!("CUSTOM_GAME");
        value["queueId"] = json!(0);
        value
    }
    #[test]
    fn settlement_map_is_only_read_from_its_validated_game() {
        let mut value = fixture();
        value["mapId"] = serde_json::json!(11);
        let result = parse_settlement(&value, ID, ACCOUNT, None, None, None).unwrap();
        assert_eq!(result.map_id, Some(11));
        assert!(parse_settlement(&value, "42", ACCOUNT, None, None, None).is_err());
        value["mapId"] = serde_json::json!(-1);
        assert_eq!(
            parse_settlement(&value, ID, ACCOUNT, None, None, None)
                .unwrap()
                .map_id,
            None
        );
    }
    #[test]
    fn joins_reordered_identities_and_keeps_both_teams_and_exact_stats() {
        let result = parse_settlement(
            &fixture(),
            ID,
            ACCOUNT,
            Some(SettlementRule::Damage),
            None,
            None,
        )
        .unwrap();
        assert_eq!(result.id, ID);
        assert_eq!(result.players.len(), 4);
        let own = &result.players[0];
        assert!(own.is_self && own.win);
        assert_eq!(own.team_id, 100);
        assert_eq!(own.nickname.as_deref(), Some("Current#CN1"));
        assert_eq!(own.damage, Some(99990));
        assert_eq!(own.healing, Some(0));
        assert_eq!(result.players[1].nickname.as_deref(), Some("Rival#CN1"));
        assert!(!result.players[1].win);
        assert!(result.players[2].healing.is_none());
    }
    #[test]
    fn applies_exact_tail_ranking_with_competition_ties() {
        let result = parse_settlement(
            &fixture(),
            ID,
            ACCOUNT,
            Some(SettlementRule::Tail),
            None,
            None,
        )
        .unwrap();
        assert_eq!(result.ranking_status, "ready");
        assert_eq!(
            result
                .players
                .iter()
                .map(|p| (p.id.as_str(), p.rank.unwrap()))
                .collect::<Vec<_>>(),
            vec![("3", 1), ("2", 2), ("4", 2), ("1", 4)]
        );
        assert_eq!(result.players[0].rule_value.as_deref(), Some("9"));
    }
    #[test]
    fn locked_lucky_digit_orders_exact_damage_and_can_be_zero() {
        let result = parse_settlement(
            &fixture(),
            ID,
            ACCOUNT,
            Some(SettlementRule::Lucky),
            None,
            Some(0),
        )
        .unwrap();
        assert_eq!(result.ranking_status, "ready");
        assert_eq!(result.lucky_digit, Some(0));
        assert_eq!(result.players[0].id, "1");
        assert_eq!(result.players[0].rank, Some(1));
        assert_eq!(result.players[0].rule_value.as_deref(), Some("0"));
    }
    #[test]
    fn preserves_u64_precision_on_the_ipc_boundary() {
        let mut value = fixture();
        value["participants"][0]["stats"]["totalDamageDealtToChampions"] = json!(u64::MAX);
        let result = parse_settlement(
            &value,
            ID,
            ACCOUNT,
            Some(SettlementRule::Damage),
            None,
            None,
        )
        .unwrap();
        assert_eq!(result.players[0].damage, Some(u64::MAX));
        let serialized = serde_json::to_value(result).unwrap();
        assert_eq!(serialized["players"][0]["damage"], ID);
        assert_eq!(serialized["players"][0]["ruleValue"], ID);
    }
    #[test]
    fn shows_raw_data_without_ranking_when_inputs_are_missing() {
        let mut value = fixture();
        value["participants"][0]["stats"]
            .as_object_mut()
            .unwrap()
            .remove("totalDamageDealtToChampions");
        for (rule, status) in [
            (Some(SettlementRule::Tail), "missing_damage"),
            (Some(SettlementRule::Lucky), "missing_lucky"),
            (None, "no_rule"),
        ] {
            let result = parse_settlement(&value, ID, ACCOUNT, rule, None, None).unwrap();
            assert_eq!(result.ranking_status, status);
            assert!(result.lucky_digit.is_none());
            assert!(result.players.iter().all(|p| p.rank.is_none()));
            assert!(result.players[0].damage.is_none());
        }
    }
    #[test]
    fn rejects_wrong_game_other_accounts_duplicate_players_and_incomplete_teams() {
        assert!(parse_settlement(&fixture(), "42", ACCOUNT, None, None, None).is_err());
        assert!(parse_settlement(&fixture(), ID, "unrelated", None, None, None).is_err());
        let mut value = fixture();
        value["participants"][2]["participantId"] = json!(1);
        assert!(parse_settlement(&value, ID, ACCOUNT, None, None, None).is_err());
        let mut value = fixture();
        value["participants"][2]["stats"]["win"] = json!(true);
        assert!(parse_settlement(&value, ID, ACCOUNT, None, None, None).is_err());
        let mut value = fixture();
        value["participants"][2]["stats"]["totalDamageDealtToChampions"] = json!(-1);
        assert!(parse_settlement(&value, ID, ACCOUNT, None, None, None).is_err());
    }
    #[test]
    fn matched_games_rank_only_current_account_and_friends() {
        let mut value = fixture();
        value["gameType"] = json!("MATCHED_GAME");
        value["queueId"] = json!(2400);
        value["participants"][3]["stats"]
            .as_object_mut()
            .unwrap()
            .remove("totalDamageDealtToChampions");
        let friends = friend_puuids(&json!([
            {"puuid": "rival-3"}, {"puuid": "not-in-game"}
        ]))
        .unwrap();
        let result = parse_settlement(
            &value,
            ID,
            ACCOUNT,
            Some(SettlementRule::Tail),
            Some(&friends),
            None,
        )
        .unwrap();
        assert!(!result.is_custom);
        assert_eq!(result.ranking_status, "ready");
        assert_eq!(result.players[0].id, "3");
        assert!(result.players[0].is_friend);
        assert_eq!(result.players[0].rank, Some(1));
        assert!(result.players[1].is_self);
        assert_eq!(result.players[1].rank, Some(2));
        assert!(
            result.players[2..]
                .iter()
                .all(|p| p.rank.is_none() && p.rule_value.is_none())
        );

        let unavailable =
            parse_settlement(&value, ID, ACCOUNT, Some(SettlementRule::Tail), None, None).unwrap();
        assert_eq!(unavailable.ranking_status, "missing_friends");
        assert!(unavailable.players.iter().all(|p| p.rank.is_none()));

        let empty = HashSet::new();
        let solo = parse_settlement(
            &value,
            ID,
            ACCOUNT,
            Some(SettlementRule::Tail),
            Some(&empty),
            None,
        )
        .unwrap();
        assert!(solo.players[0].is_self);
        assert_eq!(solo.players[0].rank, Some(1));
        assert!(solo.players[1..].iter().all(|p| p.rank.is_none()));
    }

    struct Source {
        profiles: Mutex<VecDeque<Value>>,
        reads: AtomicUsize,
    }
    struct DelayedSource {
        profile_source: Source,
        details: Mutex<VecDeque<Result<Value, LcuError>>>,
    }
    #[async_trait]
    impl SettlementSource for DelayedSource {
        async fn profile(&self) -> Result<Value, LcuError> {
            self.profile_source.profile().await
        }
        async fn detail(&self, _: &str) -> Result<Value, LcuError> {
            self.details.lock().unwrap().pop_front().unwrap()
        }
        async fn friends(&self) -> Result<Value, LcuError> {
            panic!("custom match")
        }
    }
    #[tokio::test]
    async fn delayed_damage_recovers_without_inventing_zero_damage_or_ranks() {
        let mut partial = fixture();
        partial["participants"][0]["stats"]
            .as_object_mut()
            .unwrap()
            .remove("totalDamageDealtToChampions");
        let source = DelayedSource {
            profile_source: Source::new(&[ACCOUNT, ACCOUNT, ACCOUNT, ACCOUNT]),
            details: Mutex::new(vec![Ok(partial), Ok(fixture())].into()),
        };
        let first = load_settlement(&source, ID, ACCOUNT, Some(SettlementRule::Damage), || {
            Ok(None)
        })
        .await
        .unwrap();
        assert_eq!(first.ranking_status, "missing_damage");
        assert!(first.players[0].damage.is_none());
        assert!(first.players.iter().all(|p| p.rank.is_none()));
        let complete = load_settlement(&source, ID, ACCOUNT, Some(SettlementRule::Damage), || {
            Ok(None)
        })
        .await
        .unwrap();
        assert_eq!(complete.ranking_status, "ready");
        assert!(
            complete
                .players
                .iter()
                .all(|p| p.damage.is_some() && p.rank.is_some())
        );
    }
    #[tokio::test]
    async fn missing_detail_and_timeouts_preserve_errors_and_recheck_account_without_drawing() {
        for code in [
            LcuErrorCode::SettlementUnavailable,
            LcuErrorCode::Timeout,
            LcuErrorCode::HttpStatus,
            LcuErrorCode::InvalidResponse,
        ] {
            for after in [ACCOUNT, "other-account"] {
                let source = DelayedSource {
                    profile_source: Source::new(&[ACCOUNT, after]),
                    details: Mutex::new(vec![Err(LcuError::new(code, "detail failed"))].into()),
                };
                let error =
                    load_settlement(&source, ID, ACCOUNT, Some(SettlementRule::Lucky), || {
                        panic!("missing detail must not draw")
                    })
                    .await
                    .unwrap_err();
                assert_eq!(
                    error.code,
                    if after == ACCOUNT {
                        code.as_str()
                    } else {
                        "account_changed"
                    }
                );
            }
        }
    }
    impl Source {
        fn new(accounts: &[&str]) -> Self {
            Self {
                profiles: Mutex::new(
                    accounts
                        .iter()
                        .map(|account| json!({"puuid": account}))
                        .collect(),
                ),
                reads: AtomicUsize::new(0),
            }
        }
    }
    #[async_trait]
    impl SettlementSource for Source {
        async fn friends(&self) -> Result<Value, LcuError> {
            panic!("custom matches must not read friends")
        }
        async fn profile(&self) -> Result<Value, LcuError> {
            Ok(self.profiles.lock().unwrap().pop_front().unwrap())
        }
        async fn detail(&self, id: &str) -> Result<Value, LcuError> {
            assert_eq!(id, ID);
            self.reads.fetch_add(1, AtomicOrdering::SeqCst);
            Ok(fixture())
        }
    }
    #[tokio::test]
    async fn validates_ids_before_io_and_rejects_account_switches() {
        let source = Source::new(&[]);
        for id in ["../games/42", "0", "18446744073709551616", "-1", "1e5"] {
            assert!(
                load_settlement(&source, id, ACCOUNT, None, || Ok(None))
                    .await
                    .is_err()
            );
        }
        let source = Source::new(&["other"]);
        assert!(
            load_settlement(&source, ID, ACCOUNT, None, || Ok(None))
                .await
                .is_err()
        );
        assert_eq!(source.reads.load(AtomicOrdering::SeqCst), 0);
        let source = Source::new(&[ACCOUNT, "other"]);
        assert!(
            load_settlement(&source, ID, ACCOUNT, None, || Ok(None))
                .await
                .is_err()
        );
        let source = Source::new(&[ACCOUNT, ACCOUNT]);
        assert_eq!(
            load_settlement(&source, ID, ACCOUNT, Some(SettlementRule::Damage), || Ok(
                None
            ))
            .await
            .unwrap()
            .players
            .len(),
            4
        );
    }
    #[cfg(not(windows))]
    #[test]
    fn unsupported_platform_stops_before_io() {
        assert!(SystemSettlementSource::connect().is_err());
    }

    #[tokio::test]
    async fn resolves_lucky_digit_only_after_validating_the_completed_match_and_account() {
        let switched = Source::new(&[ACCOUNT, "other"]);
        assert!(
            load_settlement(&switched, ID, ACCOUNT, Some(SettlementRule::Lucky), || {
                panic!("an unverified match must not draw")
            })
            .await
            .is_err()
        );

        let source = Source::new(&[ACCOUNT, ACCOUNT]);
        let settlement = load_settlement(&source, ID, ACCOUNT, Some(SettlementRule::Lucky), || {
            assert_eq!(source.reads.load(AtomicOrdering::SeqCst), 1);
            assert!(source.profiles.lock().unwrap().is_empty());
            Ok(Some(0))
        })
        .await
        .unwrap();
        assert_eq!(settlement.lucky_digit, Some(0));
        assert_eq!(settlement.ranking_status, "ready");
    }
}
