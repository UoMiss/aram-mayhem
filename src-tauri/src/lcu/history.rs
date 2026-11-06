use crate::lcu::client::LcuHttpClient;
use crate::lcu::discovery::{LcuClient, discover};
use crate::lcu::error::{LcuError, LcuErrorCode};
use crate::lcu::models::now_ms;
use crate::lcu::settlement::friend_puuids;
use async_trait::async_trait;
use serde::Serialize;
use serde_json::Value;
use std::collections::{HashMap, HashSet};

pub const RECENT_MATCH_LIMIT: usize = 20;
pub const MAX_HISTORY_OFFSET: u32 = 980;
const PROFILE_PATH: &str = "/lol-summoner/v1/current-summoner";
const CHAMPIONS_PATH: &str = "/lol-game-data/assets/v1/champion-summary.json";

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct HistoryMatch {
    pub id: String,
    pub queue_id: Option<u32>,
    pub game_mode: Option<String>,
    pub game_type: Option<String>,
    pub created_at: u64,
    pub duration_seconds: u32,
    pub champion_id: u32,
    pub champion_name: Option<String>,
    pub win: bool,
    pub is_friend: bool,
    pub kills: u32,
    pub deaths: u32,
    pub assists: u32,
    pub damage_dealt: Option<u64>,
    pub damage_taken: Option<u64>,
    pub gold_earned: Option<u64>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MatchHistorySnapshot {
    pub account_key: String,
    pub display_name: Option<String>,
    pub matches: Vec<HistoryMatch>,
    pub updated_at: u64,
    pub next_offset: Option<u32>,
}

fn invalid() -> LcuError {
    LcuError::new(
        LcuErrorCode::InvalidResponse,
        "LCU history response is incomplete or malformed",
    )
}

fn identifier(value: &Value) -> Option<String> {
    value
        .as_u64()
        .filter(|id| *id > 0)
        .map(|id| id.to_string())
        .or_else(|| {
            value
                .as_str()
                .filter(|id| {
                    !id.is_empty()
                        && id.len() <= 32
                        && id.bytes().all(|b| b.is_ascii_digit())
                        && id.bytes().any(|b| b != b'0')
                })
                .map(str::to_string)
        })
}

pub(super) fn profile_identity(profile: &Value) -> Result<&str, LcuError> {
    profile
        .get("puuid")
        .and_then(Value::as_str)
        .filter(|id| {
            !id.is_empty()
                && id.len() <= 128
                && id
                    .bytes()
                    .all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_')
        })
        .ok_or_else(|| {
            LcuError::new(
                LcuErrorCode::NotLoggedIn,
                "A logged-in summoner is required",
            )
        })
}

fn number(value: &Value, key: &str) -> Result<u32, LcuError> {
    value
        .get(key)
        .and_then(Value::as_u64)
        .and_then(|n| u32::try_from(n).ok())
        .ok_or_else(invalid)
}

/// Match the current player by identity and participantId; never assume array order.
fn parse_match(
    game: &Value,
    puuid: &str,
    names: &HashMap<u32, String>,
) -> Result<HistoryMatch, LcuError> {
    let identities = game
        .get("participantIdentities")
        .and_then(Value::as_array)
        .ok_or_else(invalid)?;
    let identity = identities
        .iter()
        .find(|identity| identity.pointer("/player/puuid").and_then(Value::as_str) == Some(puuid))
        .ok_or_else(invalid)?;
    let participant_id = number(identity, "participantId")?;
    let participant = game
        .get("participants")
        .and_then(Value::as_array)
        .ok_or_else(invalid)?
        .iter()
        .find(|player| {
            player.get("participantId").and_then(Value::as_u64) == Some(u64::from(participant_id))
        })
        .ok_or_else(invalid)?;
    let stats = participant.get("stats").ok_or_else(invalid)?;
    let champion_id = number(participant, "championId")?;
    if champion_id == 0 {
        return Err(invalid());
    }
    Ok(HistoryMatch {
        id: game
            .get("gameId")
            .and_then(identifier)
            .ok_or_else(invalid)?,
        queue_id: game
            .get("queueId")
            .and_then(Value::as_u64)
            .and_then(|n| u32::try_from(n).ok()),
        game_mode: game
            .get("gameMode")
            .and_then(Value::as_str)
            .map(str::to_string),
        game_type: game
            .get("gameType")
            .and_then(Value::as_str)
            .map(str::to_string),
        created_at: game
            .get("gameCreation")
            .and_then(Value::as_u64)
            .filter(|n| *n > 0)
            .ok_or_else(invalid)?,
        duration_seconds: number(game, "gameDuration")?,
        champion_id,
        champion_name: names.get(&champion_id).cloned(),
        is_friend: false,
        win: stats
            .get("win")
            .and_then(Value::as_bool)
            .ok_or_else(invalid)?,
        kills: number(stats, "kills")?,
        deaths: number(stats, "deaths")?,
        assists: number(stats, "assists")?,
        damage_dealt: stats
            .get("totalDamageDealtToChampions")
            .and_then(Value::as_u64),
        damage_taken: stats.get("totalDamageTaken").and_then(Value::as_u64),
        gold_earned: stats.get("goldEarned").and_then(Value::as_u64),
    })
}

pub fn parse_history(
    value: &Value,
    puuid: &str,
    names: &HashMap<u32, String>,
) -> Result<Vec<HistoryMatch>, LcuError> {
    let games = value
        .pointer("/games/games")
        .and_then(Value::as_array)
        .ok_or_else(invalid)?;
    // Bound malformed responses rather than allocating from an unbounded client payload.
    if games.len() > 100 {
        return Err(invalid());
    }
    let mut matches = games
        .iter()
        .map(|game| parse_match(game, puuid, names))
        .collect::<Result<Vec<_>, _>>()?;
    matches.sort_by(|a, b| b.created_at.cmp(&a.created_at));
    let mut ids = HashSet::new();
    matches.retain(|game| ids.insert(game.id.clone()));
    matches.truncate(RECENT_MATCH_LIMIT);
    Ok(matches)
}

#[async_trait]
pub trait HistorySource: Send + Sync {
    async fn profile(&self) -> Result<Value, LcuError>;
    async fn matches(&self, puuid: &str, offset: u32) -> Result<Value, LcuError>;
    async fn friends(&self) -> Option<HashSet<String>> {
        None
    }
    async fn champion_names(&self) -> HashMap<u32, String>;
}

#[cfg(test)]
pub async fn load_history(source: &impl HistorySource) -> Result<MatchHistorySnapshot, LcuError> {
    load_history_page(source, 0).await
}
pub async fn load_history_page(
    source: &impl HistorySource,
    offset: u32,
) -> Result<MatchHistorySnapshot, LcuError> {
    if offset > MAX_HISTORY_OFFSET || !offset.is_multiple_of(RECENT_MATCH_LIMIT as u32) {
        return Err(invalid());
    }
    let profile = source.profile().await?;
    let puuid = profile_identity(&profile)?;
    let raw = source.matches(puuid, offset).await?;
    let (names, friends) = tokio::join!(source.champion_names(), source.friends());
    let mut matches = parse_history(&raw, puuid, &names)?;
    let games = raw
        .pointer("/games/games")
        .and_then(Value::as_array)
        .ok_or_else(invalid)?;
    if let Some(friends) = friends {
        let games_with_friends = games
            .iter()
            .filter_map(|game| {
                let identities = game.get("participantIdentities")?.as_array()?;
                let has_friend = identities.iter().any(|entry| {
                    entry
                        .pointer("/player/puuid")
                        .and_then(Value::as_str)
                        .is_some_and(|id| id != puuid && friends.contains(id))
                });
                if has_friend {
                    game.get("gameId").and_then(identifier)
                } else {
                    None
                }
            })
            .collect::<HashSet<_>>();
        for game in &mut matches {
            game.is_friend = games_with_friends.contains(&game.id);
        }
    }
    let next = offset + RECENT_MATCH_LIMIT as u32;
    let next_offset =
        (games.len() >= RECENT_MATCH_LIMIT && next <= MAX_HISTORY_OFFSET).then_some(next);
    let current = source.profile().await?;
    if profile_identity(&current)? != puuid {
        return Err(LcuError::new(
            LcuErrorCode::AccountChanged,
            "Current account changed during history query",
        ));
    }
    let display_name = ["gameName", "displayName"]
        .iter()
        .filter_map(|key| profile.get(*key).and_then(Value::as_str))
        .find(|name| !name.trim().is_empty())
        .map(str::to_string);
    Ok(MatchHistorySnapshot {
        account_key: puuid.to_string(),
        display_name,
        matches,
        next_offset,
        updated_at: now_ms(),
    })
}

pub struct SystemHistorySource {
    http: LcuHttpClient,
    client: LcuClient,
}

impl SystemHistorySource {
    pub fn connect() -> Result<Self, LcuError> {
        // Non-Windows exits in discover() before creating a network connector.
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
impl HistorySource for SystemHistorySource {
    async fn profile(&self) -> Result<Value, LcuError> {
        self.http
            .get_json_optional(&self.client, PROFILE_PATH)
            .await?
            .ok_or_else(|| {
                LcuError::new(
                    LcuErrorCode::NotLoggedIn,
                    "A logged-in summoner is required",
                )
            })
    }
    async fn matches(&self, puuid: &str, offset: u32) -> Result<Value, LcuError> {
        // puuid was validated by profile_identity; callers cannot supply a URL/path.
        let path = format!(
            "/lol-match-history/v1/products/lol/{puuid}/matches?begIndex={offset}&endIndex={}",
            offset + RECENT_MATCH_LIMIT as u32
        );
        self.http.get_json(&self.client, &path).await
    }
    async fn friends(&self) -> Option<HashSet<String>> {
        let value = self
            .http
            .get_json(&self.client, "/lol-chat/v1/friends")
            .await
            .ok()?;
        friend_puuids(&value)
    }

    async fn champion_names(&self) -> HashMap<u32, String> {
        let Ok(Some(value)) = self
            .http
            .get_json_optional(&self.client, CHAMPIONS_PATH)
            .await
        else {
            return HashMap::new();
        };
        value
            .as_array()
            .into_iter()
            .flatten()
            .filter_map(|entry| {
                let id = entry
                    .get("id")?
                    .as_u64()
                    .and_then(|n| u32::try_from(n).ok())?;
                let name = entry.get("name")?.as_str()?;
                Some((id, name.to_string()))
            })
            .collect()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    use std::collections::VecDeque;
    use std::sync::{
        Mutex,
        atomic::{AtomicUsize, Ordering},
    };

    fn fixture() -> Value {
        serde_json::from_str(include_str!("../../../tests/fixtures/lcu-history.json")).unwrap()
    }
    fn names() -> HashMap<u32, String> {
        HashMap::from([(221, "泽丽".to_string())])
    }

    #[test]
    fn selects_current_participant_by_identity_and_preserves_u64_game_ids() {
        let result = parse_history(&fixture(), "test-current-account", &names()).unwrap();
        assert_eq!(result.len(), 2);
        assert_eq!(result[0].id, "18446744073709551615");
        assert_eq!(result[0].kills, 12);
        assert!(result[0].win);
        assert_eq!(result[0].champion_name.as_deref(), Some("泽丽"));
        assert_eq!(result[0].damage_dealt, Some(34567));
        assert_eq!(result[1].id, "42");
        assert!(result[1].champion_name.is_none());
        assert!(result[1].damage_dealt.is_none());
    }

    #[test]
    fn distinguishes_empty_history_from_missing_or_malformed_data() {
        assert!(
            parse_history(
                &json!({"games":{"games":[]}}),
                "test-current-account",
                &names()
            )
            .unwrap()
            .is_empty()
        );
        for value in [
            json!({}),
            json!({"games":{"games":null}}),
            json!({"games":{"games":[{}]}}),
        ] {
            assert!(parse_history(&value, "test-current-account", &names()).is_err());
        }
        let mut raw = fixture();
        raw["games"]["games"][0]["participants"][1]["stats"]["kills"] = json!("12");
        assert!(parse_history(&raw, "test-current-account", &names()).is_err());
        assert!(parse_history(&fixture(), "unmatched-account", &names()).is_err());
    }

    #[test]
    fn limits_deduplicates_and_orders_the_latest_matches() {
        let game = fixture()["games"]["games"][0].clone();
        let mut games: Vec<_> = (1..=25)
            .map(|id| {
                let mut item = game.clone();
                item["gameId"] = json!(id);
                item["gameCreation"] = json!(id * 1000);
                item
            })
            .collect();
        games.push(games[0].clone());
        let result = parse_history(
            &json!({"games":{"games":games}}),
            "test-current-account",
            &names(),
        )
        .unwrap();
        assert_eq!(result.len(), 20);
        assert_eq!(result[0].id, "25");
        assert_eq!(result[19].id, "6");
    }

    struct FakeSource {
        profiles: Mutex<VecDeque<Value>>,
        calls: AtomicUsize,
    }
    #[async_trait]
    impl HistorySource for FakeSource {
        async fn profile(&self) -> Result<Value, LcuError> {
            Ok(self.profiles.lock().unwrap().pop_front().unwrap())
        }
        async fn matches(&self, puuid: &str, _offset: u32) -> Result<Value, LcuError> {
            assert_eq!(puuid, "test-current-account");
            self.calls.fetch_add(1, Ordering::SeqCst);
            Ok(fixture())
        }
        async fn champion_names(&self) -> HashMap<u32, String> {
            names()
        }
    }
    fn source(profiles: Vec<Value>) -> FakeSource {
        FakeSource {
            profiles: Mutex::new(profiles.into()),
            calls: AtomicUsize::new(0),
        }
    }

    #[tokio::test]
    async fn checks_login_and_rejects_account_switches_during_query() {
        let profile = json!({"puuid":"test-current-account", "gameName":"Test player"});
        let changed = source(vec![profile.clone(), json!({"puuid":"test-new-account"})]);
        assert_eq!(
            load_history(&changed).await.unwrap_err().code,
            "account_changed"
        );
        for invalid in [
            json!({}),
            json!({"puuid":"../private"}),
            json!({"puuid":""}),
        ] {
            let not_logged_in = source(vec![invalid]);
            assert_eq!(
                load_history(&not_logged_in).await.unwrap_err().code,
                "not_logged_in"
            );
            assert_eq!(not_logged_in.calls.load(Ordering::SeqCst), 0);
        }
        let normal = source(vec![profile.clone(), profile]);
        let snapshot = load_history(&normal).await.unwrap();
        assert_eq!(snapshot.display_name.as_deref(), Some("Test player"));
        assert_eq!(snapshot.matches.len(), 2);
        let json = serde_json::to_value(snapshot).unwrap();
        assert!(json.get("accountKey").is_some());
        assert!(json.get("password").is_none());
        assert!(json["matches"][0].get("createdAt").is_some());
    }

    #[cfg(not(windows))]
    #[test]
    fn non_windows_history_never_opens_a_network_client() {
        let error = match SystemHistorySource::connect() {
            Err(error) => error,
            Ok(_) => panic!("unsupported platform connected"),
        };
        assert_eq!(error.code, "unsupported_platform");
    }
}
