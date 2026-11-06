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
    pub game_mode: Option<String>,
    pub member_count: Option<u32>,
    pub updated_at: u64,
}

impl LobbySnapshot {
    fn same_data(&self, other: &Self) -> bool {
        self.lobby_id == other.lobby_id
            && self.queue_id == other.queue_id
            && self.game_mode == other.game_mode
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
#[serde(rename_all = "camelCase")]
pub struct GameSessionContext {
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

pub struct GameflowMachine {
    snapshot: GameflowSnapshot,
    tracker: GameSessionTracker,
}

impl GameflowMachine {
    pub fn new(source: LcuSourceKind, simulated: bool) -> Self {
        Self {
            snapshot: GameflowSnapshot::initial(source, simulated),
            tracker: GameSessionTracker::new(),
        }
    }

    pub fn snapshot(&self) -> GameflowSnapshot {
        self.snapshot.clone()
    }

    pub fn observe(
        &mut self,
        generation: u64,
        reading: GameflowReading,
        transport: GameflowTransport,
    ) -> GameflowChanges {
        let previous = self.snapshot.clone();
        let mut observation = self.tracker.observe(
            generation,
            &reading.phase,
            &reading.lobby,
            &reading.champion_select,
            &reading.game_id,
        );
        if let Some(context) = observation.context.as_mut() {
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
        }
        let mut next = previous.clone();
        next.connected = true;
        next.phase = Some(reading.phase);
        next.raw_phase = Some(reading.raw_phase);
        next.transport = transport;
        next.session = observation.context;
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

    pub fn disconnected(
        &mut self,
        code: impl Into<String>,
        message: impl Into<String>,
    ) -> GameflowChanges {
        let previous = self.snapshot.clone();
        let ended = self.tracker.disconnect();
        let mut next = previous.clone();
        next.connected = false;
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
            game_mode: Some("ARAM".to_string()),
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
            game_mode: Some("ARAM".to_string()),
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
            game_mode: Some("ARAM".to_string()),
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
            game_mode: Some("ARAM".to_string()),
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
}
