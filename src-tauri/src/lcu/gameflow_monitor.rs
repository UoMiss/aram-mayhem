use crate::lcu::champ_select::parse_champion_select;
use crate::lcu::client::LcuHttpClient;
use crate::lcu::discovery::{LcuClient, discover};
use crate::lcu::error::{LcuError, LcuErrorCode};
use crate::lcu::gameflow::{
    ChampionSelectSnapshot, GameSessionContext, GameflowChanges, GameflowMachine, GameflowPhase,
    GameflowReading, GameflowSnapshot, GameflowTransport, LobbySnapshot,
};
#[cfg(windows)]
use crate::lcu::gameflow_events::GameflowEventSource;
use crate::lcu::gameflow_events::LcuWebSocketEventSource;
use crate::lcu::lobby::parse_lobby;
use crate::lcu::models::LcuSourceKind;
use async_trait::async_trait;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex, MutexGuard};
use std::time::Duration;
use tokio::sync::{mpsc, watch};
use tokio::task::JoinHandle;
use tokio::time::sleep;

pub const GAMEFLOW_UPDATED_EVENT: &str = "lcu://gameflow-updated";
pub const GAMEFLOW_LOBBY_EVENT: &str = "lcu://lobby-updated";
pub const GAMEFLOW_CHAMP_SELECT_EVENT: &str = "lcu://champ-select-updated";
pub const GAMEFLOW_SESSION_ENDED_EVENT: &str = "lcu://session-ended";

const PHASE_PATH: &str = "/lol-gameflow/v1/gameflow-phase";
const SESSION_PATH: &str = "/lol-gameflow/v1/session";
const LOBBY_PATH: &str = "/lol-lobby/v2/lobby";
const CHAMP_SELECT_PATH: &str = "/lol-champ-select/v1/session";

#[derive(Debug, Clone, Copy)]
pub struct GameflowConfig {
    pub websocket_poll_interval: Duration,
    pub fallback_poll_interval: Duration,
    pub retry_initial: Duration,
    pub retry_max: Duration,
}

impl Default for GameflowConfig {
    fn default() -> Self {
        Self {
            websocket_poll_interval: Duration::from_secs(5),
            fallback_poll_interval: Duration::from_millis(1500),
            retry_initial: Duration::from_millis(500),
            retry_max: Duration::from_secs(5),
        }
    }
}

#[async_trait]
pub trait GameflowSource: Send + Sync + 'static {
    async fn discover(&self) -> Result<Option<LcuClient>, LcuError>;
    async fn read(&self, client: &LcuClient) -> Result<GameflowReading, LcuError>;
    async fn listen(
        &self,
        client: &LcuClient,
        wake: mpsc::Sender<()>,
        cancel: watch::Receiver<bool>,
    ) -> Result<(), LcuError>;
}

#[derive(Debug, Clone)]
pub enum GameflowEvent {
    Updated(GameflowSnapshot),
    Lobby(Option<LobbySnapshot>),
    ChampionSelect(Option<ChampionSelectSnapshot>),
    SessionEnded(Option<GameSessionContext>),
}

pub type GameflowCallback = Arc<dyn Fn(GameflowEvent) + Send + Sync>;

struct MonitorHandle {
    cancel: watch::Sender<bool>,
    join: JoinHandle<()>,
    callback: GameflowCallback,
}

pub struct GameflowManager<S: GameflowSource> {
    source: Arc<S>,
    machine: Arc<Mutex<GameflowMachine>>,
    monitor: Arc<Mutex<Option<MonitorHandle>>>,
    generation: Arc<AtomicU64>,
    config: GameflowConfig,
    source_kind: LcuSourceKind,
}

impl<S: GameflowSource> GameflowManager<S> {
    pub fn new(source: Arc<S>, source_kind: LcuSourceKind, config: GameflowConfig) -> Self {
        Self {
            source,
            machine: Arc::new(Mutex::new(GameflowMachine::new(source_kind, false))),
            monitor: Arc::new(Mutex::new(None)),
            generation: Arc::new(AtomicU64::new(0)),
            config,
            source_kind,
        }
    }

    pub fn snapshot(&self) -> GameflowSnapshot {
        lock(&self.machine).snapshot()
    }

    pub fn start_monitoring(&self, callback: GameflowCallback) -> GameflowSnapshot {
        let mut monitor = lock(&self.monitor);
        if monitor.is_some() {
            return self.snapshot();
        }

        if self.source_kind == LcuSourceKind::Unavailable {
            let changes = lock(&self.machine).unsupported();
            drop(monitor);
            emit_changes(&changes, &callback);
            return self.snapshot();
        }

        let generation = self
            .generation
            .fetch_add(1, Ordering::SeqCst)
            .saturating_add(1);
        let (cancel, cancel_rx) = watch::channel(false);
        let source = Arc::clone(&self.source);
        let machine = Arc::clone(&self.machine);
        let callback_for_task = Arc::clone(&callback);
        let config = self.config;
        let generation_for_task = generation;
        let generation_ref = Arc::clone(&self.generation);
        let join = tokio::spawn(async move {
            run_gameflow_monitor(
                source,
                machine,
                generation_for_task,
                generation_ref,
                cancel_rx,
                config,
                callback_for_task,
            )
            .await;
        });
        *monitor = Some(MonitorHandle {
            cancel,
            join,
            callback,
        });
        drop(monitor);
        self.snapshot()
    }

    pub async fn stop_monitoring(&self) -> GameflowSnapshot {
        let (handle, stop_generation) = {
            let mut monitor = lock(&self.monitor);
            let Some(handle) = monitor.take() else {
                return self.snapshot();
            };
            let stop_generation = self
                .generation
                .fetch_add(1, Ordering::SeqCst)
                .saturating_add(1);
            (handle, stop_generation)
        };
        let _ = handle.cancel.send(true);
        let _ = handle.join.await;
        let changes = {
            let mut machine = lock(&self.machine);
            let current = self.generation.load(Ordering::SeqCst);
            if current == stop_generation {
                machine.disconnected("monitoring_stopped", "LCU gameflow monitoring stopped")
            } else {
                GameflowChanges {
                    previous: machine.snapshot(),
                    current: machine.snapshot(),
                    session_ended: None,
                }
            }
        };
        emit_changes(&changes, &handle.callback);
        self.snapshot()
    }

    pub fn shutdown(&self) {
        let handle = {
            let mut monitor = lock(&self.monitor);
            monitor.take()
        };
        if let Some(handle) = handle {
            self.generation.fetch_add(1, Ordering::SeqCst);
            let _ = handle.cancel.send(true);
            handle.join.abort();
        }
    }
}

fn lock<T>(mutex: &Mutex<T>) -> MutexGuard<'_, T> {
    mutex
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
}

fn emit_changes(changes: &GameflowChanges, callback: &GameflowCallback) {
    if changes.current == changes.previous {
        return;
    }
    callback(GameflowEvent::Updated(changes.current.clone()));

    let previous_lobby = changes
        .previous
        .session
        .as_ref()
        .and_then(|session| session.lobby.clone());
    let current_lobby = changes
        .current
        .session
        .as_ref()
        .and_then(|session| session.lobby.clone());
    if previous_lobby != current_lobby {
        callback(GameflowEvent::Lobby(current_lobby));
    }

    let previous_champ = changes
        .previous
        .session
        .as_ref()
        .and_then(|session| session.champion_select.clone());
    let current_champ = changes
        .current
        .session
        .as_ref()
        .and_then(|session| session.champion_select.clone());
    if previous_champ != current_champ {
        callback(GameflowEvent::ChampionSelect(current_champ));
    }

    if let Some(ended) = &changes.session_ended {
        callback(GameflowEvent::SessionEnded(Some(ended.clone())));
    }
}

async fn run_gameflow_monitor<S: GameflowSource>(
    source: Arc<S>,
    machine: Arc<Mutex<GameflowMachine>>,
    generation: u64,
    generation_ref: Arc<AtomicU64>,
    mut cancel: watch::Receiver<bool>,
    config: GameflowConfig,
    callback: GameflowCallback,
) {
    let (wake_tx, mut wake_rx) = mpsc::channel(1);
    let mut websocket: Option<JoinHandle<()>> = None;
    let mut websocket_fingerprint: Option<String> = None;
    let mut session_generation: u64 = 0;
    let mut websocket_retry = config.retry_initial;
    let mut websocket_retry_at = tokio::time::Instant::now();
    let mut retry = config.retry_initial;
    let is_current = || generation_ref.load(Ordering::SeqCst) == generation;

    loop {
        if *cancel.borrow() || !is_current() {
            break;
        }

        let discovery = tokio::select! {
            _ = cancel.changed() => break,
            result = source.discover() => result,
        };

        if *cancel.borrow() || !is_current() {
            break;
        }

        match discovery {
            Ok(Some(client)) => {
                let fingerprint = client.fingerprint();
                if websocket_fingerprint.as_deref() != Some(fingerprint.as_str()) {
                    if let Some(handle) = websocket.take() {
                        handle.abort();
                    }
                    websocket_fingerprint = Some(fingerprint.clone());
                    session_generation = session_generation.saturating_add(1);
                    websocket_retry = config.retry_initial;
                    websocket_retry_at = tokio::time::Instant::now();
                }
                if websocket
                    .as_ref()
                    .is_some_and(|handle| handle.is_finished())
                {
                    websocket.take();
                    websocket_retry_at = tokio::time::Instant::now() + websocket_retry;
                    websocket_retry = (websocket_retry * 2).min(config.retry_max);
                }
                if websocket.is_none() && tokio::time::Instant::now() >= websocket_retry_at {
                    let source_for_ws = Arc::clone(&source);
                    let client_for_ws = client.clone();
                    let wake_for_ws = wake_tx.clone();
                    let cancel_for_ws = cancel.clone();
                    websocket = Some(tokio::spawn(async move {
                        let _ = source_for_ws
                            .listen(&client_for_ws, wake_for_ws, cancel_for_ws)
                            .await;
                    }));
                }

                let reading = tokio::select! {
                    _ = cancel.changed() => break,
                    result = source.read(&client) => result,
                };
                if *cancel.borrow() || !is_current() {
                    break;
                }
                match reading {
                    Ok(reading) => {
                        let ws_active = websocket
                            .as_ref()
                            .is_some_and(|handle| !handle.is_finished());
                        let transport = if ws_active {
                            GameflowTransport::Websocket
                        } else {
                            GameflowTransport::Polling
                        };
                        let changes =
                            lock(&machine).observe(session_generation, reading, transport);
                        emit_changes(&changes, &callback);
                        retry = config.retry_initial;
                    }
                    Err(error) if error.is_unsupported() => {
                        let changes = lock(&machine).unsupported();
                        emit_changes(&changes, &callback);
                        break;
                    }
                    Err(error) => {
                        let changes =
                            lock(&machine).disconnected(error.code, "LCU gameflow read failed");
                        emit_changes(&changes, &callback);
                    }
                }
            }
            Ok(None) => {
                if let Some(handle) = websocket.take() {
                    handle.abort();
                }
                websocket_fingerprint = None;
                session_generation = session_generation.saturating_add(1);
                let changes =
                    lock(&machine).disconnected("client_not_found", "League client is not running");
                emit_changes(&changes, &callback);
            }
            Err(error) if error.is_unsupported() => {
                let changes = lock(&machine).unsupported();
                emit_changes(&changes, &callback);
                break;
            }
            Err(error) => {
                let changes =
                    lock(&machine).disconnected(error.code, "LCU gameflow discovery failed");
                emit_changes(&changes, &callback);
            }
        }

        if *cancel.borrow() {
            break;
        }

        let ws_active = websocket
            .as_ref()
            .is_some_and(|handle| !handle.is_finished());
        let delay = if ws_active {
            config.websocket_poll_interval
        } else {
            config.fallback_poll_interval.max(retry)
        };
        tokio::select! {
            _ = cancel.changed() => break,
            _ = sleep(delay) => {}
            _ = wake_rx.recv() => {}
        }
        retry = (retry * 2).min(config.retry_max);
    }

    if let Some(handle) = websocket.take() {
        handle.abort();
    }
}

pub struct SystemGameflowSource {
    http: Option<LcuHttpClient>,
    #[cfg_attr(not(windows), allow(dead_code))]
    events: LcuWebSocketEventSource,
}

impl SystemGameflowSource {
    pub fn new() -> Self {
        Self {
            http: LcuHttpClient::new().ok(),
            events: LcuWebSocketEventSource,
        }
    }
}

impl Default for SystemGameflowSource {
    fn default() -> Self {
        Self::new()
    }
}

#[async_trait]
impl GameflowSource for SystemGameflowSource {
    async fn discover(&self) -> Result<Option<LcuClient>, LcuError> {
        discover()
    }

    async fn read(&self, client: &LcuClient) -> Result<GameflowReading, LcuError> {
        let http = self
            .http
            .as_ref()
            .ok_or_else(|| LcuError::internal("LCU HTTP client is unavailable"))?;
        let phase_value = http.get_json(client, PHASE_PATH).await?;
        let raw_phase = phase_value.as_str().ok_or_else(|| {
            LcuError::new(
                LcuErrorCode::InvalidResponse,
                "LCU gameflow phase is not a string",
            )
        })?;
        let phase = GameflowPhase::parse(raw_phase);

        let mut lobby = None;
        let mut champion_select = None;
        let mut game_id = None;

        if matches!(phase, GameflowPhase::Lobby) {
            if let Some(value) = http.get_json_optional(client, LOBBY_PATH).await? {
                lobby = Some(parse_lobby(&value)?);
            }
        } else if matches!(phase, GameflowPhase::ChampSelect) {
            if let Some(value) = http.get_json_optional(client, CHAMP_SELECT_PATH).await? {
                let snapshot = parse_champion_select(&value)?;
                game_id = snapshot.game_id.clone();
                champion_select = Some(snapshot);
            }
        }

        if game_id.is_none()
            && matches!(
                phase,
                GameflowPhase::GameStart
                    | GameflowPhase::InProgress
                    | GameflowPhase::Reconnect
                    | GameflowPhase::WaitingForStats
                    | GameflowPhase::PreEndOfGame
                    | GameflowPhase::EndOfGame
            )
        {
            if let Some(value) = http.get_json_optional(client, SESSION_PATH).await? {
                game_id = extract_game_id(&value);
            }
        }

        Ok(GameflowReading {
            raw_phase: raw_phase.to_string(),
            phase,
            lobby,
            champion_select,
            game_id,
        })
    }

    async fn listen(
        &self,
        client: &LcuClient,
        wake: mpsc::Sender<()>,
        cancel: watch::Receiver<bool>,
    ) -> Result<(), LcuError> {
        #[cfg(windows)]
        {
            self.events.listen(client, wake, cancel).await
        }
        #[cfg(not(windows))]
        {
            let _ = (client, wake, cancel);
            Err(LcuError::unsupported_platform())
        }
    }
}

fn extract_game_id(value: &serde_json::Value) -> Option<String> {
    value
        .pointer("/gameData/gameId")
        .and_then(value_as_string)
        .or_else(|| value.get("gameId").and_then(value_as_string))
}

fn value_as_string(value: &serde_json::Value) -> Option<String> {
    value
        .as_str()
        .map(str::to_string)
        .or_else(|| value.as_i64().map(|number| number.to_string()))
        .or_else(|| value.as_u64().map(|number| number.to_string()))
}

pub type SystemGameflowManager = GameflowManager<SystemGameflowSource>;

impl SystemGameflowManager {
    pub fn system() -> Self {
        let source = Arc::new(SystemGameflowSource::new());
        let source_kind = if cfg!(windows) {
            LcuSourceKind::Real
        } else {
            LcuSourceKind::Unavailable
        };
        Self::new(source, source_kind, GameflowConfig::default())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::lcu::discovery::LcuLockfile;
    use crate::lcu::gameflow::{ChampionSelectSnapshot, LobbySnapshot};
    use crate::lcu::gameflow_events::GameflowEventSource;
    use std::collections::VecDeque;

    struct FakeGameflowSource {
        discoveries: Mutex<VecDeque<Result<Option<LcuClient>, LcuError>>>,
        readings: Mutex<VecDeque<Result<GameflowReading, LcuError>>>,
    }

    impl FakeGameflowSource {
        fn new(
            discoveries: Vec<Result<Option<LcuClient>, LcuError>>,
            readings: Vec<Result<GameflowReading, LcuError>>,
        ) -> Self {
            Self {
                discoveries: Mutex::new(discoveries.into()),
                readings: Mutex::new(readings.into()),
            }
        }
    }

    #[async_trait]
    impl GameflowSource for FakeGameflowSource {
        async fn discover(&self) -> Result<Option<LcuClient>, LcuError> {
            let mut queue = lock(&self.discoveries);
            queue.pop_front().unwrap_or(Ok(None))
        }

        async fn read(&self, _client: &LcuClient) -> Result<GameflowReading, LcuError> {
            let mut queue = lock(&self.readings);
            queue
                .pop_front()
                .unwrap_or(Err(LcuError::internal("no scripted reading")))
        }

        async fn listen(
            &self,
            _client: &LcuClient,
            _wake: mpsc::Sender<()>,
            _cancel: watch::Receiver<bool>,
        ) -> Result<(), LcuError> {
            Ok(())
        }
    }

    fn config() -> GameflowConfig {
        GameflowConfig {
            websocket_poll_interval: Duration::from_millis(20),
            fallback_poll_interval: Duration::from_millis(20),
            retry_initial: Duration::from_millis(10),
            retry_max: Duration::from_millis(40),
        }
    }

    fn client(port: u16) -> LcuClient {
        LcuClient::from_lockfile(
            LcuLockfile::parse(&format!("LeagueClientUx:4242:{port}:pw:https")).expect("lockfile"),
        )
        .expect("client")
    }

    fn reading(phase: GameflowPhase, raw: &str) -> GameflowReading {
        GameflowReading {
            raw_phase: raw.to_string(),
            phase,
            lobby: None,
            champion_select: None,
            game_id: None,
        }
    }

    fn callback(tx: mpsc::UnboundedSender<GameflowEvent>) -> GameflowCallback {
        Arc::new(move |event| {
            let _ = tx.send(event);
        })
    }

    async fn next_updated(rx: &mut mpsc::UnboundedReceiver<GameflowEvent>) -> GameflowSnapshot {
        tokio::time::timeout(Duration::from_secs(2), async {
            loop {
                if let GameflowEvent::Updated(snapshot) = rx.recv().await.expect("event") {
                    return snapshot;
                }
            }
        })
        .await
        .expect("timed out waiting for gameflow")
    }

    #[test]
    fn source_is_explicitly_unavailable_outside_windows() {
        if cfg!(not(windows)) {
            let source = LcuWebSocketEventSource;
            let client = client(51000);
            let (wake, _rx) = mpsc::channel(1);
            let (_cancel_tx, cancel_rx) = watch::channel(false);
            let result = tokio::runtime::Runtime::new()
                .unwrap()
                .block_on(async { source.listen(&client, wake, cancel_rx).await });
            assert!(matches!(result, Err(error) if error.is_unsupported()));
        }
    }

    #[tokio::test]
    async fn gameflow_manager_publishes_phase_and_session_revision() {
        let source = FakeGameflowSource::new(
            vec![Ok(Some(client(51001))), Ok(Some(client(51001)))],
            vec![
                Ok(reading(GameflowPhase::Lobby, "Lobby")),
                Ok(reading(GameflowPhase::ChampSelect, "ChampSelect")),
            ],
        );
        let manager = GameflowManager::new(Arc::new(source), LcuSourceKind::Real, config());
        let (tx, mut rx) = mpsc::unbounded_channel();
        manager.start_monitoring(callback(tx));
        let first = next_updated(&mut rx).await;
        assert_eq!(first.phase, Some(GameflowPhase::Lobby));
        let second = next_updated(&mut rx).await;
        assert_eq!(second.phase, Some(GameflowPhase::ChampSelect));
        assert!(second.revision > first.revision);
        manager.stop_monitoring().await;
    }

    #[tokio::test]
    async fn disconnected_client_does_not_become_an_actual_none_phase() {
        let source = FakeGameflowSource::new(vec![Ok(None)], vec![]);
        let manager = GameflowManager::new(Arc::new(source), LcuSourceKind::Real, config());
        let (tx, mut rx) = mpsc::unbounded_channel();
        manager.start_monitoring(callback(tx));
        let snapshot = next_updated(&mut rx).await;
        assert!(!snapshot.connected);
        assert!(snapshot.phase.is_none());
        assert!(snapshot.session.is_none());
        manager.stop_monitoring().await;
    }

    #[tokio::test]
    async fn lobby_and_champ_snapshots_are_emitted_without_raw_json() {
        let lobby = LobbySnapshot {
            lobby_id: Some("lobby-1".to_string()),
            queue_id: Some(450),
            game_mode: Some("ARAM".to_string()),
            member_count: Some(5),
            updated_at: 1,
        };
        let champ = ChampionSelectSnapshot {
            game_id: Some("99".to_string()),
            my_team: vec![],
            their_team: vec![],
            local_player_cell_id: None,
            complete: false,
            updated_at: 1,
        };
        let source = FakeGameflowSource::new(
            vec![Ok(Some(client(51002))), Ok(Some(client(51002)))],
            vec![
                Ok(GameflowReading {
                    raw_phase: "Lobby".to_string(),
                    phase: GameflowPhase::Lobby,
                    lobby: Some(lobby),
                    champion_select: None,
                    game_id: None,
                }),
                Ok(GameflowReading {
                    raw_phase: "ChampSelect".to_string(),
                    phase: GameflowPhase::ChampSelect,
                    lobby: None,
                    champion_select: Some(champ),
                    game_id: Some("99".to_string()),
                }),
            ],
        );
        let manager = GameflowManager::new(Arc::new(source), LcuSourceKind::Real, config());
        let (tx, mut rx) = mpsc::unbounded_channel();
        manager.start_monitoring(callback(tx));
        let first = next_updated(&mut rx).await;
        assert_eq!(first.session.unwrap().lobby.unwrap().member_count, Some(5));
        let second = next_updated(&mut rx).await;
        let session = second.session.unwrap();
        assert!(!session.snapshot_complete);
        assert!(session.champion_select.unwrap().my_team.is_empty());
        manager.stop_monitoring().await;
    }

    #[test]
    fn unsupported_manager_does_not_spawn_tasks() {
        let source = FakeGameflowSource::new(vec![], vec![]);
        let manager = GameflowManager::new(Arc::new(source), LcuSourceKind::Unavailable, config());
        let (tx, _rx) = mpsc::unbounded_channel();
        let snapshot = manager.start_monitoring(callback(tx));
        assert!(!snapshot.connected);
        assert_eq!(snapshot.source, LcuSourceKind::Unavailable);
    }

    struct ReconnectingSource {
        attempts: std::sync::atomic::AtomicUsize,
    }

    #[async_trait]
    impl GameflowSource for ReconnectingSource {
        async fn discover(&self) -> Result<Option<LcuClient>, LcuError> {
            Ok(Some(client(51003)))
        }

        async fn read(&self, _client: &LcuClient) -> Result<GameflowReading, LcuError> {
            Ok(reading(GameflowPhase::InProgress, "InProgress"))
        }

        async fn listen(
            &self,
            _client: &LcuClient,
            _wake: mpsc::Sender<()>,
            mut cancel: watch::Receiver<bool>,
        ) -> Result<(), LcuError> {
            if self.attempts.fetch_add(1, Ordering::SeqCst) == 0 {
                return Err(LcuError::internal("temporary socket failure"));
            }
            let _ = cancel.changed().await;
            Ok(())
        }
    }

    #[tokio::test]
    async fn websocket_recovers_for_same_client_without_replacing_session() {
        let source = Arc::new(ReconnectingSource {
            attempts: std::sync::atomic::AtomicUsize::new(0),
        });
        let manager = GameflowManager::new(Arc::clone(&source), LcuSourceKind::Real, config());
        let (tx, mut rx) = mpsc::unbounded_channel();
        manager.start_monitoring(callback(tx));
        let first = next_updated(&mut rx).await;
        let first_key = first.session.unwrap().session_key;
        let mut saw_polling = first.transport == GameflowTransport::Polling;
        tokio::time::timeout(Duration::from_secs(2), async {
            loop {
                let snapshot = next_updated(&mut rx).await;
                assert_eq!(snapshot.session.unwrap().session_key, first_key);
                saw_polling |= snapshot.transport == GameflowTransport::Polling;
                if source.attempts.load(Ordering::SeqCst) >= 2
                    && snapshot.transport == GameflowTransport::Websocket
                {
                    break;
                }
            }
        })
        .await
        .expect("socket did not recover");
        assert!(saw_polling);
        manager.stop_monitoring().await;
        assert!(!manager.snapshot().connected);
    }
}
