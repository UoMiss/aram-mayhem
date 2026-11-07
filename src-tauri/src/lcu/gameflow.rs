use crate::lcu::models::{LcuSourceKind, now_ms};
use serde::{Serialize, Serializer};

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum GameflowPhase {
    None,
    Lobby,
    Matchmaking,
    ReadyCheck,
    ChampSelect,
    GameStart,
    InProgress,
    Reconnect,
    WaitingForStats,
    PreEndOfGame,
    EndOfGame,
    TerminatedInError,
    Unknown(String),
}

impl GameflowPhase {
    pub fn parse(raw: &str) -> Self {
        match raw {
            "None" => Self::None,
            "Lobby" => Self::Lobby,
            "Matchmaking" => Self::Matchmaking,
            "ReadyCheck" => Self::ReadyCheck,
            "ChampSelect" => Self::ChampSelect,
            "GameStart" => Self::GameStart,
            "InProgress" => Self::InProgress,
            "Reconnect" => Self::Reconnect,
            "WaitingForStats" => Self::WaitingForStats,
            "PreEndOfGame" => Self::PreEndOfGame,
            "EndOfGame" => Self::EndOfGame,
            "TerminatedInError" => Self::TerminatedInError,
            other => Self::Unknown(other.to_string()),
        }
    }

    #[allow(dead_code)]
    pub fn as_raw(&self) -> &str {
        match self {
            Self::None => "None",
            Self::Lobby => "Lobby",
            Self::Matchmaking => "Matchmaking",
            Self::ReadyCheck => "ReadyCheck",
            Self::ChampSelect => "ChampSelect",
            Self::GameStart => "GameStart",
            Self::InProgress => "InProgress",
            Self::Reconnect => "Reconnect",
            Self::WaitingForStats => "WaitingForStats",
            Self::PreEndOfGame => "PreEndOfGame",
            Self::EndOfGame => "EndOfGame",
            Self::TerminatedInError => "TerminatedInError",
            Self::Unknown(raw) => raw,
        }
    }

    pub fn is_terminal(&self) -> bool {
        matches!(self, Self::EndOfGame | Self::TerminatedInError)
    }
}

impl Serialize for GameflowPhase {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        let value = match self {
            Self::None => "none",
            Self::Lobby => "lobby",
            Self::Matchmaking => "matchmaking",
            Self::ReadyCheck => "ready_check",
            Self::ChampSelect => "champ_select",
            Self::GameStart => "game_start",
            Self::InProgress => "in_progress",
            Self::Reconnect => "reconnect",
            Self::WaitingForStats => "waiting_for_stats",
            Self::PreEndOfGame => "pre_end_of_game",
            Self::EndOfGame => "end_of_game",
            Self::TerminatedInError => "terminated_in_error",
            Self::Unknown(_) => "unknown",
        };
        serializer.serialize_str(value)
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum GameflowTransport {
    Websocket,
    Polling,
    Disconnected,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LobbySnapshot {
    pub lobby_id: Option<String>,
    pub queue_id: Option<i64>,
    pub map_id: Option<i64>,
    pub game_mode: Option<String>,
    pub is_custom_game: Option<bool>,
    pub member_count: Option<u32>,
    pub updated_at: u64,
}

impl LobbySnapshot {
    fn same_data(&self, other: &Self) -> bool {
        self.lobby_id == other.lobby_id
            && self.queue_id == other.queue_id
            && self.map_id == other.map_id
            && self.game_mode == other.game_mode
            && self.is_custom_game == other.is_custom_game
            && self.member_count == other.member_count
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ChampionSelectPlayer {
    pub player_id: Option<String>,
    pub champion_id: Option<i64>,
    pub team: String,
    pub cell_id: Option<i64>,
    pub assigned_position: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ChampionSelectSnapshot {
    pub game_id: Option<String>,
    pub my_team: Vec<ChampionSelectPlayer>,
    pub their_team: Vec<ChampionSelectPlayer>,
    pub local_player_cell_id: Option<i64>,
    pub complete: bool,
    pub updated_at: u64,
}

impl ChampionSelectSnapshot {
    fn same_data(&self, other: &Self) -> bool {
        self.game_id == other.game_id
            && self.my_team == other.my_team
            && self.their_team == other.their_team
            && self.local_player_cell_id == other.local_player_cell_id
            && self.complete == other.complete
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum ModeSource {
    Lobby,
    Gameflow,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ModeContext {
    pub queue_id: Option<i64>,
    pub map_id: Option<i64>,
    pub game_mode: Option<String>,
    pub is_custom_game: Option<bool>,
    pub source: ModeSource,
}

impl ModeContext {
    fn merge(mut self, prior: Option<&Self>) -> Self {
        if let Some(prior) = prior {
            let compatible = self
                .queue_id
                .zip(prior.queue_id)
                .is_none_or(|(a, b)| a == b)
                && self
                    .is_custom_game
                    .zip(prior.is_custom_game)
                    .is_none_or(|(a, b)| a == b);
            if compatible {
                self.queue_id = self.queue_id.or(prior.queue_id);
                self.map_id = self.map_id.or(prior.map_id);
                self.game_mode = self.game_mode.or_else(|| prior.game_mode.clone());
                self.is_custom_game = self.is_custom_game.or(prior.is_custom_game);
            }
        }
        self
    }

    fn from_snapshot(snapshot: &LobbySnapshot, source: ModeSource) -> Option<Self> {
        let queue_id = snapshot
            .queue_id
            .filter(|id| (0..=9_007_199_254_740_991).contains(id));
        let map_id = snapshot
            .map_id
            .filter(|id| (1..=9_007_199_254_740_991).contains(id));
        if queue_id.is_none() && map_id.is_none() && snapshot.is_custom_game != Some(true) {
            return None;
        }
        Some(Self {
            queue_id,
            map_id,
            game_mode: snapshot.game_mode.clone(),
            is_custom_game: snapshot.is_custom_game,
            source,
        })
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GameSessionContext {
    pub mode_context: Option<ModeContext>,
    pub session_key: String,
    pub game_id: Option<String>,
    #[serde(skip)]
    pub opening_observed: Option<std::time::Instant>,
    pub game: Option<LobbySnapshot>,
    pub connection_generation: u64,
    pub phase: GameflowPhase,
    pub started_at: u64,
    pub updated_at: u64,
    pub lobby: Option<LobbySnapshot>,
    pub champion_select: Option<ChampionSelectSnapshot>,
    pub snapshot_complete: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GameflowSnapshot {
    pub ready_check_status: Option<crate::lcu::auto_accept::ReadyCheckStatus>,
    pub revision: u64,
    pub updated_at: u64,
    pub connected: bool,
    pub phase: Option<GameflowPhase>,
    pub raw_phase: Option<String>,
    pub transport: GameflowTransport,
    pub source: LcuSourceKind,
    pub simulated: bool,
    pub session: Option<GameSessionContext>,
    pub code: Option<String>,
    pub message: Option<String>,
}

impl GameflowSnapshot {
    pub fn initial(source: LcuSourceKind, simulated: bool) -> Self {
        Self {
            ready_check_status: None,
            revision: 1,
            updated_at: now_ms(),
            connected: false,
            phase: None,
            raw_phase: None,
            transport: GameflowTransport::Disconnected,
            source,
            simulated,
            session: None,
            code: None,
            message: None,
        }
    }
}

#[derive(Debug, Clone)]
pub struct GameflowReading {
    pub raw_phase: String,
    pub phase: GameflowPhase,
    pub lobby: Option<LobbySnapshot>,
    pub champion_select: Option<ChampionSelectSnapshot>,
    pub game_id: Option<String>,
    pub game: Option<LobbySnapshot>,
}

#[derive(Debug, Clone)]
pub struct SessionObservation {
    pub context: Option<GameSessionContext>,
    pub ended: Option<GameSessionContext>,
}

#[derive(Default)]
pub struct GameSessionTracker {
    current: Option<GameSessionContext>,
    generation: u64,
    next_id: u64,
}

impl GameSessionTracker {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn observe(
        &mut self,
        generation: u64,
        phase: &GameflowPhase,
        lobby: &Option<LobbySnapshot>,
        champion_select: &Option<ChampionSelectSnapshot>,
        game_id: &Option<String>,
    ) -> SessionObservation {
        let now = now_ms();
        if matches!(phase, GameflowPhase::None) {
            let ended = self.current.take();
            self.generation = generation;
            return SessionObservation {
                context: None,
                ended,
            };
        }

        let lobby_id = lobby.as_ref().and_then(|value| value.lobby_id.as_deref());
        let game_changed = self
            .current
            .as_ref()
            .and_then(|session| session.game_id.as_ref())
            .zip(game_id.as_ref())
            .is_some_and(|(old, new)| old != new);
        // The opening can be the first observation with the final game ID.
        // Keep the selected rule and preview attached to the same session.
        let entering_game = self.current.as_ref().is_some_and(|session| {
            session.phase == GameflowPhase::ChampSelect
                && matches!(phase, GameflowPhase::GameStart | GameflowPhase::InProgress)
        });
        let start_new =
            (game_changed && !entering_game) || self.should_start_new(generation, phase, lobby_id);

        if start_new {
            let ended = self.current.take();
            self.next_id = self.next_id.saturating_add(1);
            let key = if let Some(game_id) = game_id {
                format!("game:{game_id}:{}", self.next_id)
            } else if let Some(lobby_id) = lobby_id {
                format!("lobby:{lobby_id}:{}", self.next_id)
            } else {
                format!("generation:{}:{}", generation, self.next_id)
            };
            self.generation = generation;
            self.current = Some(GameSessionContext {
                mode_context: None,
                session_key: key,
                game_id: game_id.clone(),
                opening_observed: matches!(phase, GameflowPhase::GameStart)
                    .then(std::time::Instant::now),
                game: None,
                connection_generation: generation,
                phase: phase.clone(),
                started_at: now,
                updated_at: now,
                lobby: if matches!(phase, GameflowPhase::Lobby) {
                    lobby.clone()
                } else {
                    None
                },
                champion_select: if matches!(phase, GameflowPhase::ChampSelect) {
                    champion_select.clone()
                } else {
                    None
                },
                snapshot_complete: champion_select
                    .as_ref()
                    .map(|value| value.complete)
                    .unwrap_or(false),
            });
            return SessionObservation {
                context: self.current.clone(),
                ended,
            };
        }

        let Some(current) = self.current.as_mut() else {
            return SessionObservation {
                context: None,
                ended: None,
            };
        };

        let mut changed = false;
        if game_id.is_some() && current.game_id != *game_id {
            current.game_id = game_id.clone();
            changed = true;
        }
        if current.phase != *phase {
            if current.opening_observed.is_none()
                && (matches!(phase, GameflowPhase::GameStart)
                    || (matches!(phase, GameflowPhase::InProgress)
                        && matches!(current.phase, GameflowPhase::ChampSelect)))
            {
                current.opening_observed = Some(std::time::Instant::now());
            }
            current.phase = phase.clone();
            changed = true;
        }

        let next_lobby = if matches!(phase, GameflowPhase::Lobby) {
            lobby.clone()
        } else {
            None
        };
        let merged_lobby = match (current.lobby.as_ref(), next_lobby) {
            (Some(old), Some(new)) if old.same_data(&new) => Some(old.clone()),
            (_, next) => next,
        };
        if current.lobby != merged_lobby {
            current.lobby = merged_lobby;
            changed = true;
        }

        let next_champion = if matches!(phase, GameflowPhase::ChampSelect) {
            champion_select.clone()
        } else if matches!(phase, GameflowPhase::Lobby) {
            None
        } else {
            current.champion_select.clone()
        };
        let merged_champion = match (current.champion_select.as_ref(), next_champion) {
            (Some(old), Some(new)) if old.same_data(&new) => Some(old.clone()),
            (_, next) => next,
        };
        if current.champion_select != merged_champion {
            current.champion_select = merged_champion;
            changed = true;
        }

        let complete = current
            .champion_select
            .as_ref()
            .map(|value| value.complete)
            .unwrap_or(false);
        if current.snapshot_complete != complete {
            current.snapshot_complete = complete;
            changed = true;
        }

        if changed {
            current.updated_at = now;
        }
        SessionObservation {
            context: self.current.clone(),
            ended: None,
        }
    }

    fn should_start_new(
        &self,
        generation: u64,
        phase: &GameflowPhase,
        lobby_id: Option<&str>,
    ) -> bool {
        let Some(current) = self.current.as_ref() else {
            return true;
        };
        if current.connection_generation != generation {
            return true;
        }
        // Polling the same terminal phase is still the same game. Only a move
        // out of the terminal state starts another session.
        if current.phase.is_terminal() && !phase.is_terminal() {
            return true;
        }
        if matches!(phase, GameflowPhase::Lobby) && !matches!(current.phase, GameflowPhase::Lobby) {
            return true;
        }
        if matches!(phase, GameflowPhase::Lobby)
            && current
                .lobby
                .as_ref()
                .and_then(|value| value.lobby_id.as_deref())
                != lobby_id
            && lobby_id.is_some()
        {
            return true;
        }
        false
    }

    pub fn disconnect(&mut self) -> Option<GameSessionContext> {
        let ended = self.current.take();
        self.generation = self.generation.saturating_add(1);
        ended
    }
}

#[derive(Debug, Clone)]
pub struct GameflowChanges {
    pub previous: GameflowSnapshot,
    pub current: GameflowSnapshot,
    pub session_ended: Option<GameSessionContext>,
}

#[derive(Debug, PartialEq, Eq)]
struct QueueConflict {
    old_queue: i64,
    new_queue: i64,
    phase: String,
    old_source: ModeSource,
    new_source: ModeSource,
}
impl QueueConflict {
    fn between(
        old: Option<&ModeContext>,
        new: Option<&ModeContext>,
        phase: &GameflowPhase,
    ) -> Option<Self> {
        let (old, new) = old.zip(new)?;
        let (old_queue, new_queue) = old.queue_id.zip(new.queue_id)?;
        (old_queue != new_queue).then(|| Self {
            old_queue,
            new_queue,
            phase: match phase {
                GameflowPhase::Unknown(_) => "Unknown",
                _ => phase.as_raw(),
            }
            .to_owned(),
            old_source: old.source.clone(),
            new_source: new.source.clone(),
        })
    }
}

#[derive(Clone, Copy, PartialEq, Eq)]
enum InstallSafety {
    Unconfirmed,
    Safe,
    Busy,
}

pub struct GameflowMachine {
    // Native-only identity of the successful sample; never serialized in Gameflow IPC.
    account_key: Option<String>,
    snapshot: GameflowSnapshot,
    tracker: GameSessionTracker,
    // Native-only: display snapshots must clear on disconnect without forgetting a live game.
    install_safety: InstallSafety,
}

impl GameflowMachine {
    pub fn new(source: LcuSourceKind, simulated: bool) -> Self {
        Self {
            account_key: None,
            snapshot: GameflowSnapshot::initial(source, simulated),
            tracker: GameSessionTracker::new(),
            install_safety: InstallSafety::Unconfirmed,
        }
    }

    pub fn snapshot(&self) -> GameflowSnapshot {
        self.snapshot.clone()
    }

    pub fn install_blocked(&self) -> bool {
        self.install_safety != InstallSafety::Safe
    }

    pub fn invalidate_install_safety(&mut self) {
        if self.install_safety != InstallSafety::Busy {
            self.install_safety = InstallSafety::Unconfirmed;
        }
    }

    pub fn client_not_found(&mut self) -> GameflowChanges {
        let changes = self.disconnected("client_not_found", "League client is not running");
        // Absence of LeagueClient does not prove an already running game has ended.
        if self.install_safety != InstallSafety::Busy
            && self.snapshot.source == LcuSourceKind::Real
            && !self.snapshot.simulated
        {
            self.install_safety = InstallSafety::Safe;
        }
        changes
    }

    pub fn account_key(&self) -> Option<String> {
        self.account_key.clone()
    }
    pub fn set_account_key(&mut self, account: Option<String>) {
        self.account_key = account;
    }

    pub fn observe(
        &mut self,
        generation: u64,
        reading: GameflowReading,
        transport: GameflowTransport,
    ) -> GameflowChanges {
        let previous = self.snapshot.clone();
        self.install_safety =
            if self.snapshot.source != LcuSourceKind::Real || self.snapshot.simulated {
                InstallSafety::Unconfirmed
            } else if matches!(
                reading.phase,
                GameflowPhase::None
                    | GameflowPhase::Lobby
                    | GameflowPhase::EndOfGame
                    | GameflowPhase::TerminatedInError
            ) {
                InstallSafety::Safe
            } else {
                InstallSafety::Busy
            };
        let mut observation = self.tracker.observe(
            generation,
            &reading.phase,
            &reading.lobby,
            &reading.champion_select,
            &reading.game_id,
        );
        if let Some(context) = observation.context.as_mut() {
            let prior = previous.session.as_ref().filter(|session| {
                session.session_key == context.session_key
                    && session.connection_generation == context.connection_generation
            });
            // Only mode metadata survives gaps in a same-session observation.
            // Current gameflow data takes precedence over lobby data.
            context.mode_context = reading
                .game
                .as_ref()
                .and_then(|game| ModeContext::from_snapshot(game, ModeSource::Gameflow))
                .or_else(|| {
                    reading
                        .lobby
                        .as_ref()
                        .and_then(|lobby| ModeContext::from_snapshot(lobby, ModeSource::Lobby))
                })
                .map(|mode| mode.merge(prior.and_then(|session| session.mode_context.as_ref())))
                .or_else(|| prior.and_then(|session| session.mode_context.clone()));
            // Session/account/generation boundaries were resolved above. Log only
            // a same-session conflict, with typed values and no player/game identifiers.
            if let Some(conflict) = QueueConflict::between(
                prior.and_then(|session| session.mode_context.as_ref()),
                context.mode_context.as_ref(),
                &reading.phase,
            ) {
                eprintln!("[lcu_mode_queue_conflict] {conflict:?}");
            }
            if prior.and_then(|session| session.mode_context.as_ref())
                != context.mode_context.as_ref()
            {
                context.updated_at = now_ms();
            }
            let previous_game = previous
                .session
                .as_ref()
                .filter(|session| session.session_key == context.session_key)
                .and_then(|session| session.game.as_ref());
            context.game = match (previous_game, reading.game) {
                (Some(old), Some(new)) if old.same_data(&new) => Some(old.clone()),
                (_, Some(new)) => Some(new),
                (old, None) => old.cloned(),
            };
            self.tracker.current = Some(context.clone());
        }
        let mut next = previous.clone();
        next.connected = true;
        next.phase = Some(reading.phase);
        next.raw_phase = Some(reading.raw_phase);
        next.transport = transport;
        next.session = observation.context;
        if next.phase != Some(GameflowPhase::ReadyCheck)
            || previous.phase != Some(GameflowPhase::ReadyCheck)
            || previous
                .session
                .as_ref()
                .map(|s| (&s.session_key, s.connection_generation))
                != next
                    .session
                    .as_ref()
                    .map(|s| (&s.session_key, s.connection_generation))
        {
            next.ready_check_status = None;
        }
        next.code = None;
        next.message = None;
        if next != previous {
            next.revision = previous.revision.saturating_add(1);
            next.updated_at = now_ms();
            self.snapshot = next.clone();
        }
        GameflowChanges {
            previous: previous.clone(),
            current: self.snapshot.clone(),
            session_ended: observation.ended.map(|ended| {
                previous
                    .session
                    .as_ref()
                    .filter(|session| session.session_key == ended.session_key)
                    .cloned()
                    .unwrap_or(ended)
            }),
        }
    }

    pub fn set_ready_check_status(
        &mut self,
        status: Option<crate::lcu::auto_accept::ReadyCheckStatus>,
    ) -> GameflowChanges {
        let previous = self.snapshot.clone();
        let status = if previous.connected && previous.phase == Some(GameflowPhase::ReadyCheck) {
            status
        } else {
            None
        };
        if previous.ready_check_status != status {
            self.snapshot.ready_check_status = status;
            self.snapshot.revision = previous.revision.saturating_add(1);
            self.snapshot.updated_at = now_ms();
        }
        GameflowChanges {
            previous,
            current: self.snapshot.clone(),
            session_ended: None,
        }
    }

    pub fn account_invalidated(&mut self) -> GameflowChanges {
        let mut changes =
            self.disconnected("account_changed", "Gameflow account context invalidated");
        // Logging out/changing account is not an old-account match settlement event.
        changes.session_ended = None;
        changes
    }

    pub fn disconnected(
        &mut self,
        code: impl Into<String>,
        message: impl Into<String>,
    ) -> GameflowChanges {
        self.invalidate_install_safety();
        let previous = self.snapshot.clone();
        let ended = self.tracker.disconnect();
        self.account_key = None;
        let mut next = previous.clone();
        next.connected = false;
        next.ready_check_status = None;
        next.phase = None;
        next.raw_phase = None;
        next.transport = GameflowTransport::Disconnected;
        next.session = None;
        next.code = Some(code.into());
        next.message = Some(message.into());
        if next != previous {
            next.revision = previous.revision.saturating_add(1);
            next.updated_at = now_ms();
            self.snapshot = next.clone();
        }
        GameflowChanges {
            previous,
            current: self.snapshot.clone(),
            session_ended: ended,
        }
    }

    pub fn unsupported(&mut self) -> GameflowChanges {
        self.snapshot.source = LcuSourceKind::Unavailable;
        self.disconnected(
            "unsupported_platform",
            "LCU gameflow monitoring is only available on Windows",
        )
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn queue_conflict_diagnostics_are_bounded_and_only_report_changes() {
        let old = ModeContext {
            queue_id: Some(2400),
            map_id: Some(12),
            game_mode: Some("private-client-data".into()),
            is_custom_game: None,
            source: ModeSource::Lobby,
        };
        let mut new = old.clone();
        assert!(QueueConflict::between(Some(&old), Some(&new), &GameflowPhase::Lobby).is_none());
        new.queue_id = Some(450);
        new.source = ModeSource::Gameflow;
        let conflict = QueueConflict::between(
            Some(&old),
            Some(&new),
            &GameflowPhase::Unknown("private-phase".into()),
        )
        .unwrap();
        let log = format!("{conflict:?}");
        assert!(
            log.contains("2400")
                && log.contains("450")
                && log.contains("Lobby")
                && log.contains("Gameflow")
        );
        assert!(!log.contains("private"));
        assert!(QueueConflict::between(None, Some(&new), &GameflowPhase::Lobby).is_none());
    }

    #[test]
    fn account_invalidation_clears_every_snapshot_without_settlement_event() {
        let mut machine = GameflowMachine::new(LcuSourceKind::Real, false);
        machine.observe(
            1,
            GameflowReading {
                phase: GameflowPhase::EndOfGame,
                raw_phase: "EndOfGame".into(),
                game_id: Some("42".into()),
                lobby: None,
                champion_select: None,
                game: Some(LobbySnapshot {
                    lobby_id: None,
                    queue_id: Some(2400),
                    map_id: Some(12),
                    game_mode: Some("ARAM".into()),
                    is_custom_game: None,
                    member_count: Some(10),
                    updated_at: 1,
                }),
            },
            GameflowTransport::Polling,
        );
        let changes = machine.account_invalidated();
        assert!(changes.current.session.is_none());
        assert!(!changes.current.connected);
        assert!(changes.session_ended.is_none());
    }

    #[test]
    fn partial_map_observations_merge_only_with_compatible_mode() {
        let old = ModeContext {
            queue_id: Some(2400),
            map_id: Some(12),
            game_mode: Some("ARAM".into()),
            is_custom_game: Some(false),
            source: ModeSource::Lobby,
        };
        let mut partial = old.clone();
        partial.map_id = None;
        assert_eq!(partial.clone().merge(Some(&old)).map_id, Some(12));
        partial.queue_id = Some(420);
        assert_eq!(partial.merge(Some(&old)).map_id, None);
        let mut map_only = old.clone();
        map_only.queue_id = None;
        map_only.map_id = Some(11);
        let merged = map_only.merge(Some(&old));
        assert_eq!(merged.queue_id, Some(2400));
        assert_eq!(merged.map_id, Some(11));
        let a = LobbySnapshot {
            lobby_id: None,
            queue_id: None,
            map_id: Some(12),
            game_mode: None,
            is_custom_game: None,
            member_count: None,
            updated_at: 1,
        };
        assert_eq!(
            ModeContext::from_snapshot(&a, ModeSource::Gameflow)
                .unwrap()
                .map_id,
            Some(12)
        );
        assert!(!a.same_data(&LobbySnapshot {
            map_id: Some(11),
            ..a.clone()
        }));
    }

    #[test]
    fn parses_all_known_phases_and_unknown() {
        let cases = [
            ("None", GameflowPhase::None),
            ("Lobby", GameflowPhase::Lobby),
            ("Matchmaking", GameflowPhase::Matchmaking),
            ("ReadyCheck", GameflowPhase::ReadyCheck),
            ("ChampSelect", GameflowPhase::ChampSelect),
            ("GameStart", GameflowPhase::GameStart),
            ("InProgress", GameflowPhase::InProgress),
            ("Reconnect", GameflowPhase::Reconnect),
            ("WaitingForStats", GameflowPhase::WaitingForStats),
            ("PreEndOfGame", GameflowPhase::PreEndOfGame),
            ("EndOfGame", GameflowPhase::EndOfGame),
            ("TerminatedInError", GameflowPhase::TerminatedInError),
        ];
        for (raw, expected) in cases {
            assert_eq!(GameflowPhase::parse(raw), expected);
            assert_eq!(expected.as_raw(), raw);
        }
        let unknown = GameflowPhase::parse("NewClientPhase");
        assert_eq!(unknown.as_raw(), "NewClientPhase");
        assert!(matches!(unknown, GameflowPhase::Unknown(_)));
        assert_eq!(serde_json::to_value(&unknown).unwrap(), "unknown");
    }

    #[test]
    fn phase_values_are_distinct_contract_strings() {
        assert_eq!(
            serde_json::to_value(GameflowPhase::InProgress).unwrap(),
            "in_progress"
        );
        assert_eq!(
            serde_json::to_value(GameflowPhase::EndOfGame).unwrap(),
            "end_of_game"
        );
        assert_eq!(
            serde_json::to_value(GameflowPhase::ChampSelect).unwrap(),
            "champ_select"
        );
    }

    #[test]
    fn session_does_not_carry_old_lobby_into_next_game() {
        let mut tracker = GameSessionTracker::new();
        let lobby = LobbySnapshot {
            lobby_id: Some("lobby-1".to_string()),
            queue_id: Some(450),
            map_id: None,
            game_mode: Some("ARAM".to_string()),
            is_custom_game: None,
            member_count: Some(10),
            updated_at: 1,
        };
        let first = tracker.observe(1, &GameflowPhase::Lobby, &Some(lobby.clone()), &None, &None);
        assert!(first.context.is_some());
        let first_key = first.context.unwrap().session_key;

        tracker.observe(1, &GameflowPhase::EndOfGame, &None, &None, &None);
        let second = tracker.observe(1, &GameflowPhase::Lobby, &Some(lobby), &None, &None);
        assert!(second.context.is_some());
        assert_ne!(second.context.unwrap().session_key, first_key);
        assert!(second.ended.is_some());
    }

    #[test]
    fn missing_team_data_is_incomplete_and_not_guessed() {
        let champ = ChampionSelectSnapshot {
            game_id: Some("42".to_string()),
            my_team: vec![ChampionSelectPlayer {
                player_id: Some("puuid-a".to_string()),
                champion_id: Some(1),
                team: "my_team".to_string(),
                cell_id: Some(0),
                assigned_position: None,
            }],
            their_team: vec![],
            local_player_cell_id: Some(0),
            complete: false,
            updated_at: 1,
        };
        let mut tracker = GameSessionTracker::new();
        let observation = tracker.observe(
            1,
            &GameflowPhase::ChampSelect,
            &None,
            &Some(champ),
            &Some("42".to_string()),
        );
        let context = observation.context.expect("session");
        assert!(!context.snapshot_complete);
        assert_eq!(context.champion_select.unwrap().their_team.len(), 0);
    }

    #[test]
    fn full_phase_sequence_keeps_one_session_until_next_lobby() {
        let mut tracker = GameSessionTracker::new();
        let lobby = Some(LobbySnapshot {
            lobby_id: Some("lobby-1".to_string()),
            queue_id: Some(450),
            map_id: None,
            game_mode: Some("ARAM".to_string()),
            is_custom_game: None,
            member_count: Some(10),
            updated_at: 1,
        });
        let phases = [
            GameflowPhase::Lobby,
            GameflowPhase::Matchmaking,
            GameflowPhase::ReadyCheck,
            GameflowPhase::ChampSelect,
            GameflowPhase::GameStart,
            GameflowPhase::InProgress,
            GameflowPhase::WaitingForStats,
            GameflowPhase::EndOfGame,
        ];
        let mut first_key = None;
        let game_id = Some("42".to_string());
        for (index, phase) in phases.iter().enumerate() {
            let observation = tracker.observe(
                1,
                phase,
                if index == 0 { &lobby } else { &None },
                &None,
                if index == 4 { &game_id } else { &None },
            );
            let context = observation.context.expect("session");
            if index >= 4 {
                assert_eq!(context.game_id, game_id);
            }
            if let Some(key) = &first_key {
                assert_eq!(&context.session_key, key);
                assert_eq!(context.phase, *phase);
            } else {
                first_key = Some(context.session_key);
            }
        }
        let next = tracker.observe(1, &GameflowPhase::Lobby, &lobby, &None, &None);
        assert!(next.context.is_some());
        assert_ne!(next.context.unwrap().session_key, first_key.unwrap());
        assert!(next.ended.is_some());
    }

    #[test]
    fn entering_in_progress_with_a_changed_game_id_keeps_the_opening_session() {
        let mut tracker = GameSessionTracker::new();
        let select = tracker
            .observe(
                1,
                &GameflowPhase::ChampSelect,
                &None,
                &None,
                &Some("41".into()),
            )
            .context
            .unwrap();
        let started = tracker.observe(
            1,
            &GameflowPhase::InProgress,
            &None,
            &None,
            &Some("42".into()),
        );
        assert!(started.ended.is_none());
        let game = started.context.unwrap();
        assert_eq!(game.session_key, select.session_key);
        assert_eq!(game.game_id.as_deref(), Some("42"));
        assert!(game.opening_observed.is_some());
    }

    #[test]
    fn connection_generation_change_resets_session() {
        let mut tracker = GameSessionTracker::new();
        let lobby = Some(LobbySnapshot {
            lobby_id: Some("lobby-1".to_string()),
            queue_id: Some(450),
            map_id: None,
            game_mode: Some("ARAM".to_string()),
            is_custom_game: None,
            member_count: None,
            updated_at: 1,
        });
        let first = tracker.observe(1, &GameflowPhase::Lobby, &lobby, &None, &None);
        let first_key = first.context.unwrap().session_key;
        let second = tracker.observe(2, &GameflowPhase::Lobby, &lobby, &None, &None);
        assert_ne!(second.context.unwrap().session_key, first_key);
        assert!(second.ended.is_some());
    }

    #[test]
    fn same_observation_does_not_emit_a_new_session_version() {
        let mut tracker = GameSessionTracker::new();
        let lobby = LobbySnapshot {
            lobby_id: Some("lobby-1".to_string()),
            queue_id: Some(450),
            map_id: None,
            game_mode: Some("ARAM".to_string()),
            is_custom_game: None,
            member_count: Some(5),
            updated_at: 1,
        };
        let first = tracker.observe(1, &GameflowPhase::Lobby, &Some(lobby.clone()), &None, &None);
        let second = tracker.observe(1, &GameflowPhase::Lobby, &Some(lobby), &None, &None);
        assert_eq!(first.context, second.context);
    }

    #[test]
    fn repeated_terminal_phase_preserves_session_and_revision() {
        for phase in [GameflowPhase::EndOfGame, GameflowPhase::TerminatedInError] {
            let mut machine = GameflowMachine::new(LcuSourceKind::Real, false);
            let reading = GameflowReading {
                raw_phase: phase.as_raw().to_string(),
                phase,
                lobby: None,
                champion_select: None,
                game_id: Some("42".to_string()),
                game: None,
            };
            let first = machine.observe(1, reading.clone(), GameflowTransport::Polling);
            let repeated = machine.observe(1, reading, GameflowTransport::Polling);
            assert_eq!(first.current, repeated.current);
            assert!(repeated.session_ended.is_none());
        }
    }
    #[test]
    fn mode_survives_stages_but_never_crosses_sessions_or_generations() {
        let mut machine = GameflowMachine::new(LcuSourceKind::Real, false);
        let lobby = LobbySnapshot {
            lobby_id: Some("room".into()),
            queue_id: Some(2400),
            map_id: Some(12),
            game_mode: Some("ARAM".into()),
            is_custom_game: Some(false),
            member_count: Some(3),
            updated_at: 1,
        };
        let reading = |phase: GameflowPhase, game_id: Option<&str>| GameflowReading {
            raw_phase: phase.as_raw().to_string(),
            phase,
            lobby: None,
            champion_select: None,
            game_id: game_id.map(str::to_owned),
            game: None,
        };
        let mut first = reading(GameflowPhase::Lobby, None);
        first.lobby = Some(lobby.clone());
        let start = machine.observe(1, first, GameflowTransport::Polling);
        let key = start.current.session.unwrap().session_key;
        for phase in [
            GameflowPhase::Matchmaking,
            GameflowPhase::ReadyCheck,
            GameflowPhase::ChampSelect,
        ] {
            let current = machine
                .observe(1, reading(phase, None), GameflowTransport::Polling)
                .current;
            let session = current.session.unwrap();
            assert_eq!(session.session_key, key);
            assert!(session.lobby.is_none());
            assert_eq!(session.mode_context.as_ref().unwrap().map_id, Some(12));
            assert_eq!(session.mode_context.unwrap().queue_id, Some(2400));
        }
        let mut started = reading(GameflowPhase::GameStart, Some("42"));
        started.game = Some(LobbySnapshot {
            queue_id: Some(450),
            map_id: None,
            ..lobby
        });
        let session = machine
            .observe(1, started, GameflowTransport::Websocket)
            .current
            .session
            .unwrap();
        assert_eq!(session.session_key, key);
        assert_eq!(session.mode_context.as_ref().unwrap().queue_id, Some(450));
        assert_eq!(session.mode_context.as_ref().unwrap().map_id, None);
        assert_eq!(session.mode_context.unwrap().source, ModeSource::Gameflow);
        for phase in [
            GameflowPhase::InProgress,
            GameflowPhase::Reconnect,
            GameflowPhase::WaitingForStats,
            GameflowPhase::EndOfGame,
        ] {
            let session = machine
                .observe(1, reading(phase, Some("42")), GameflowTransport::Polling)
                .current
                .session
                .unwrap();
            assert_eq!(session.mode_context.unwrap().queue_id, Some(450));
        }
        let next = machine.observe(
            1,
            reading(GameflowPhase::Lobby, None),
            GameflowTransport::Polling,
        );
        assert!(next.current.session.unwrap().mode_context.is_none());
        let changed = machine.observe(
            2,
            reading(GameflowPhase::InProgress, Some("42")),
            GameflowTransport::Polling,
        );
        assert!(changed.current.session.unwrap().mode_context.is_none());
        let none = machine.observe(
            2,
            reading(GameflowPhase::None, None),
            GameflowTransport::Polling,
        );
        assert!(none.current.session.is_none());
    }

    #[test]
    fn mode_rejects_invalid_queues_and_does_not_infer_from_game_mode() {
        let mut metadata = LobbySnapshot {
            lobby_id: None,
            queue_id: None,
            map_id: None,
            game_mode: Some("ARAM".into()),
            is_custom_game: None,
            member_count: Some(10),
            updated_at: 1,
        };
        for queue in [None, Some(-1), Some(i64::MAX)] {
            metadata.queue_id = queue;
            assert!(ModeContext::from_snapshot(&metadata, ModeSource::Lobby).is_none());
        }
        metadata.is_custom_game = Some(true);
        let mode = ModeContext::from_snapshot(&metadata, ModeSource::Gameflow).unwrap();
        assert_eq!(mode.queue_id, None);
        assert_eq!(mode.is_custom_game, Some(true));
    }
}
