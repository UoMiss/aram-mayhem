//! Opt-in ready-check acceptance. No arbitrary write path is exposed to the WebView.
use crate::lcu::{discovery::LcuClient, error::LcuError, gameflow::GameflowPhase};
use async_trait::async_trait;
use serde_json::Value;
use std::sync::atomic::{AtomicU64, Ordering};

#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "snake_case")]
pub enum ReadyCheckStatus {
    Waiting,
    Accepting,
    Accepted,
    Declined,
    Failed,
}

/// Read client confirmation independently of the automatic acceptance preference.
pub async fn read_ready_status(
    source: &impl ReadyCheckSource,
    client: &LcuClient,
    account: &str,
) -> Result<Option<ReadyCheckStatus>, LcuError> {
    let Some(value) = source.ready_check(client).await? else {
        return Ok(None);
    };
    if value.get("state").and_then(Value::as_str) != Some("InProgress") {
        return Ok(None);
    }
    let status = match value.get("playerResponse").and_then(Value::as_str) {
        Some("None") => Some(ReadyCheckStatus::Waiting),
        Some("Accepted") => Some(ReadyCheckStatus::Accepted),
        Some("Declined") => Some(ReadyCheckStatus::Declined),
        _ => None,
    };
    if source.current_phase(client).await? != "ReadyCheck"
        || source.current_account(client).await? != account
    {
        return Ok(None);
    }
    Ok(status)
}

#[derive(Default)]
pub struct AutoAcceptControl {
    state: AtomicU64,
}
impl AutoAcceptControl {
    pub fn set_enabled(&self, enabled: bool) {
        let mut old = self.state.load(Ordering::SeqCst);
        loop {
            let next = (old.wrapping_add(2) & !1) | u64::from(enabled);
            match self
                .state
                .compare_exchange(old, next, Ordering::SeqCst, Ordering::SeqCst)
            {
                Ok(_) => break,
                Err(current) => old = current,
            }
        }
    }
    pub fn token(&self) -> Option<u64> {
        let value = self.state.load(Ordering::SeqCst);
        (value & 1 == 1).then_some(value)
    }
    pub fn is_current(&self, token: u64) -> bool {
        self.token() == Some(token)
    }
}

#[derive(Debug, PartialEq, Eq)]
pub enum AcceptOutcome {
    Submitted,
    AlreadyAnswered,
    Unavailable,
    Cancelled,
}

#[async_trait]
pub trait ReadyCheckSource: Send + Sync {
    async fn ready_check(&self, client: &LcuClient) -> Result<Option<Value>, LcuError>;
    async fn current_account(&self, client: &LcuClient) -> Result<String, LcuError>;
    async fn current_phase(&self, client: &LcuClient) -> Result<String, LcuError>;
    async fn accept(&self, client: &LcuClient) -> Result<(), LcuError>;
}

pub async fn accept_pending(
    source: &impl ReadyCheckSource,
    client: &LcuClient,
    account: &str,
    control: &AutoAcceptControl,
    token: u64,
) -> Result<AcceptOutcome, LcuError> {
    if !control.is_current(token) {
        return Ok(AcceptOutcome::Cancelled);
    }
    let Some(value) = source.ready_check(client).await? else {
        return Ok(AcceptOutcome::Unavailable);
    };
    if value.get("state").and_then(Value::as_str) != Some("InProgress") {
        return Ok(AcceptOutcome::Unavailable);
    }
    match value.get("playerResponse").and_then(Value::as_str) {
        Some("Accepted" | "Declined") => return Ok(AcceptOutcome::AlreadyAnswered),
        Some("None") => {}
        _ => return Ok(AcceptOutcome::Unavailable),
    }
    if source.current_phase(client).await? != "ReadyCheck"
        || source.current_account(client).await? != account
        || !control.is_current(token)
    {
        return Ok(AcceptOutcome::Cancelled);
    }
    source.accept(client).await?;
    Ok(AcceptOutcome::Submitted)
}

/// At most three checks per observed ReadyCheck phase; a POST is never retried.
#[derive(Default)]
pub struct AutoAcceptRound {
    scope: Option<(u64, String)>,
    checks: u8,
    finished: bool,
}
impl AutoAcceptRound {
    pub fn begin(
        &mut self,
        phase: &GameflowPhase,
        generation: u64,
        account: &str,
        control: &AutoAcceptControl,
    ) -> Option<u64> {
        let scope = (generation, account.to_owned());
        if *phase != GameflowPhase::ReadyCheck || self.scope.as_ref() != Some(&scope) {
            self.checks = 0;
            self.finished = false;
            self.scope = Some(scope);
        }
        if *phase != GameflowPhase::ReadyCheck || self.finished || self.checks >= 3 {
            return None;
        }
        let token = control.token()?;
        self.checks += 1;
        Some(token)
    }
    pub fn complete(&mut self, result: &Result<AcceptOutcome, LcuError>) {
        // A transport error could follow a successful POST. Let the user handle
        // the remainder of this check instead of submitting it repeatedly.
        self.finished = !matches!(
            result,
            Ok(AcceptOutcome::Unavailable | AcceptOutcome::Cancelled)
        );
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::lcu::{discovery::LcuLockfile, error::LcuErrorCode};
    use serde_json::json;
    use std::sync::atomic::AtomicUsize;

    struct Source<'a> {
        value: Option<Value>,
        account: &'a str,
        phase: &'a str,
        disable: Option<&'a AutoAcceptControl>,
        posts: AtomicUsize,
    }
    impl Default for Source<'_> {
        fn default() -> Self {
            Self {
                value: Some(json!({"state":"InProgress","playerResponse":"None"})),
                account: "account-a",
                phase: "ReadyCheck",
                disable: None,
                posts: AtomicUsize::new(0),
            }
        }
    }
    #[async_trait]
    impl ReadyCheckSource for Source<'_> {
        async fn ready_check(&self, _: &LcuClient) -> Result<Option<Value>, LcuError> {
            Ok(self.value.clone())
        }
        async fn current_account(&self, _: &LcuClient) -> Result<String, LcuError> {
            if let Some(control) = self.disable {
                control.set_enabled(false);
            }
            Ok(self.account.into())
        }
        async fn current_phase(&self, _: &LcuClient) -> Result<String, LcuError> {
            Ok(self.phase.into())
        }
        async fn accept(&self, _: &LcuClient) -> Result<(), LcuError> {
            self.posts.fetch_add(1, Ordering::SeqCst);
            Ok(())
        }
    }
    fn client() -> LcuClient {
        LcuClient::from_lockfile(LcuLockfile::parse("LeagueClientUx:42:12345:test:https").unwrap())
            .unwrap()
    }
    #[test]
    fn disabled_by_default_and_toggling_invalidates_old_tokens() {
        let control = AutoAcceptControl::default();
        assert_eq!(control.token(), None);
        control.set_enabled(true);
        let old = control.token().unwrap();
        control.set_enabled(false);
        assert!(!control.is_current(old));
        control.set_enabled(true);
        assert!(!control.is_current(old));
    }

    #[tokio::test]
    async fn response_feedback_is_account_bound_and_does_not_submit() {
        for (account, phase, response, expected) in [
            (
                "account-a",
                "ReadyCheck",
                "None",
                Some(ReadyCheckStatus::Waiting),
            ),
            (
                "account-a",
                "ReadyCheck",
                "Accepted",
                Some(ReadyCheckStatus::Accepted),
            ),
            (
                "account-a",
                "ReadyCheck",
                "Declined",
                Some(ReadyCheckStatus::Declined),
            ),
            ("account-a", "ReadyCheck", "unknown", None),
            ("account-b", "ReadyCheck", "Accepted", None),
            ("account-a", "ChampSelect", "Accepted", None),
        ] {
            let source = Source {
                account,
                phase,
                value: Some(json!({"state":"InProgress","playerResponse":response})),
                ..Source::default()
            };
            assert_eq!(
                read_ready_status(&source, &client(), "account-a")
                    .await
                    .unwrap(),
                expected
            );
            assert_eq!(source.posts.load(Ordering::SeqCst), 0);
        }
    }
    #[tokio::test]
    async fn only_an_unanswered_active_ready_check_is_accepted() {
        let control = AutoAcceptControl::default();
        control.set_enabled(true);
        let token = control.token().unwrap();
        for (value, expected) in [
            (None, AcceptOutcome::Unavailable),
            (
                Some(json!({"state":"Invalid","playerResponse":"None"})),
                AcceptOutcome::Unavailable,
            ),
            (
                Some(json!({"state":"InProgress"})),
                AcceptOutcome::Unavailable,
            ),
            (
                Some(json!({"state":"InProgress","playerResponse":"Accepted"})),
                AcceptOutcome::AlreadyAnswered,
            ),
            (
                Some(json!({"state":"InProgress","playerResponse":"Declined"})),
                AcceptOutcome::AlreadyAnswered,
            ),
            (
                Some(json!({"state":"InProgress","playerResponse":"None"})),
                AcceptOutcome::Submitted,
            ),
        ] {
            let source = Source {
                value,
                ..Source::default()
            };
            let expected_posts = usize::from(expected == AcceptOutcome::Submitted);
            assert_eq!(
                accept_pending(&source, &client(), "account-a", &control, token)
                    .await
                    .unwrap(),
                expected
            );
            assert_eq!(source.posts.load(Ordering::SeqCst), expected_posts);
        }
    }
    #[tokio::test]
    async fn changed_account_phase_or_switch_cancels_before_post() {
        for case in 0..4 {
            let control = AutoAcceptControl::default();
            control.set_enabled(true);
            let token = control.token().unwrap();
            let source = match case {
                0 => Source {
                    account: "account-b",
                    ..Source::default()
                },
                1 => Source {
                    phase: "ChampSelect",
                    ..Source::default()
                },
                2 => Source {
                    disable: Some(&control),
                    ..Source::default()
                },
                _ => {
                    control.set_enabled(false);
                    Source::default()
                }
            };
            assert_eq!(
                accept_pending(&source, &client(), "account-a", &control, token)
                    .await
                    .unwrap(),
                AcceptOutcome::Cancelled
            );
            assert_eq!(source.posts.load(Ordering::SeqCst), 0);
        }
    }
    #[test]
    fn accepts_once_per_round_and_never_retries_an_ambiguous_post() {
        let control = AutoAcceptControl::default();
        let mut round = AutoAcceptRound::default();
        assert_eq!(
            round.begin(&GameflowPhase::ReadyCheck, 1, "a", &control),
            None
        );
        control.set_enabled(true);
        assert!(
            round
                .begin(&GameflowPhase::ReadyCheck, 1, "a", &control)
                .is_some()
        );
        round.complete(&Ok(AcceptOutcome::Submitted));
        assert_eq!(
            round.begin(&GameflowPhase::ReadyCheck, 1, "a", &control),
            None
        );
        control.set_enabled(false);
        control.set_enabled(true);
        assert_eq!(
            round.begin(&GameflowPhase::ReadyCheck, 1, "a", &control),
            None
        );
        assert_eq!(
            round.begin(&GameflowPhase::Matchmaking, 1, "a", &control),
            None
        );
        assert!(
            round
                .begin(&GameflowPhase::ReadyCheck, 1, "a", &control)
                .is_some()
        );
        round.complete(&Err(LcuError::new(LcuErrorCode::Timeout, "timeout")));
        assert_eq!(
            round.begin(&GameflowPhase::ReadyCheck, 1, "a", &control),
            None
        );
        assert!(
            round
                .begin(&GameflowPhase::ReadyCheck, 2, "b", &control)
                .is_some()
        );
    }
    #[test]
    fn retries_missing_data_with_a_bounded_check_count() {
        let control = AutoAcceptControl::default();
        control.set_enabled(true);
        let mut round = AutoAcceptRound::default();
        for _ in 0..3 {
            assert!(
                round
                    .begin(&GameflowPhase::ReadyCheck, 1, "a", &control)
                    .is_some()
            );
            round.complete(&Ok(AcceptOutcome::Unavailable));
        }
        assert_eq!(
            round.begin(&GameflowPhase::ReadyCheck, 1, "a", &control),
            None
        );
    }
}
