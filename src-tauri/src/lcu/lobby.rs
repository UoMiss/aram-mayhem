use crate::lcu::error::{LcuError, LcuErrorCode};
use crate::lcu::gameflow::LobbySnapshot;
use crate::lcu::models::now_ms;
use serde_json::Value;

/// Parse only the small lobby fields the domain needs. Missing fields stay None.
pub fn parse_lobby(value: &Value) -> Result<LobbySnapshot, LcuError> {
    if !value.is_object() {
        return Err(LcuError::new(
            LcuErrorCode::InvalidResponse,
            "LCU lobby response is not an object",
        ));
    }

    let lobby_id = lobby_key(value);
    let queue_id = value.pointer("/gameConfig/queueId").and_then(Value::as_i64);
    let game_mode = value
        .pointer("/gameConfig/gameMode")
        .and_then(Value::as_str)
        .map(str::to_string);
    let member_count = value
        .get("members")
        .and_then(Value::as_array)
        .map(|members| members.len() as u32);

    Ok(LobbySnapshot {
        lobby_id,
        queue_id,
        map_id: crate::lcu::metadata::map_id(value.pointer("/gameConfig/mapId")),
        game_mode,
        is_custom_game: value
            .pointer("/gameConfig/isCustom")
            .and_then(Value::as_bool),
        member_count,
        updated_at: now_ms(),
    })
}

pub fn lobby_key(value: &Value) -> Option<String> {
    ["lobbyId", "multiUserChatId", "partyId"]
        .iter()
        .find_map(|key| {
            value
                .get(key)
                .and_then(value_as_string)
                .map(|s| s.trim().to_owned())
                .filter(|s| !s.is_empty() && s != "0" && s.len() <= 256)
        })
}

fn value_as_string(value: &Value) -> Option<String> {
    value
        .as_str()
        .map(str::to_string)
        .or_else(|| value.as_i64().map(|number| number.to_string()))
        .or_else(|| value.as_u64().map(|number| number.to_string()))
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn actual_map_is_optional_validated_and_part_of_changes() {
        let value = json!({"gameConfig":{"queueId":2400,"mapId":11}});
        assert_eq!(parse_lobby(&value).unwrap().map_id, Some(11));
        for map in [
            json!(0),
            json!(-1),
            json!("12"),
            json!({}),
            json!(9007199254740992_u64),
        ] {
            assert_eq!(
                parse_lobby(&json!({"gameConfig":{"queueId":2400,"mapId":map}}))
                    .unwrap()
                    .map_id,
                None
            );
        }
        assert_eq!(
            parse_lobby(&json!({"gameConfig":{"queueId":2400}}))
                .unwrap()
                .map_id,
            None
        );
    }

    #[test]
    fn parses_lobby_count_and_optional_fields_without_defaults() {
        let snapshot = parse_lobby(&json!({
            "lobbyId": "lobby-1",
            "gameConfig": {"queueId": 450, "gameMode": "ARAM"},
            "members": [{"summonerId": 1}, {"summonerId": 2}]
        }))
        .expect("lobby");
        assert_eq!(snapshot.lobby_id.as_deref(), Some("lobby-1"));
        assert_eq!(snapshot.queue_id, Some(450));
        assert_eq!(snapshot.game_mode.as_deref(), Some("ARAM"));
        assert_eq!(snapshot.member_count, Some(2));
    }

    #[test]
    fn missing_fields_are_not_invented() {
        let snapshot = parse_lobby(&json!({})).expect("empty lobby");
        assert!(snapshot.lobby_id.is_none());
        assert!(snapshot.queue_id.is_none());
        assert!(snapshot.game_mode.is_none());
        assert!(snapshot.member_count.is_none());
    }

    #[test]
    fn malformed_lobby_is_an_error() {
        assert!(parse_lobby(&json!([1, 2, 3])).is_err());
    }
}
