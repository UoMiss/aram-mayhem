use crate::lcu::auto_accept::{
    AcceptOutcome, AutoAcceptControl, AutoAcceptRound, ReadyCheckSource, ReadyCheckStatus,
    accept_pending, read_ready_status,
};
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
    async fn account(&self, client: &LcuClient) -> Result<String, LcuError>;
    async fn read(&self, client: &LcuClient) -> Result<GameflowReading, LcuError>;
    async fn ready_status(
        &self,
        _client: &LcuClient,
        _account: &str,
    ) -> Result<Option<ReadyCheckStatus>, LcuError> {
        Ok(None)
    }
    async fn auto_accept(
        &self,
        _client: &LcuClient,
        _account: &str,
        _control: &AutoAcceptControl,
        _token: u64,
    ) -> Result<AcceptOutcome, LcuError> {
        Ok(AcceptOutcome::Unavailable)
    }
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

struct MonitorControls {
    generation: Arc<AtomicU64>,
    auto_accept: Arc<AutoAcceptControl>,
}

pub struct GameflowManager<S: GameflowSource> {
    source: Arc<S>,
    machine: Arc<Mutex<GameflowMachine>>,
    monitor: Arc<Mutex<Option<MonitorHandle>>>,
    generation: Arc<AtomicU64>,
    auto_accept: Arc<AutoAcceptControl>,
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
            auto_accept: Arc::new(AutoAcceptControl::default()),
            config,
            source_kind,
        }
    }

    pub fn set_auto_accept(&self, enabled: bool) {
        self.auto_accept.set_enabled(enabled);
    }

    pub fn snapshot(&self) -> GameflowSnapshot {
        lock(&self.machine).snapshot()
    }

    pub fn install_blocked(&self) -> bool {
        lock(&self.machine).install_blocked()
    }

    fn advance_generation(&self) -> u64 {
        // Serialize monitor replacement with sample application, including installation safety.
        let mut machine = lock(&self.machine);
        machine.invalidate_install_safety();
        self.generation
            .fetch_add(1, Ordering::SeqCst)
            .saturating_add(1)
    }

    pub fn roster_context(&self) -> (GameflowSnapshot, Option<String>) {
        let machine = lock(&self.machine);
        (machine.snapshot(), machine.account_key())
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

        let generation = self.advance_generation();
        let (cancel, cancel_rx) = watch::channel(false);
        let source = Arc::clone(&self.source);
        let machine = Arc::clone(&self.machine);
        let callback_for_task = Arc::clone(&callback);
        let config = self.config;
        let generation_for_task = generation;
        let controls = MonitorControls {
            generation: Arc::clone(&self.generation),
            auto_accept: Arc::clone(&self.auto_accept),
        };
        let join = tokio::spawn(async move {
            run_gameflow_monitor(
                source,
                machine,
                generation_for_task,
                controls,
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
            let stop_generation = self.advance_generation();
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
            self.advance_generation();
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

fn current_machine<'a>(
    machine: &'a Mutex<GameflowMachine>,
    generation: &AtomicU64,
    expected: u64,
) -> Option<MutexGuard<'a, GameflowMachine>> {
    let state = lock(machine);
    (generation.load(Ordering::SeqCst) == expected).then_some(state)
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
    controls: MonitorControls,
    mut cancel: watch::Receiver<bool>,
    config: GameflowConfig,
    callback: GameflowCallback,
) {
    let (wake_tx, mut wake_rx) = mpsc::channel(1);
    let mut accept_round = AutoAcceptRound::default();
    let mut websocket: Option<JoinHandle<()>> = None;
    let mut websocket_fingerprint: Option<String> = None;
    let mut session_generation: u64 = 0;
    let mut active_account: Option<String> = None;
    let mut websocket_retry = config.retry_initial;
    let mut websocket_retry_at = tokio::time::Instant::now();
    let mut retry = config.retry_initial;
    let is_current = || controls.generation.load(Ordering::SeqCst) == generation;

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
                    if websocket_fingerprint.is_some() {
                        let changes = lock(&machine).account_invalidated();
                        emit_changes(&changes, &callback);
                    }
                    if let Some(handle) = websocket.take() {
                        handle.abort();
                    }
                    websocket_fingerprint = Some(fingerprint.clone());
                    active_account = None;
                    accept_round = AutoAcceptRound::default();
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
                    result = async {
                        let account = source.account(&client).await?;
                        if !is_current() {
                            return Err(LcuError::new(LcuErrorCode::Cancelled, "Monitor replaced"));
                        }
                        if active_account.as_ref().is_some_and(|old| old != &account) {
                            session_generation = session_generation.saturating_add(1);
                            let changes = lock(&machine).account_invalidated();
                            emit_changes(&changes, &callback);
                        }
                        active_account = Some(account.clone());
                        read_for_account(source.as_ref(), &client, &account).await
                    } => result,
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
                        let phase = reading.phase.clone();
                        let changes = {
                            // Recheck under the same lock used to replace a monitor. Only current
                            // trusted reads may release the native installation interlock.
                            let Some(mut state) =
                                current_machine(&machine, &controls.generation, generation)
                            else {
                                break;
                            };
                            let changes = state.observe(session_generation, reading, transport);
                            state.set_account_key(active_account.clone());
                            changes
                        };
                        emit_changes(&changes, &callback);
                        let mut accept_token = active_account.as_deref().and_then(|account| {
                            accept_round.begin(
                                &phase,
                                session_generation,
                                account,
                                &controls.auto_accept,
                            )
                        });
                        if phase == GameflowPhase::ReadyCheck
                            && let Some(account) = active_account.as_deref()
                        {
                            let observed = tokio::select! {
                                _ = cancel.changed() => break,
                                result = tokio::time::timeout(Duration::from_secs(3), source.ready_status(&client, account)) => result.ok().and_then(Result::ok).flatten(),
                            };
                            if matches!(
                                observed,
                                Some(ReadyCheckStatus::Accepted | ReadyCheckStatus::Declined)
                            ) {
                                accept_round.complete(&Ok(AcceptOutcome::AlreadyAnswered));
                                accept_token = None;
                            }
                            let mut state = lock(&machine);
                            let display = match (observed, state.snapshot().ready_check_status) {
                                (
                                    Some(ReadyCheckStatus::Waiting),
                                    Some(
                                        old @ (ReadyCheckStatus::Accepting
                                        | ReadyCheckStatus::Failed),
                                    ),
                                ) if controls.auto_accept.token().is_some() => Some(old),
                                (value, _) => value,
                            };
                            let changes = state.set_ready_check_status(display);
                            drop(state);
                            emit_changes(&changes, &callback);
                        }
                        if let Some(account) = active_account.as_deref()
                            && let Some(token) = accept_token
                        {
                            let changes = lock(&machine)
                                .set_ready_check_status(Some(ReadyCheckStatus::Accepting));
                            emit_changes(&changes, &callback);
                            let outcome = tokio::select! {
                                _ = cancel.changed() => break,
                                result = tokio::time::timeout(Duration::from_secs(3), source.auto_accept(&client, account, &controls.auto_accept, token)) => {
                                    result.unwrap_or_else(|_| Err(LcuError::new(LcuErrorCode::Timeout,"Ready-check acceptance timed out")))
                                },
                            };
                            accept_round.complete(&outcome);
                            let display = match outcome {
                                Ok(AcceptOutcome::Submitted) => Some(ReadyCheckStatus::Accepting),
                                Err(_) if controls.auto_accept.is_current(token) => {
                                    Some(ReadyCheckStatus::Failed)
                                }
                                _ => None,
                            };
                            let changes = lock(&machine).set_ready_check_status(display);
                            emit_changes(&changes, &callback);
                            // Re-read playerResponse; a successful POST alone is not confirmation.
                            let _ = wake_tx.try_send(());
                        }
                        retry = config.retry_initial;
                    }
                    // A phase change during an HTTP read invalidates only that sample.
                    Err(error) if error.code == LcuErrorCode::Cancelled.as_str() => {}
                    Err(error)
                        if matches!(error.code.as_str(), "account_changed" | "not_logged_in") =>
                    {
                        active_account = None;
                        accept_round = AutoAcceptRound::default();
                        session_generation = session_generation.saturating_add(1);
                        let changes = lock(&machine).account_invalidated();
                        emit_changes(&changes, &callback);
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
                active_account = None;
                accept_round = AutoAcceptRound::default();
                session_generation = session_generation.saturating_add(1);
                let changes = {
                    let Some(mut state) =
                        current_machine(&machine, &controls.generation, generation)
                    else {
                        break;
                    };
                    state.client_not_found()
                };
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

// Check identity even when the phase sample was cancelled. An account change
// must clear the old context instead of being treated as a harmless phase race.
async fn read_for_account(
    source: &impl GameflowSource,
    client: &LcuClient,
    account: &str,
) -> Result<GameflowReading, LcuError> {
    let reading = source.read(client).await;
    if source.account(client).await? != account {
        return Err(LcuError::new(
            LcuErrorCode::AccountChanged,
            "Account changed during gameflow read",
        ));
    }
    reading
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
    async fn ready_status(
        &self,
        client: &LcuClient,
        account: &str,
    ) -> Result<Option<ReadyCheckStatus>, LcuError> {
        read_ready_status(self, client, account).await
    }
    async fn auto_accept(
        &self,
        client: &LcuClient,
        account: &str,
        control: &AutoAcceptControl,
        token: u64,
    ) -> Result<AcceptOutcome, LcuError> {
        accept_pending(self, client, account, control, token).await
    }

    async fn account(&self, client: &LcuClient) -> Result<String, LcuError> {
        let http = self
            .http
            .as_ref()
            .ok_or_else(|| LcuError::internal("LCU HTTP client unavailable"))?;
        let profile = http
            .get_json_optional(client, "/lol-summoner/v1/current-summoner")
            .await?
            .ok_or_else(|| LcuError::new(LcuErrorCode::NotLoggedIn, "No current account"))?;
        crate::lcu::history::profile_identity(&profile).map(str::to_owned)
    }

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
        } else if matches!(phase, GameflowPhase::ChampSelect)
            && let Some(value) = http.get_json_optional(client, CHAMP_SELECT_PATH).await?
        {
            let snapshot = parse_champion_select(&value)?;
            game_id = snapshot
                .game_id
                .as_deref()
                .filter(|id| id.parse::<u64>().is_ok_and(|number| number > 0))
                .map(str::to_owned);
            champion_select = Some(snapshot);
        }

        let mut game = None;
        if matches!(
            phase,
            GameflowPhase::ChampSelect
                | GameflowPhase::GameStart
                | GameflowPhase::InProgress
                | GameflowPhase::Reconnect
                | GameflowPhase::WaitingForStats
                | GameflowPhase::PreEndOfGame
                | GameflowPhase::EndOfGame
        ) && let Ok(Some(value)) = http.get_json_optional(client, SESSION_PATH).await
            && value
                .get("phase")
                .and_then(|value| value.as_str())
                .is_none_or(|value| value == raw_phase)
        {
            game_id = game_id.or_else(|| extract_game_id(&value));
            game = extract_game_metadata(&value);
        }

        if http.get_json(client, PHASE_PATH).await?.as_str() != Some(raw_phase) {
            return Err(LcuError::new(
                LcuErrorCode::Cancelled,
                "Gameflow phase changed during read",
            ));
        }

        Ok(GameflowReading {
            raw_phase: raw_phase.to_string(),
            phase,
            lobby,
            champion_select,
            game_id,
            game,
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

#[async_trait]
impl ReadyCheckSource for SystemGameflowSource {
    async fn ready_check(&self, client: &LcuClient) -> Result<Option<serde_json::Value>, LcuError> {
        self.http
            .as_ref()
            .ok_or_else(|| LcuError::internal("HTTP unavailable"))?
            .get_json_optional(client, "/lol-matchmaking/v1/ready-check")
            .await
    }
    async fn current_account(&self, client: &LcuClient) -> Result<String, LcuError> {
        GameflowSource::account(self, client).await
    }
    async fn current_phase(&self, client: &LcuClient) -> Result<String, LcuError> {
        self.http
            .as_ref()
            .ok_or_else(|| LcuError::internal("HTTP unavailable"))?
            .get_json(client, PHASE_PATH)
            .await?
            .as_str()
            .map(str::to_owned)
            .ok_or_else(|| LcuError::internal("Invalid phase"))
    }
    async fn accept(&self, client: &LcuClient) -> Result<(), LcuError> {
        self.http
            .as_ref()
            .ok_or_else(|| LcuError::internal("HTTP unavailable"))?
            .accept_ready_check(client)
            .await
    }
}

fn extract_game_metadata(value: &serde_json::Value) -> Option<LobbySnapshot> {
    let data = value.get("gameData").unwrap_or(&serde_json::Value::Null);
    let map_id = crate::lcu::metadata::map_id(value.pointer("/map/id"));
    let is_custom_game = data.get("isCustomGame").and_then(|value| value.as_bool());
    let queue_id = data.pointer("/queue/id").and_then(|value| value.as_i64());
    let game_mode = data
        .pointer("/queue/gameMode")
        .and_then(|value| value.as_str())
        .map(str::to_string);
    let member_count = data
        .get("teamOne")
        .and_then(|value| value.as_array())
        .zip(data.get("teamTwo").and_then(|value| value.as_array()))
        .filter(|(one, two)| !one.is_empty() && !two.is_empty())
        .and_then(|(one, two)| u32::try_from(one.len() + two.len()).ok())
        .filter(|count| *count > 0);
    if map_id.is_none()
        && queue_id.is_none()
        && game_mode.is_none()
        && member_count.is_none()
        && is_custom_game.is_none()
    {
        return None;
    }
    Some(LobbySnapshot {
        lobby_id: None,
        queue_id,
        map_id,
        game_mode,
        is_custom_game,
        member_count,
        updated_at: crate::lcu::models::now_ms(),
    })
}

fn extract_game_id(value: &serde_json::Value) -> Option<String> {
    value
        .pointer("/gameData/gameId")
        .and_then(value_as_string)
        .or_else(|| value.get("gameId").and_then(value_as_string))
        .filter(|id| id.parse::<u64>().is_ok_and(|number| number > 0))
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
        accepts: AtomicU64,
        ready_statuses: Mutex<VecDeque<ReadyCheckStatus>>,
        accept_error: Mutex<Option<LcuError>>,
        accounts: Mutex<VecDeque<Result<String, LcuError>>>,
        discoveries: Mutex<VecDeque<Result<Option<LcuClient>, LcuError>>>,
        readings: Mutex<VecDeque<Result<GameflowReading, LcuError>>>,
    }

    impl FakeGameflowSource {
        fn new(
            discoveries: Vec<Result<Option<LcuClient>, LcuError>>,
            readings: Vec<Result<GameflowReading, LcuError>>,
        ) -> Self {
            Self {
                accepts: AtomicU64::new(0),
                ready_statuses: Mutex::new(VecDeque::new()),
                accept_error: Mutex::new(None),
                accounts: Mutex::new(VecDeque::new()),
                discoveries: Mutex::new(discoveries.into()),
                readings: Mutex::new(readings.into()),
            }
        }
    }

    #[async_trait]
    impl GameflowSource for FakeGameflowSource {
        async fn ready_status(
            &self,
            _: &LcuClient,
            _: &str,
        ) -> Result<Option<ReadyCheckStatus>, LcuError> {
            Ok(lock(&self.ready_statuses).pop_front())
        }
        async fn auto_accept(
            &self,
            _client: &LcuClient,
            _account: &str,
            control: &AutoAcceptControl,
            token: u64,
        ) -> Result<AcceptOutcome, LcuError> {
            assert!(control.is_current(token));
            self.accepts.fetch_add(1, Ordering::SeqCst);
            if let Some(error) = lock(&self.accept_error).take() {
                return Err(error);
            }
            Ok(AcceptOutcome::Submitted)
        }
        async fn account(&self, _client: &LcuClient) -> Result<String, LcuError> {
            lock(&self.accounts)
                .pop_front()
                .unwrap_or(Ok("test-account".into()))
        }

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
            game: None,
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

    fn reading_with_mode() -> GameflowReading {
        let mut value = reading(GameflowPhase::InProgress, "InProgress");
        value.game = Some(LobbySnapshot {
            lobby_id: None,
            queue_id: Some(2400),
            map_id: Some(12),
            game_mode: Some("ARAM".into()),
            is_custom_game: Some(false),
            member_count: Some(10),
            updated_at: 1,
        });
        value
    }

    #[test]
    fn replaced_monitor_cannot_release_or_overwrite_current_install_safety() {
        let manager = GameflowManager::new(
            Arc::new(FakeGameflowSource::new(vec![], vec![])),
            LcuSourceKind::Real,
            config(),
        );
        let old_generation = manager.generation.load(Ordering::SeqCst);
        lock(&manager.machine).observe(
            1,
            reading(GameflowPhase::Lobby, "Lobby"),
            GameflowTransport::Polling,
        );
        assert!(!manager.install_blocked());
        let new_generation = manager.advance_generation();
        assert!(manager.install_blocked());
        current_machine(&manager.machine, &manager.generation, new_generation)
            .unwrap()
            .observe(
                2,
                reading(GameflowPhase::InProgress, "InProgress"),
                GameflowTransport::Polling,
            );
        // An old read may have passed its preliminary generation check before replacement.
        for phase in [
            GameflowPhase::None,
            GameflowPhase::Lobby,
            GameflowPhase::EndOfGame,
        ] {
            let result = current_machine(&manager.machine, &manager.generation, old_generation)
                .map(|mut state| {
                    state.observe(
                        1,
                        reading(phase.clone(), phase.as_raw()),
                        GameflowTransport::Polling,
                    )
                });
            assert!(result.is_none());
            assert!(manager.install_blocked());
            assert_eq!(manager.snapshot().phase, Some(GameflowPhase::InProgress));
        }
        assert!(
            current_machine(&manager.machine, &manager.generation, old_generation)
                .map(|mut state| state.client_not_found())
                .is_none()
        );
        assert!(manager.install_blocked());
        current_machine(&manager.machine, &manager.generation, new_generation)
            .unwrap()
            .observe(
                2,
                reading(GameflowPhase::EndOfGame, "EndOfGame"),
                GameflowTransport::Polling,
            );
        assert!(!manager.install_blocked());
        assert!(current_machine(&manager.machine, &manager.generation, old_generation).is_none());
    }

    #[tokio::test]
    async fn monitor_install_safety_tracks_disconnect_recovery_unknown_and_end() {
        let source = FakeGameflowSource::new(
            (0..6).map(|_| Ok(Some(client(51004)))).collect(),
            vec![
                Ok(reading(GameflowPhase::InProgress, "InProgress")),
                Err(LcuError::new(
                    LcuErrorCode::ConnectionRefused,
                    "temporary loss",
                )),
                Ok(reading(GameflowPhase::Reconnect, "Reconnect")),
                Err(LcuError::new(LcuErrorCode::Cancelled, "phase raced")),
                Ok(reading(
                    GameflowPhase::Unknown("FuturePhase".into()),
                    "FuturePhase",
                )),
                Ok(reading(GameflowPhase::EndOfGame, "EndOfGame")),
            ],
        );
        let manager = GameflowManager::new(Arc::new(source), LcuSourceKind::Real, config());
        let machine = Arc::clone(&manager.machine);
        let (tx, mut rx) = mpsc::unbounded_channel();
        manager.start_monitoring(Arc::new(move |event| {
            if let GameflowEvent::Updated(snapshot) = event {
                let _ = tx.send((snapshot, lock(&machine).install_blocked()));
            }
        }));
        for (phase, blocked) in [
            (Some(GameflowPhase::InProgress), true),
            (None, true),
            (Some(GameflowPhase::Reconnect), true),
            (Some(GameflowPhase::Unknown("FuturePhase".into())), true),
            (Some(GameflowPhase::EndOfGame), false),
        ] {
            let (snapshot, actual) = tokio::time::timeout(Duration::from_secs(2), rx.recv())
                .await
                .unwrap()
                .unwrap();
            assert_eq!(snapshot.phase, phase);
            assert_eq!(actual, blocked);
            if phase.is_none() {
                assert!(!snapshot.connected);
                assert!(snapshot.session.is_none());
            }
        }
        manager.stop_monitoring().await;
    }

    #[tokio::test]
    async fn monitor_restart_and_missing_client_do_not_forget_an_active_game() {
        let source = FakeGameflowSource::new(
            vec![Ok(Some(client(51005)))],
            vec![Ok(reading(GameflowPhase::InProgress, "InProgress"))],
        );
        let manager = GameflowManager::new(Arc::new(source), LcuSourceKind::Real, config());
        let (tx, mut rx) = mpsc::unbounded_channel();
        manager.start_monitoring(callback(tx));
        next_updated(&mut rx).await;
        manager.stop_monitoring().await;
        assert!(manager.install_blocked());
        let (tx, mut rx) = mpsc::unbounded_channel();
        manager.start_monitoring(callback(tx));
        let absent = next_updated(&mut rx).await;
        assert_eq!(absent.code.as_deref(), Some("client_not_found"));
        assert!(manager.install_blocked());
        manager.stop_monitoring().await;
    }

    #[tokio::test]
    async fn auto_accept_is_opt_in_and_runs_once_per_ready_check_round() {
        for enabled in [false, true] {
            let source = Arc::new(FakeGameflowSource::new(
                vec![Ok(Some(client(51004))); 5],
                vec![
                    Ok(reading(GameflowPhase::Lobby, "Lobby")),
                    Ok(reading(GameflowPhase::ReadyCheck, "ReadyCheck")),
                    Ok(reading(GameflowPhase::ReadyCheck, "ReadyCheck")),
                    Ok(reading(GameflowPhase::Matchmaking, "Matchmaking")),
                    Ok(reading(GameflowPhase::ReadyCheck, "ReadyCheck")),
                ],
            ));
            let manager = GameflowManager::new(Arc::clone(&source), LcuSourceKind::Real, config());
            manager.set_auto_accept(enabled);
            let (tx, mut rx) = mpsc::unbounded_channel();
            manager.start_monitoring(callback(tx));
            loop {
                if next_updated(&mut rx).await.code.as_deref() == Some("client_not_found") {
                    break;
                }
            }
            assert_eq!(
                source.accepts.load(Ordering::SeqCst),
                if enabled { 2 } else { 0 }
            );
            manager.stop_monitoring().await;
        }
    }

    #[tokio::test]
    async fn ready_feedback_requires_client_confirmation_and_clears_on_phase_exit() {
        for (enabled, fails) in [(true, false), (true, true), (false, false)] {
            let source = Arc::new(FakeGameflowSource::new(
                vec![Ok(Some(client(51004))); 3],
                vec![
                    Ok(reading(GameflowPhase::ReadyCheck, "ReadyCheck")),
                    Ok(reading(GameflowPhase::ReadyCheck, "ReadyCheck")),
                    Ok(reading(GameflowPhase::ChampSelect, "ChampSelect")),
                ],
            ));
            *lock(&source.ready_statuses) = [
                ReadyCheckStatus::Waiting,
                if fails {
                    ReadyCheckStatus::Waiting
                } else {
                    ReadyCheckStatus::Accepted
                },
            ]
            .into();
            if fails {
                *lock(&source.accept_error) = Some(LcuError::internal("test failure"));
            }
            let manager = GameflowManager::new(Arc::clone(&source), LcuSourceKind::Real, config());
            manager.set_auto_accept(enabled);
            let (tx, mut rx) = mpsc::unbounded_channel();
            manager.start_monitoring(callback(tx));
            let mut statuses = Vec::new();
            loop {
                let snapshot = next_updated(&mut rx).await;
                if snapshot.phase == Some(GameflowPhase::ChampSelect) {
                    assert_eq!(snapshot.ready_check_status, None);
                    break;
                }
                if let Some(status) = snapshot.ready_check_status {
                    statuses.push(status);
                }
            }
            assert!(statuses.contains(&ReadyCheckStatus::Waiting));
            assert_eq!(statuses.contains(&ReadyCheckStatus::Accepting), enabled);
            assert_eq!(statuses.contains(&ReadyCheckStatus::Accepted), !fails);
            assert_eq!(statuses.contains(&ReadyCheckStatus::Failed), fails);
            if enabled && !fails {
                assert!(
                    statuses
                        .iter()
                        .position(|s| *s == ReadyCheckStatus::Accepting)
                        < statuses
                            .iter()
                            .position(|s| *s == ReadyCheckStatus::Accepted)
                );
            }
            assert_eq!(source.accepts.load(Ordering::SeqCst), u64::from(enabled));
            manager.stop_monitoring().await;
            assert_eq!(manager.snapshot().ready_check_status, None);
        }
    }

    #[tokio::test]
    async fn account_switch_without_disconnect_or_phase_change_starts_clean_session() {
        let source = FakeGameflowSource::new(
            vec![Ok(Some(client(51004))), Ok(Some(client(51004)))],
            vec![
                Ok(reading_with_mode()),
                Ok(reading(GameflowPhase::InProgress, "InProgress")),
            ],
        );
        *lock(&source.accounts) = [
            "private-account-a",
            "private-account-a",
            "private-account-b",
            "private-account-b",
        ]
        .map(|id| Ok(id.into()))
        .into();
        let manager = GameflowManager::new(Arc::new(source), LcuSourceKind::Real, config());
        let (tx, mut rx) = mpsc::unbounded_channel();
        manager.start_monitoring(callback(tx));
        let first = next_updated(&mut rx).await.session.unwrap();
        assert_eq!(
            manager.roster_context().1.as_deref(),
            Some("private-account-a")
        );
        assert_eq!(first.mode_context.unwrap().queue_id, Some(2400));
        let cleared = next_updated(&mut rx).await;
        assert_eq!(cleared.code.as_deref(), Some("account_changed"));
        assert!(cleared.session.is_none());
        let next = next_updated(&mut rx).await;
        assert!(
            !serde_json::to_string(&next)
                .unwrap()
                .contains("private-account")
        );
        let next = next.session.unwrap();
        assert_ne!(next.session_key, first.session_key);
        assert!(next.connection_generation > first.connection_generation);
        assert!(next.mode_context.is_none() && next.game.is_none() && next.lobby.is_none());
        manager.stop_monitoring().await;
    }

    #[tokio::test]
    async fn changed_client_clears_mode_even_when_new_phase_sample_is_cancelled() {
        let source = FakeGameflowSource::new(
            vec![
                Ok(Some(client(51007))),
                Ok(Some(client(51008))),
                Ok(Some(client(51008))),
            ],
            vec![
                Ok(reading_with_mode()),
                Err(LcuError::new(LcuErrorCode::Cancelled, "Phase changed")),
                Ok(reading(GameflowPhase::InProgress, "InProgress")),
            ],
        );
        let manager = GameflowManager::new(Arc::new(source), LcuSourceKind::Real, config());
        let (tx, mut rx) = mpsc::unbounded_channel();
        manager.start_monitoring(callback(tx));
        let old = next_updated(&mut rx).await.session.unwrap();
        let cleared = next_updated(&mut rx).await;
        assert!(cleared.session.is_none());
        let new = next_updated(&mut rx).await.session.unwrap();
        assert!(new.mode_context.is_none());
        assert!(new.connection_generation > old.connection_generation);
        manager.stop_monitoring().await;
    }

    #[tokio::test]
    async fn mixed_account_samples_are_discarded_including_cancelled_phase_reads() {
        for result in [
            Ok(reading_with_mode()),
            Err(LcuError::new(LcuErrorCode::Cancelled, "Phase changed")),
        ] {
            let source = FakeGameflowSource::new(vec![], vec![result]);
            *lock(&source.accounts) = vec![Ok("new-account".into())].into();
            let error = read_for_account(&source, &client(51005), "old-account")
                .await
                .unwrap_err();
            assert_eq!(error.code, "account_changed");
            assert!(
                !error.message.contains("old-account") && !error.message.contains("new-account")
            );
        }
    }

    #[tokio::test]
    async fn logout_without_transport_disconnect_clears_mode_and_relogin_is_clean() {
        let source = FakeGameflowSource::new(
            vec![Ok(Some(client(51006))); 3],
            vec![
                Ok(reading_with_mode()),
                Ok(reading(GameflowPhase::InProgress, "InProgress")),
            ],
        );
        *lock(&source.accounts) = vec![
            Ok("a".into()),
            Ok("a".into()),
            Err(LcuError::new(LcuErrorCode::NotLoggedIn, "Logged out")),
            Ok("b".into()),
            Ok("b".into()),
        ]
        .into();
        let manager = GameflowManager::new(Arc::new(source), LcuSourceKind::Real, config());
        let (tx, mut rx) = mpsc::unbounded_channel();
        manager.start_monitoring(callback(tx));
        let old = next_updated(&mut rx).await.session.unwrap();
        assert!(next_updated(&mut rx).await.session.is_none());
        let new = next_updated(&mut rx).await.session.unwrap();
        assert!(new.mode_context.is_none());
        assert_ne!(new.session_key, old.session_key);
        manager.stop_monitoring().await;
    }

    #[test]
    fn game_map_uses_session_map_and_never_queue_default() {
        let raw = serde_json::json!({"map":{"id":11},"gameData":{"queue":{"id":2400,"mapId":12}}});
        assert_eq!(extract_game_metadata(&raw).unwrap().map_id, Some(11));
        let only_queue = serde_json::json!({"gameData":{"queue":{"id":2400,"mapId":12}}});
        assert_eq!(extract_game_metadata(&only_queue).unwrap().map_id, None);
        assert_eq!(
            extract_game_metadata(&serde_json::json!({"map":{"id":12}}))
                .unwrap()
                .map_id,
            Some(12)
        );
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
            vec![
                Ok(Some(client(51001))),
                Ok(Some(client(51001))),
                Ok(Some(client(51001))),
            ],
            vec![
                Ok(reading(GameflowPhase::Lobby, "Lobby")),
                Err(LcuError::new(LcuErrorCode::Cancelled, "phase changed")),
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
        assert_eq!(
            first.session.unwrap().session_key,
            second.session.unwrap().session_key
        );
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
        assert!(!manager.install_blocked());
        manager.stop_monitoring().await;
    }

    #[tokio::test]
    async fn lobby_and_champ_snapshots_are_emitted_without_raw_json() {
        let lobby = LobbySnapshot {
            lobby_id: Some("lobby-1".to_string()),
            queue_id: Some(450),
            map_id: None,
            game_mode: Some("ARAM".to_string()),
            is_custom_game: None,
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
                    game: None,
                }),
                Ok(GameflowReading {
                    raw_phase: "ChampSelect".to_string(),
                    phase: GameflowPhase::ChampSelect,
                    lobby: None,
                    champion_select: Some(champ),
                    game_id: Some("99".to_string()),
                    game: None,
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
        async fn account(&self, _client: &LcuClient) -> Result<String, LcuError> {
            Ok("test-account".into())
        }

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
