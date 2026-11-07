use crate::lcu::{
    client::LcuHttpClient,
    discovery::discover,
    error::{LcuError, LcuErrorCode},
    gameflow_monitor::SystemGameflowManager,
    history::profile_identity,
    metadata::{GameMetadata, MetadataCache},
};
use tauri::State;

#[tauri::command]
pub async fn lcu_get_game_metadata(
    window: tauri::WebviewWindow,
    cache: State<'_, MetadataCache>,
    flow: State<'_, SystemGameflowManager>,
    account_key: String,
    queue_id: Option<i64>,
    map_id: Option<i64>,
) -> Result<GameMetadata, LcuError> {
    if window.label() != "main"
        || queue_id.is_some_and(|id| !(0..=i64::from(i32::MAX)).contains(&id))
        || map_id.is_some_and(|id| !(1..=9_007_199_254_740_991).contains(&id))
        || account_key.is_empty()
        || account_key.len() > 128
    {
        return Err(LcuError::new(
            LcuErrorCode::InvalidResponse,
            "Invalid metadata request",
        ));
    }
    let client = discover()?
        .ok_or_else(|| LcuError::new(LcuErrorCode::ConnectionRefused, "Client unavailable"))?;
    let http = LcuHttpClient::new()?;
    let profile = http
        .get_json(&client, "/lol-summoner/v1/current-summoner")
        .await?;
    if profile_identity(&profile)? != account_key {
        return Err(LcuError::new(
            LcuErrorCode::AccountChanged,
            "Account changed",
        ));
    }
    let generation = flow
        .snapshot()
        .session
        .map(|s| s.connection_generation)
        .unwrap_or(0);
    let result = cache
        .load(&http, &client, &account_key, generation, queue_id, map_id)
        .await;
    let current = http
        .get_json(&client, "/lol-summoner/v1/current-summoner")
        .await?;
    if profile_identity(&current)? != account_key
        || discover()?.as_ref() != Some(&client)
        || flow
            .snapshot()
            .session
            .map(|s| s.connection_generation)
            .unwrap_or(0)
            != generation
    {
        return Err(LcuError::new(
            LcuErrorCode::AccountChanged,
            "Metadata context changed",
        ));
    }
    Ok(result)
}
