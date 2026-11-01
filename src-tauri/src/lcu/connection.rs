use crate::lcu::models::{LcuSourceKind, LcuStatus, LcuStatusDto, StatusUpdate, now_ms};

pub struct ConnectionMachine {
    dto: LcuStatusDto,
    generation: u64,
}

impl ConnectionMachine {
    pub fn new(status: LcuStatus, source: LcuSourceKind, simulated: bool) -> Self {
        Self {
            dto: LcuStatusDto::initial(status, source, simulated),
            generation: 0,
        }
    }

    pub fn snapshot(&self) -> LcuStatusDto {
        self.dto.clone()
    }

    pub fn status(&self) -> LcuStatus {
        self.dto.status
    }

    pub fn bump_generation(&mut self) -> u64 {
        self.generation = self.generation.saturating_add(1);
        self.generation
    }

    pub fn is_current(&self, generation: u64) -> bool {
        self.generation == generation
    }

    /// Returns Some only when the externally observable status actually changed.
    pub fn transition(&mut self, update: StatusUpdate) -> Option<LcuStatusDto> {
        let changed = self.dto.status != update.status
            || self.dto.code != update.code
            || self.dto.message != update.message
            || self.dto.monitoring != update.monitoring;

        if !changed {
            return None;
        }

        self.dto.status = update.status;
        self.dto.code = update.code;
        self.dto.message = update.message;
        self.dto.monitoring = update.monitoring;
        self.dto.revision = self.dto.revision.saturating_add(1);
        self.dto.updated_at = now_ms();
        Some(self.dto.clone())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn same_state_is_suppressed() {
        let mut machine = ConnectionMachine::new(LcuStatus::NotRunning, LcuSourceKind::Real, false);
        machine
            .transition(StatusUpdate::new(LcuStatus::Discovering))
            .expect("start transition");
        assert!(
            machine
                .transition(StatusUpdate::new(LcuStatus::Discovering))
                .is_none()
        );
        assert_eq!(machine.snapshot().revision, 2);
    }

    #[test]
    fn transitions_increment_revision_and_timestamp() {
        let mut machine = ConnectionMachine::new(LcuStatus::NotRunning, LcuSourceKind::Real, false);
        let first = machine
            .transition(StatusUpdate::new(LcuStatus::Discovering))
            .expect("first transition");
        let second = machine
            .transition(StatusUpdate::new(LcuStatus::Connected))
            .expect("second transition");

        assert_eq!(first.revision, 2);
        assert_eq!(second.revision, 3);
        assert!(second.updated_at >= first.updated_at);
        assert_eq!(machine.status(), LcuStatus::Connected);
    }

    #[test]
    fn generation_invalidates_old_results() {
        let mut machine = ConnectionMachine::new(LcuStatus::NotRunning, LcuSourceKind::Real, false);
        let old = machine.bump_generation();
        let new = machine.bump_generation();
        assert!(!machine.is_current(old));
        assert!(machine.is_current(new));
    }
}
