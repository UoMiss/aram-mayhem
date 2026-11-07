//! Optional, bounded display metadata. Never supplies a match's actual map ID.
use crate::lcu::error::LcuError;
use crate::lcu::{client::LcuHttpClient, discovery::LcuClient};
use async_trait::async_trait;
use serde::Serialize;
use serde_json::Value;
use std::{
    collections::HashMap,
    time::{Duration, Instant},
};
use tokio::sync::Mutex;

pub fn map_id(value: Option<&Value>) -> Option<i64> {
    value?
        .as_i64()
        .filter(|id| (1..=9_007_199_254_740_991).contains(id))
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GameMetadata {
    pub queue_id: Option<i64>,
    pub map_id: Option<i64>,
    pub queue_name: Option<String>,
    pub map_name: Option<String>,
}

#[derive(Clone, Copy, PartialEq, Eq, Hash)]
enum Resource {
    Queue,
    Map,
}

fn name(value: &Value, id: i64) -> Option<String> {
    if value.get("id").and_then(Value::as_i64) != Some(id) {
        return None;
    }
    value
        .get("name")?
        .as_str()
        .map(str::trim)
        .filter(|name| {
            !name.is_empty() && name.chars().count() <= 80 && !name.chars().any(char::is_control)
        })
        .map(str::to_owned)
}

#[async_trait]
trait MetadataSource: Send + Sync {
    async fn get(&self, path: &str) -> Result<Option<Value>, LcuError>;
}
struct HttpSource<'a> {
    http: &'a LcuHttpClient,
    client: &'a LcuClient,
}
#[async_trait]
impl MetadataSource for HttpSource<'_> {
    async fn get(&self, path: &str) -> Result<Option<Value>, LcuError> {
        self.http.get_json_optional(self.client, path).await
    }
}

#[derive(Default)]
struct Cache {
    scope: Option<(LcuClient, String, u64)>,
    entries: HashMap<(Resource, i64), (Instant, Option<String>)>,
}

impl Cache {
    fn set_scope(&mut self, client: &LcuClient, account: &str, generation: u64) {
        let scope = (client.clone(), account.to_owned(), generation);
        if self.scope.as_ref() != Some(&scope) {
            self.entries.clear();
            self.scope = Some(scope);
        }
    }
    async fn read(
        &mut self,
        source: &impl MetadataSource,
        kind: Resource,
        id: Option<i64>,
    ) -> Option<String> {
        let id = id.filter(|id| *id > 0)?;
        let key = (kind, id);
        if let Some((time, value)) = self.entries.get(&key) {
            let ttl = if value.is_some() { 300 } else { 30 };
            if time.elapsed() < Duration::from_secs(ttl) {
                return value.clone();
            }
        }
        let path = match kind {
            Resource::Queue => format!("/lol-game-queues/v1/queues/{id}"),
            Resource::Map => format!("/lol-maps/v1/map/{id}"),
        };
        // Optional names must never make a match, ranking or connection unavailable.
        let result = source
            .get(&path)
            .await
            .ok()
            .flatten()
            .and_then(|value| name(&value, id));
        if self.entries.len() >= 512 {
            self.entries.clear();
        }
        self.entries.insert(key, (Instant::now(), result.clone()));
        result
    }
}

#[derive(Default)]
pub struct MetadataCache(Mutex<Cache>);
impl MetadataCache {
    pub async fn load(
        &self,
        http: &LcuHttpClient,
        client: &LcuClient,
        account: &str,
        generation: u64,
        queue_id: Option<i64>,
        map_id: Option<i64>,
    ) -> GameMetadata {
        // This async lock deduplicates simultaneous requests across all three views.
        // It is independent of the connection and gameflow monitor locks.
        let mut cache = self.0.lock().await;
        cache.set_scope(client, account, generation);
        let source = HttpSource { http, client };
        let queue_name = cache.read(&source, Resource::Queue, queue_id).await;
        let map_name = cache.read(&source, Resource::Map, map_id).await;
        GameMetadata {
            queue_id,
            map_id,
            queue_name,
            map_name,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::lcu::discovery::LcuLockfile;
    use serde_json::json;
    struct FakeSource {
        calls: std::sync::atomic::AtomicUsize,
        response: Option<Value>,
        fail: bool,
    }
    #[async_trait]
    impl MetadataSource for FakeSource {
        async fn get(&self, path: &str) -> Result<Option<Value>, LcuError> {
            assert!(path == "/lol-maps/v1/map/12" || path == "/lol-game-queues/v1/queues/12");
            self.calls.fetch_add(1, std::sync::atomic::Ordering::SeqCst);
            if self.fail {
                Err(LcuError::new(
                    crate::lcu::error::LcuErrorCode::HttpStatus,
                    "Unavailable",
                ))
            } else {
                Ok(self.response.clone())
            }
        }
    }
    #[tokio::test]
    async fn unavailable_empty_and_malformed_names_are_cached_and_retry_after_expiry() {
        for (response, fail) in [
            (None, false),
            (None, true),
            (Some(json!({"id":11,"name":"wrong map"})), false),
            (Some(json!({"id":12,"name":"嚎哭深渊"})), false),
        ] {
            let source = FakeSource {
                calls: std::sync::atomic::AtomicUsize::new(0),
                response,
                fail,
            };
            let mut cache = Cache::default();
            let first = cache.read(&source, Resource::Map, Some(12)).await;
            assert_eq!(cache.read(&source, Resource::Map, Some(12)).await, first);
            assert_eq!(source.calls.load(std::sync::atomic::Ordering::SeqCst), 1);
            cache.entries.get_mut(&(Resource::Map, 12)).unwrap().0 =
                Instant::now() - Duration::from_secs(301);
            cache.read(&source, Resource::Map, Some(12)).await;
            assert_eq!(source.calls.load(std::sync::atomic::Ordering::SeqCst), 2);
            assert_eq!(cache.read(&source, Resource::Queue, Some(0)).await, None);
            assert_eq!(source.calls.load(std::sync::atomic::Ordering::SeqCst), 2);
        }
    }
    #[test]
    fn rejects_invalid_ids_and_names() {
        for value in [
            json!(0),
            json!(-1),
            json!("12"),
            json!(1.5),
            json!(9007199254740992_u64),
            Value::Null,
        ] {
            assert_eq!(map_id(Some(&value)), None);
        }
        assert_eq!(map_id(Some(&json!(12))), Some(12));
        assert_eq!(
            name(&json!({"id":12,"name":" 嚎哭深渊 "}), 12).as_deref(),
            Some("嚎哭深渊")
        );
        for value in [
            json!({"id":11,"name":"wrong"}),
            json!({"name":"missing id"}),
            json!({"id":12,"name":"\n"}),
            json!({"id":12,"name":"x".repeat(81)}),
            json!({"id":12,"name":"a\nb"}),
        ] {
            assert_eq!(name(&value, 12), None);
        }
    }
    #[test]
    fn isolates_resources_accounts_and_connections() {
        let client = LcuClient::from_lockfile(
            LcuLockfile::parse("LeagueClientUx:1:1234:test:https").unwrap(),
        )
        .unwrap();
        let mut cache = Cache::default();
        cache.set_scope(&client, "a", 1);
        cache.entries.insert(
            (Resource::Queue, 12),
            (Instant::now(), Some("queue".into())),
        );
        assert!(!cache.entries.contains_key(&(Resource::Map, 12)));
        cache.set_scope(&client, "a", 1);
        assert_eq!(cache.entries.len(), 1);
        cache.set_scope(&client, "b", 1);
        assert!(cache.entries.is_empty());
        cache
            .entries
            .insert((Resource::Map, 12), (Instant::now(), None));
        cache.set_scope(&client, "b", 2);
        assert!(cache.entries.is_empty());
    }
}
