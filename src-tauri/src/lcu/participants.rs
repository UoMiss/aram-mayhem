use crate::lcu::client::LcuHttpClient;
use crate::lcu::discovery::{LcuClient, discover};
use crate::lcu::error::{LcuError, LcuErrorCode};
use crate::lcu::history::profile_identity;
use crate::lcu::models::now_ms;
use async_trait::async_trait;
use futures_util::{StreamExt, stream};
use serde::Serialize;
use serde_json::Value;
use std::collections::HashSet;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Participant {
    pub id: String,
    pub name: Option<String>,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ParticipantStatus {
    Custom,
    NotCustom,
    Party,
    ChampSelect,
    NoLobby,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ParticipantSnapshot {
    pub account_key: String,
    pub lobby_key: Option<String>,
    pub status: ParticipantStatus,
    pub players: Vec<Participant>,
    pub updated_at: u64,
}

fn invalid() -> LcuError {
    LcuError::new(
        LcuErrorCode::InvalidResponse,
        "Invalid custom lobby participants",
    )
}
fn text<'a>(value: &'a Value, key: &str, max: usize) -> Option<&'a str> {
    value
        .get(key)
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|text| !text.is_empty() && text.len() <= max)
}

fn player_name(player: &Value) -> Option<String> {
    text(player, "gameName", 512)
        .map(|name| {
            text(player, "tagLine", 128)
                .map_or_else(|| name.to_string(), |tag| format!("{name}#{tag}"))
        })
        .or_else(|| text(player, "displayName", 512).map(str::to_owned))
        .or_else(|| text(player, "summonerName", 512).map(str::to_owned))
}

pub fn parse_participants(
    value: Option<&Value>,
    account_key: String,
) -> Result<ParticipantSnapshot, LcuError> {
    let mut snapshot = ParticipantSnapshot {
        account_key,
        lobby_key: None,
        status: ParticipantStatus::NoLobby,
        players: Vec::new(),
        updated_at: now_ms(),
    };
    let Some(value) = value else {
        return Ok(snapshot);
    };
    if !value.is_object() {
        return Err(invalid());
    }
    let config = value.get("gameConfig").ok_or_else(invalid)?;
    let custom = config
        .get("isCustom")
        .and_then(Value::as_bool)
        .ok_or_else(invalid)?;
    let mut custom_members = Vec::new();
    let teams = if custom {
        snapshot.status = ParticipantStatus::Custom;
        let blue = config.get("customTeam100").and_then(Value::as_array);
        let red = config.get("customTeam200").and_then(Value::as_array);
        match (blue, red, value.get("members").and_then(Value::as_array)) {
            (Some(blue), Some(red), _) if !blue.is_empty() || !red.is_empty() => vec![blue, red],
            (_, _, Some(members)) if members.len() <= 100 => {
                custom_members.extend(
                    members
                        .iter()
                        .filter(|player| {
                            matches!(
                                player.get("teamId").and_then(Value::as_u64),
                                Some(100 | 200)
                            ) || player.get("isSpectator").and_then(Value::as_bool) == Some(false)
                        })
                        .cloned(),
                );
                vec![&custom_members]
            }
            (Some(blue), Some(red), None) => vec![blue, red],
            _ => return Err(invalid()),
        }
    } else if let Some(members) = value.get("members") {
        snapshot.status = ParticipantStatus::Party;
        vec![members.as_array().ok_or_else(invalid)?]
    } else {
        snapshot.status = ParticipantStatus::NotCustom;
        return Ok(snapshot);
    };
    snapshot.lobby_key = text(value, "lobbyId", 256)
        .or_else(|| text(value, "multiUserChatId", 256))
        .or_else(|| text(value, "partyId", 256))
        .map(str::to_string);
    snapshot.players = collect_players(teams, false)?;
    Ok(snapshot)
}

fn collect_players(teams: Vec<&Vec<Value>>, selection: bool) -> Result<Vec<Participant>, LcuError> {
    let mut players = Vec::new();
    let mut seen = HashSet::new();
    for team in teams {
        if team.len() > 100 {
            return Err(invalid());
        }
        for player in team {
            if !player.is_object() {
                return Err(invalid());
            }
            if player.get("isBot").and_then(Value::as_bool) == Some(true)
                || player.get("isSpectator").and_then(Value::as_bool) == Some(true)
                || (selection && player.get("isHumanoid").and_then(Value::as_bool) == Some(false))
            {
                continue;
            }
            let id = text(player, "puuid", 128)
                .filter(|id| {
                    id.bytes()
                        .all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_')
                })
                .map(str::to_owned)
                .or_else(|| {
                    player
                        .get("summonerId")
                        .and_then(|id| id.as_u64().or_else(|| id.as_str()?.parse::<u64>().ok()))
                        .filter(|id| *id > 0)
                        .map(|id| format!("summoner-{id}"))
                });
            let Some(id) = id else {
                if selection || text(player, "puuid", 128).is_none() {
                    // Empty slots and concealed identities do not identify a player.
                    continue;
                }
                return Err(invalid());
            };
            if !seen.insert(id.clone()) {
                continue;
            }
            let name = player_name(player);
            players.push(Participant { id, name });
        }
    }
    if players.len() > 100 {
        return Err(invalid());
    }
    players.sort_by(|left, right| left.id.cmp(&right.id));
    Ok(players)
}

#[async_trait]
pub trait ParticipantSource: Send + Sync {
    async fn profile(&self) -> Result<Value, LcuError>;
    async fn lobby(&self) -> Result<Option<Value>, LcuError>;
    async fn champ_select(&self) -> Result<Option<Value>, LcuError> {
        Ok(None)
    }
    async fn summoner(&self, _id: &str) -> Result<Option<Value>, LcuError> {
        Ok(None)
    }
}

pub async fn load_participants(
    source: &impl ParticipantSource,
) -> Result<ParticipantSnapshot, LcuError> {
    let before = source.profile().await?;
    let identity = profile_identity(&before)?;
    let lobby = source.lobby().await?;
    let selection = if lobby.is_none() {
        source.champ_select().await?
    } else {
        None
    };
    let mut snapshot = if let Some(selection) = selection {
        if !selection.is_object() {
            return Err(invalid());
        }
        let teams = ["myTeam", "theirTeam"]
            .iter()
            .filter_map(|key| selection.get(key).and_then(Value::as_array))
            .collect();
        ParticipantSnapshot {
            account_key: identity.to_string(),
            lobby_key: selection
                .get("gameId")
                .and_then(|id| id.as_u64().or_else(|| id.as_str()?.parse::<u64>().ok()))
                .filter(|id| *id > 0)
                .map(|id| id.to_string()),
            status: ParticipantStatus::ChampSelect,
            players: collect_players(teams, true)?,
            updated_at: now_ms(),
        }
    } else {
        parse_participants(lobby.as_ref(), identity.to_string())?
    };
    for player in &mut snapshot.players {
        if player.id == identity && player.name.is_none() {
            player.name = player_name(&before);
        }
    }
    // Only resolve missing names in the lobby. Champion select can hide names even
    // for slots with IDs, so keep the names supplied directly by that endpoint.
    if lobby.is_some() {
        stream::iter(
            snapshot
                .players
                .iter_mut()
                .filter(|player| player.name.is_none()),
        )
        .for_each_concurrent(5, |player| async move {
            if let Ok(Some(profile)) = source.summoner(&player.id).await {
                player.name = player_name(&profile);
            }
        })
        .await;
    }
    let after = source.profile().await?;
    if identity != profile_identity(&after)? {
        return Err(LcuError::new(
            LcuErrorCode::AccountChanged,
            "Account changed during participant query",
        ));
    }
    Ok(snapshot)
}

pub struct SystemParticipantSource {
    http: LcuHttpClient,
    client: LcuClient,
}
impl SystemParticipantSource {
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
    async fn is_phase(&self, expected: &[&str]) -> Result<bool, LcuError> {
        let phase = self
            .http
            .get_json(&self.client, "/lol-gameflow/v1/gameflow-phase")
            .await?;
        Ok(expected.contains(&phase.as_str().ok_or_else(invalid)?))
    }
}
#[async_trait]
impl ParticipantSource for SystemParticipantSource {
    async fn profile(&self) -> Result<Value, LcuError> {
        self.http
            .get_json_optional(&self.client, "/lol-summoner/v1/current-summoner")
            .await?
            .ok_or_else(|| LcuError::new(LcuErrorCode::NotLoggedIn, "Login required"))
    }
    async fn lobby(&self) -> Result<Option<Value>, LcuError> {
        const LOBBY_PHASES: &[&str] = &["Lobby", "Matchmaking", "ReadyCheck"];
        if !self.is_phase(LOBBY_PHASES).await? {
            return Ok(None);
        }
        let mut lobby = self
            .http
            .get_json_optional(&self.client, "/lol-lobby/v2/lobby")
            .await?;
        if let Some(lobby) = lobby.as_mut().and_then(Value::as_object_mut)
            && lobby
                .get("members")
                .and_then(Value::as_array)
                .is_none_or(Vec::is_empty)
            && !["customTeam100", "customTeam200"].iter().any(|key| {
                lobby
                    .get("gameConfig")
                    .and_then(|config| config.get(key))
                    .and_then(Value::as_array)
                    .is_some_and(|team| !team.is_empty())
            })
            && let Ok(Some(members @ Value::Array(_))) = self
                .http
                .get_json_optional(&self.client, "/lol-lobby/v2/lobby/members")
                .await
        {
            lobby.insert("members".into(), members);
        }
        if !self.is_phase(LOBBY_PHASES).await? {
            return Ok(None);
        }
        Ok(lobby)
    }
    async fn champ_select(&self) -> Result<Option<Value>, LcuError> {
        if !self.is_phase(&["ChampSelect"]).await? {
            return Ok(None);
        }
        let selection = self
            .http
            .get_json_optional(&self.client, "/lol-champ-select/v1/session")
            .await?;
        if !self.is_phase(&["ChampSelect"]).await? {
            return Ok(None);
        }
        Ok(selection)
    }
    async fn summoner(&self, id: &str) -> Result<Option<Value>, LcuError> {
        let path = match id
            .strip_prefix("summoner-")
            .and_then(|id| id.parse::<u64>().ok())
        {
            Some(id) => format!("/lol-summoner/v1/summoners/{id}"),
            None => format!("/lol-summoner/v2/summoners/puuid/{id}"),
        };
        self.http.get_json_optional(&self.client, &path).await
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    use std::collections::VecDeque;
    use std::sync::Mutex;
    fn custom() -> Value {
        json!({"partyId":"room-1","gameConfig":{"isCustom":true,"customTeam100":[{"puuid":"p1","summonerName":"One"},{"isBot":true}],"customTeam200":[{"puuid":"p2","gameName":"Two","tagLine":"CN1"},{"puuid":"p1","summonerName":"One"},{"isSpectator":true}],"customSpectators":[{"puuid":"observer"}]}})
    }
    #[test]
    fn merges_both_teams_filters_bots_spectators_and_deduplicates() {
        let result = parse_participants(Some(&custom()), "self".into()).unwrap();
        assert_eq!(result.status, ParticipantStatus::Custom);
        assert_eq!(
            result
                .players
                .iter()
                .map(|player| player.id.as_str())
                .collect::<Vec<_>>(),
            vec!["p1", "p2"]
        );
        assert_eq!(result.players[1].name.as_deref(), Some("Two#CN1"));
        assert_eq!(result.lobby_key.as_deref(), Some("room-1"));
    }
    #[test]
    fn distinguishes_missing_normal_empty_and_malformed_lobbies() {
        assert_eq!(
            parse_participants(None, "self".into()).unwrap().status,
            ParticipantStatus::NoLobby
        );
        let normal = json!({"gameConfig":{"isCustom":false}});
        assert_eq!(
            parse_participants(Some(&normal), "self".into())
                .unwrap()
                .status,
            ParticipantStatus::NotCustom
        );
        let empty = json!({"gameConfig":{"isCustom":true,"customTeam100":[],"customTeam200":[]}});
        assert!(
            parse_participants(Some(&empty), "self".into())
                .unwrap()
                .players
                .is_empty()
        );
        for value in [
            json!([]),
            json!({}),
            json!({"gameConfig":{"isCustom":true}}),
        ] {
            assert!(parse_participants(Some(&value), "self".into()).is_err());
        }
        let mut invalid_player = custom();
        invalid_player["gameConfig"]["customTeam100"][0]["puuid"] = json!("../bad");
        assert!(parse_participants(Some(&invalid_player), "self".into()).is_err());
    }
    #[test]
    fn missing_names_stay_unknown_and_large_payloads_fail() {
        let mut value = custom();
        value["gameConfig"]["customTeam100"][0]
            .as_object_mut()
            .unwrap()
            .remove("summonerName");
        assert!(
            parse_participants(Some(&value), "self".into())
                .unwrap()
                .players[0]
                .name
                .is_none()
        );
        value["gameConfig"]["customTeam100"] = json!(vec![json!({"puuid":"one"}); 101]);
        assert!(parse_participants(Some(&value), "self".into()).is_err());
    }

    #[test]
    fn custom_lobby_uses_members_when_team_arrays_are_empty_or_missing() {
        let members = json!([
            {"puuid":"blue","teamId":100},
            {"summonerId":42,"teamId":200},
            {"puuid":"watcher","isSpectator":true,"teamId":100},
            {"isBot":true,"teamId":200},
            {"teamId":200}
        ]);
        for game_config in [
            json!({"isCustom":true}),
            json!({"isCustom":true,"customTeam100":[],"customTeam200":[]}),
        ] {
            let value = json!({"gameConfig":game_config,"members":members});
            let snapshot = parse_participants(Some(&value), "self".into()).unwrap();
            assert_eq!(snapshot.status, ParticipantStatus::Custom);
            assert_eq!(
                snapshot
                    .players
                    .iter()
                    .map(|p| p.id.as_str())
                    .collect::<Vec<_>>(),
                ["blue", "summoner-42"]
            );
        }
    }
    struct Source(Mutex<VecDeque<Value>>);
    #[async_trait]
    impl ParticipantSource for Source {
        async fn profile(&self) -> Result<Value, LcuError> {
            Ok(self.0.lock().unwrap().pop_front().unwrap())
        }
        async fn lobby(&self) -> Result<Option<Value>, LcuError> {
            Ok(Some(custom()))
        }
    }
    #[tokio::test]
    async fn rejects_account_changes_and_accepts_consistent_identity() {
        let source = Source(Mutex::new(VecDeque::from([
            json!({"puuid":"one"}),
            json!({"puuid":"two"}),
        ])));
        assert!(load_participants(&source).await.is_err());
        let source = Source(Mutex::new(VecDeque::from([
            json!({"puuid":"one"}),
            json!({"puuid":"one"}),
        ])));
        assert_eq!(load_participants(&source).await.unwrap().players.len(), 2);
    }

    struct UnnamedLobby;
    #[async_trait]
    impl ParticipantSource for UnnamedLobby {
        async fn profile(&self) -> Result<Value, LcuError> {
            Ok(json!({"puuid":"local","displayName":"本人"}))
        }
        async fn lobby(&self) -> Result<Option<Value>, LcuError> {
            Ok(Some(json!({
                "gameConfig": {"isCustom": false},
                "members": [
                    {"puuid":"local","summonerName":""},
                    {"puuid":"remote","summonerName":""},
                    {"summonerId":"42"},
                    {"puuid":"unknown"},
                    {"puuid":"named","displayName":"已有昵称"},
                    {"puuid":"observer","isSpectator":true}
                ]
            })))
        }
        async fn summoner(&self, id: &str) -> Result<Option<Value>, LcuError> {
            match id {
                "remote" => Ok(Some(json!({"gameName":"玩家","tagLine":"CN1"}))),
                "summoner-42" => Ok(Some(json!({"displayName":"旧版昵称"}))),
                "unknown" => Err(LcuError::new(LcuErrorCode::Timeout, "Profile not ready")),
                _ => panic!("unexpected lookup for {id}"),
            }
        }
    }

    #[tokio::test]
    async fn resolves_blank_lobby_names_without_dropping_unavailable_players() {
        let result = load_participants(&UnnamedLobby).await.unwrap();
        assert_eq!(
            result
                .players
                .iter()
                .map(|p| (p.id.as_str(), p.name.as_deref()))
                .collect::<Vec<_>>(),
            vec![
                ("local", Some("本人")),
                ("named", Some("已有昵称")),
                ("remote", Some("玩家#CN1")),
                ("summoner-42", Some("旧版昵称")),
                ("unknown", None),
            ]
        );
    }
    #[cfg(not(windows))]
    #[test]
    fn unsupported_platform_stops_before_network() {
        assert!(SystemParticipantSource::connect().is_err());
    }
}
