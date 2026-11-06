use crate::lcu::error::{LcuError, LcuErrorCode};
use crate::lcu::history::{HistorySource, profile_identity};
use crate::lcu::models::now_ms;
use serde::Serialize;
use serde_json::Value;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HomeSnapshot {
    pub account_key: String,
    pub display_name: Option<String>,
    pub summoner_level: Option<u32>,
    pub updated_at: u64,
}

fn text<'a>(value: &'a Value, key: &str) -> Option<&'a str> {
    value
        .get(key)
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|text| !text.is_empty() && text.chars().count() <= 128)
}

fn parse_profile(profile: &Value) -> Result<HomeSnapshot, LcuError> {
    let account_key = profile_identity(profile)?.to_string();
    let display_name = text(profile, "gameName")
        .map(|name| {
            text(profile, "tagLine").map_or_else(|| name.to_string(), |tag| format!("{name}#{tag}"))
        })
        .or_else(|| text(profile, "displayName").map(str::to_string));
    Ok(HomeSnapshot {
        account_key,
        display_name,
        summoner_level: profile
            .get("summonerLevel")
            .and_then(Value::as_u64)
            .and_then(|level| u32::try_from(level).ok())
            .filter(|level| *level > 0),
        updated_at: now_ms(),
    })
}

/// Reuse the authenticated current-account reader; never request match history here.
pub async fn load_home(source: &impl HistorySource) -> Result<HomeSnapshot, LcuError> {
    let before = source.profile().await?;
    let identity = profile_identity(&before)?;
    let after = source.profile().await?;
    if identity != profile_identity(&after)? {
        return Err(LcuError::new(
            LcuErrorCode::AccountChanged,
            "Account changed during home query",
        ));
    }
    parse_profile(&after)
}

#[cfg(test)]
mod tests {
    use super::*;
    use async_trait::async_trait;
    use serde_json::json;
    use std::collections::{HashMap, VecDeque};
    use std::sync::Mutex;

    struct Source(Mutex<VecDeque<Value>>);
    #[async_trait]
    impl HistorySource for Source {
        async fn profile(&self) -> Result<Value, LcuError> {
            Ok(self.0.lock().unwrap().pop_front().unwrap())
        }
        async fn matches(&self, _: &str, _: u32) -> Result<Value, LcuError> {
            panic!("home must not query matches")
        }
        async fn champion_names(&self) -> HashMap<u32, String> {
            panic!("home must not query champions")
        }
    }
    #[test]
    fn prefers_riot_id_and_keeps_missing_fields_unknown() {
        let profile = parse_profile(&json!({"puuid":"account-1","gameName":" 玩家 ","tagLine":" CN1 ","displayName":"legacy","summonerLevel":321})).unwrap();
        assert_eq!(profile.display_name.as_deref(), Some("玩家#CN1"));
        assert_eq!(profile.summoner_level, Some(321));
        let profile = parse_profile(
            &json!({"puuid":"account-1","displayName":" Legacy ","summonerLevel":-1}),
        )
        .unwrap();
        assert_eq!(profile.display_name.as_deref(), Some("Legacy"));
        assert!(profile.summoner_level.is_none());
        assert!(
            parse_profile(&json!({"puuid":"account-1"}))
                .unwrap()
                .display_name
                .is_none()
        );
    }
    #[test]
    fn rejects_missing_or_invalid_identity() {
        for value in [json!({}), json!({"puuid":"../bad"}), json!([])] {
            assert!(parse_profile(&value).is_err());
        }
    }
    #[tokio::test]
    async fn checks_identity_twice_without_loading_other_resources() {
        let source = Source(Mutex::new(VecDeque::from([
            json!({"puuid":"one","gameName":"Old"}),
            json!({"puuid":"one","gameName":"New"}),
        ])));
        assert_eq!(
            load_home(&source).await.unwrap().display_name.as_deref(),
            Some("New")
        );
        let changed = Source(Mutex::new(VecDeque::from([
            json!({"puuid":"one"}),
            json!({"puuid":"two"}),
        ])));
        assert!(load_home(&changed).await.is_err());
    }
}
