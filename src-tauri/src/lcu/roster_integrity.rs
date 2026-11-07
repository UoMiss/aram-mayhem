//! Conservative evidence for a custom-room roster. Missing flags never prove humanity.
use crate::lcu::{
    error::{LcuError, LcuErrorCode},
    participants::{Participant, ParticipantSnapshot, player_name},
};
use serde::Serialize;
use serde_json::Value;
use std::collections::{BTreeMap, HashMap, HashSet};

#[derive(Debug, Clone, Copy, Serialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum RosterCompleteness {
    Complete,
    Partial,
    Unknown,
}
#[derive(Debug, Clone, Copy, Serialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum RosterEvidence {
    CustomTeams,
    Members,
    None,
}
#[derive(Debug, Clone, Copy, Serialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum RosterIssue {
    MissingTeams,
    UnresolvedSlots,
    ConflictingRoster,
    MissingContext,
}
fn invalid() -> LcuError {
    LcuError::new(LcuErrorCode::InvalidResponse, "Invalid roster evidence")
}
fn puuid(value: &Value) -> Option<&str> {
    value.get("puuid")?.as_str().map(str::trim).filter(|s| {
        !s.is_empty()
            && s.len() <= 128
            && s.bytes()
                .all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_')
    })
}
fn summoner(value: &Value) -> Option<u64> {
    let value = value.get("summonerId")?;
    value
        .as_u64()
        .or_else(|| value.as_str()?.parse().ok())
        .filter(|id| *id > 0)
}
fn identity(value: &Value, aliases: &HashMap<u64, String>) -> Option<String> {
    puuid(value).map(str::to_owned).or_else(|| {
        summoner(value).map(|id| {
            aliases
                .get(&id)
                .cloned()
                .unwrap_or_else(|| format!("summoner-{id}"))
        })
    })
}
fn excluded(value: &Value) -> bool {
    value.get("isBot").and_then(Value::as_bool) == Some(true)
        || value.get("isSpectator").and_then(Value::as_bool) == Some(true)
}
fn rows(value: Option<&Value>) -> Result<Option<&Vec<Value>>, LcuError> {
    value
        .map(|v| {
            v.as_array()
                .filter(|a| a.len() <= 100 && a.iter().all(Value::is_object))
                .ok_or_else(invalid)
        })
        .transpose()
}

pub fn inspect_custom(value: &Value, snapshot: &mut ParticipantSnapshot) -> Result<(), LcuError> {
    let blue = rows(value.pointer("/gameConfig/customTeam100"))?;
    let red = rows(value.pointer("/gameConfig/customTeam200"))?;
    let members = rows(value.get("members"))?;
    let spectators = rows(value.pointer("/gameConfig/customSpectators"))?;
    if blue.is_none() && red.is_none() && members.is_none() {
        return Err(invalid());
    }
    let mut aliases = HashMap::new();
    let mut conflict = false;
    for row in [blue, red, members, spectators]
        .into_iter()
        .flatten()
        .flatten()
    {
        if row
            .get("puuid")
            .and_then(Value::as_str)
            .is_some_and(|s| !s.trim().is_empty())
            && puuid(row).is_none()
            && summoner(row).is_none()
        {
            return Err(invalid());
        }
        if let (Some(id), Some(uuid)) = (summoner(row), puuid(row))
            && let Some(old) = aliases.insert(id, uuid.to_owned())
            && old != uuid
        {
            conflict = true;
        }
    }
    let human_ids: HashSet<String> = [blue, red, members]
        .into_iter()
        .flatten()
        .flatten()
        .filter(|row| row.get("isBot").and_then(Value::as_bool) == Some(false))
        .filter_map(|row| identity(row, &aliases))
        .collect();
    let mut excluded_ids = HashSet::new();
    for row in [blue, red, members]
        .into_iter()
        .flatten()
        .flatten()
        .filter(|row| excluded(row))
        .chain(spectators.into_iter().flatten())
    {
        if let Some(id) = identity(row, &aliases) {
            excluded_ids.insert(id);
        }
    }
    let reliable_teams = blue.is_some()
        && red.is_some()
        && (blue.is_some_and(|a| !a.is_empty())
            || red.is_some_and(|a| !a.is_empty())
            || members.is_none_or(Vec::is_empty));
    let candidates: Vec<&Value> = if reliable_teams {
        blue.into_iter().chain(red).flatten().collect()
    } else {
        members.into_iter().flatten().collect()
    };
    snapshot.evidence = if reliable_teams {
        RosterEvidence::CustomTeams
    } else if members.is_some() {
        RosterEvidence::Members
    } else {
        RosterEvidence::None
    };
    let mut players = BTreeMap::<String, Participant>::new();
    let mut unresolved = 0;
    for row in candidates {
        if excluded(row) {
            continue;
        }
        let Some(id) = identity(row, &aliases) else {
            unresolved += 1;
            continue;
        };
        if excluded_ids.contains(&id) {
            conflict = true;
            continue;
        }
        let known_role =
            reliable_teams || matches!(row.get("teamId").and_then(Value::as_u64), Some(100 | 200));
        if !known_role {
            unresolved += 1;
            continue;
        }
        if !human_ids.contains(&id) {
            unresolved += 1;
        }
        if players.contains_key(&id) {
            conflict = true;
            continue;
        }
        players.insert(
            id.clone(),
            Participant {
                id,
                name: player_name(row),
            },
        );
    }
    if reliable_teams {
        for row in members.into_iter().flatten() {
            if excluded(row) {
                continue;
            }
            match identity(row, &aliases) {
                Some(id) if excluded_ids.contains(&id) => {}
                Some(id) if players.contains_key(&id) => {}
                _ => {
                    unresolved += 1;
                    conflict = true;
                }
            }
        }
    }
    if players.len() > 100 {
        return Err(invalid());
    }
    snapshot.players = players.into_values().collect();
    snapshot.eligible_count = snapshot.players.len();
    snapshot.unresolved_count = unresolved;
    snapshot.completeness = if !reliable_teams {
        RosterCompleteness::Unknown
    } else if conflict || unresolved > 0 {
        RosterCompleteness::Partial
    } else {
        RosterCompleteness::Complete
    };
    snapshot.issue = if conflict {
        Some(RosterIssue::ConflictingRoster)
    } else if !reliable_teams {
        Some(RosterIssue::MissingTeams)
    } else if unresolved > 0 {
        Some(RosterIssue::UnresolvedSlots)
    } else {
        None
    };
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::lcu::participants::parse_participants;
    use serde_json::json;
    fn room(count: usize) -> Value {
        let players: Vec<_> = (0..count)
            .map(|i| json!({"puuid":format!("p{i}"),"summonerId":i+1,"isBot":false}))
            .collect();
        json!({"lobbyId":"room", "gameConfig":{"isCustom":true,"customTeam100":&players[..count/2],"customTeam200":&players[count/2..]},"members":players})
    }
    #[test]
    fn complete_rosters_require_full_team_evidence_but_not_names() {
        for count in [6, 8, 10] {
            let result = parse_participants(Some(&room(count)), "self".into()).unwrap();
            assert_eq!(result.completeness, RosterCompleteness::Complete);
            assert_eq!(result.eligible_count, count);
            assert_eq!(result.unresolved_count, 0);
            assert!(result.players.iter().all(|p| p.name.is_none()));
        }
    }
    #[test]
    fn ten_slots_with_two_missing_ids_cannot_become_complete_eight() {
        let mut value = room(10);
        value["gameConfig"]["customTeam100"][0] = json!({"isBot":false});
        value["gameConfig"]["customTeam200"][0] = json!({"isBot":false});
        let result = parse_participants(Some(&value), "self".into()).unwrap();
        assert_eq!(result.players.len(), 8);
        assert_eq!(result.completeness, RosterCompleteness::Partial);
        assert!(result.unresolved_count >= 2);
    }
    #[test]
    fn unknown_flags_missing_teams_and_member_conflicts_are_not_complete() {
        let mut unknown_flag = room(6);
        unknown_flag["gameConfig"]["customTeam100"][0]
            .as_object_mut()
            .unwrap()
            .remove("isBot");
        unknown_flag["members"][0]
            .as_object_mut()
            .unwrap()
            .remove("isBot");
        let mut missing_team = room(6);
        missing_team["gameConfig"]
            .as_object_mut()
            .unwrap()
            .remove("customTeam200");
        let mut conflict = room(6);
        conflict["members"]
            .as_array_mut()
            .unwrap()
            .push(json!({"puuid":"extra","isBot":false}));
        for value in [unknown_flag, missing_team, conflict] {
            assert_ne!(
                parse_participants(Some(&value), "self".into())
                    .unwrap()
                    .completeness,
                RosterCompleteness::Complete
            );
        }
    }
    #[test]
    fn explicit_bots_and_spectators_are_excluded_without_hiding_conflicts() {
        let mut value = room(6);
        value["gameConfig"]["customTeam100"]
            .as_array_mut()
            .unwrap()
            .push(json!({"isBot":true,"puuid":"bot"}));
        value["members"]
            .as_array_mut()
            .unwrap()
            .push(json!({"puuid":"bot"}));
        value["gameConfig"]["customSpectators"] = json!([{"puuid":"viewer"}]);
        value["members"]
            .as_array_mut()
            .unwrap()
            .push(json!({"puuid":"viewer"}));
        let result = parse_participants(Some(&value), "self".into()).unwrap();
        assert_eq!(result.players.len(), 6);
        assert_eq!(result.completeness, RosterCompleteness::Complete);
        value["gameConfig"]["customSpectators"] = json!([{"puuid":"p0"}]);
        assert_ne!(
            parse_participants(Some(&value), "self".into())
                .unwrap()
                .completeness,
            RosterCompleteness::Complete
        );
    }
    #[test]
    fn aliases_use_explicit_pairs_and_do_not_merge_names() {
        let mut value = room(6);
        value["gameConfig"]["customTeam100"][0]
            .as_object_mut()
            .unwrap()
            .remove("puuid");
        let result = parse_participants(Some(&value), "self".into()).unwrap();
        assert_eq!(result.completeness, RosterCompleteness::Complete);
        assert!(result.players.iter().any(|p| p.id == "p0"));
        assert!(!result.players.iter().any(|p| p.id == "summoner-1"));
        value["members"]
            .as_array_mut()
            .unwrap()
            .push(json!({"puuid":"different","summonerId":1,"isBot":false}));
        assert_eq!(
            parse_participants(Some(&value), "self".into())
                .unwrap()
                .issue,
            Some(RosterIssue::ConflictingRoster)
        );
    }
    #[test]
    fn swapping_sides_does_not_change_the_roster() {
        let value = room(6);
        let mut moved = value.clone();
        moved["gameConfig"]["customTeam100"] = value["gameConfig"]["customTeam200"].clone();
        moved["gameConfig"]["customTeam200"] = value["gameConfig"]["customTeam100"].clone();
        let a = parse_participants(Some(&value), "self".into()).unwrap();
        let b = parse_participants(Some(&moved), "self".into()).unwrap();
        assert_eq!(a.completeness, b.completeness);
        assert_eq!(
            a.players.iter().map(|p| &p.id).collect::<Vec<_>>(),
            b.players.iter().map(|p| &p.id).collect::<Vec<_>>()
        );
    }
    #[test]
    fn duplicate_team_slots_and_malformed_arrays_fail_closed() {
        let mut value = room(6);
        value["gameConfig"]["customTeam200"][0] = value["gameConfig"]["customTeam100"][0].clone();
        assert_eq!(
            parse_participants(Some(&value), "self".into())
                .unwrap()
                .issue,
            Some(RosterIssue::ConflictingRoster)
        );
        value["members"] = json!({});
        assert!(parse_participants(Some(&value), "self".into()).is_err());
    }
}
