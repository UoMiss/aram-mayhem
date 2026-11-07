use crate::lcu::error::{LcuError, LcuErrorCode};
use crate::lcu::gameflow::{ChampionSelectPlayer, ChampionSelectSnapshot};
use crate::lcu::models::now_ms;
use serde_json::Value;

/// Preserve LCU's explicit myTeam/theirTeam groups. Never infer red/blue from order.
pub fn parse_champion_select(value: &Value) -> Result<ChampionSelectSnapshot, LcuError> {
    if !value.is_object() {
        return Err(LcuError::new(
            LcuErrorCode::InvalidResponse,
            "LCU champion-select response is not an object",
        ));
    }

    let game_id = value.get("gameId").and_then(value_as_string);
    let my_team = parse_team(value.get("myTeam"), "my_team");
    let their_team = parse_team(value.get("theirTeam"), "their_team");
    let complete = !my_team.is_empty()
        && !their_team.is_empty()
        && my_team
            .iter()
            .chain(their_team.iter())
            .all(|player| player.player_id.is_some());

    Ok(ChampionSelectSnapshot {
        game_id,
        my_team,
        their_team,
        local_player_cell_id: value.get("localPlayerCellId").and_then(Value::as_i64),
        complete,
        updated_at: now_ms(),
    })
}

fn parse_team(value: Option<&Value>, team: &str) -> Vec<ChampionSelectPlayer> {
    value
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .map(|player| {
            let player_id = player
                .get("puuid")
                .and_then(Value::as_str)
                .map(str::to_string)
                .or_else(|| player.get("summonerId").and_then(value_as_string));
            let champion_id = player.get("championId").and_then(Value::as_i64);
            ChampionSelectPlayer {
                player_id,
                champion_id,
                team: team.to_string(),
                cell_id: player.get("cellId").and_then(Value::as_i64),
                assigned_position: player
                    .get("assignedPosition")
                    .and_then(Value::as_str)
                    .map(str::to_string),
            }
        })
        .collect()
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
    fn keeps_explicit_team_groups_and_player_ids() {
        let snapshot = parse_champion_select(&json!({
            "gameId": 42,
            "localPlayerCellId": 1,
            "myTeam": [
                {"puuid": "puuid-a", "championId": 1, "cellId": 1, "assignedPosition": "middle"}
            ],
            "theirTeam": [
                {"summonerId": 99, "championId": 2, "cellId": 6}
            ]
        }))
        .expect("champ select");
        assert_eq!(snapshot.game_id.as_deref(), Some("42"));
        assert!(snapshot.complete);
        assert_eq!(snapshot.my_team[0].team, "my_team");
        assert_eq!(snapshot.their_team[0].team, "their_team");
        assert_eq!(snapshot.my_team[0].player_id.as_deref(), Some("puuid-a"));
        assert_eq!(snapshot.their_team[0].player_id.as_deref(), Some("99"));
    }

    #[test]
    fn missing_team_is_incomplete_and_never_guessed() {
        let snapshot = parse_champion_select(&json!({
            "myTeam": [{"puuid": "a"}],
            "theirTeam": []
        }))
        .expect("champ select");
        assert!(!snapshot.complete);
        assert_eq!(snapshot.their_team.len(), 0);
        assert_eq!(snapshot.my_team[0].team, "my_team");
    }

    #[test]
    fn malformed_champion_select_is_an_error() {
        assert!(parse_champion_select(&json!("not-an-object")).is_err());
    }
}
