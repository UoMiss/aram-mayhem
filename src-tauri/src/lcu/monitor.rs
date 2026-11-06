#[cfg(windows)]
use crate::lcu::client::LcuHttpClient;
use crate::lcu::connection::ConnectionMachine;
use crate::lcu::discovery::{LcuClient, discover};
use crate::lcu::error::LcuError;
use crate::lcu::models::{LcuSourceKind, LcuStatus, LcuStatusDto, StatusUpdate};
use async_trait::async_trait;
use std::sync::{
    Arc, Mutex, MutexGuard,
    atomic::{AtomicBool, Ordering},
};
use std::time::Duration;
use tokio::sync::{Notify, watch};
use tokio::task::JoinHandle;
use tokio::time::sleep;

#[derive(Debug, Clone, Copy)]
pub struct MonitorConfig {
    pub poll_interval: Duration,
    pub retry_initial: Duration,
    pub retry_max: Duration,
}

impl Default for MonitorConfig {
    fn default() -> Self {
        Self {
            poll_interval: Duration::from_secs(2),
            retry_initial: Duration::from_millis(500),
            retry_max: Duration::from_secs(5),
        }
    }
}

/// Injectable boundary used by both the real Windows discovery/HTTP stack and tests.
#[async_trait]
pub trait LcuSource: Send + Sync + 'static {
    async fn discover(&self) -> Result<Option<LcuClient>, LcuError>;
    async fn probe(&self, client: &LcuClient) -> Result<(), LcuError>;
}

pub type StatusCallback = Arc<dyn Fn(LcuStatusDto) + Send + Sync>;

struct MonitorHandle {
    cancel: watch::Sender<bool>,
    join: JoinHandle<()>,
    callback: StatusCallback,
}

pub struct LcuManager<S: LcuSource> {
    source: Arc<S>,
    machine: Arc<Mutex<ConnectionMachine>>,
    monitor: Arc<Mutex<Option<MonitorHandle>>>,
    wake: Arc<Notify>,
    auto_retry: Arc<AtomicBool>,
    config: MonitorConfig,
}

impl<S: LcuSource> LcuManager<S> {
    pub fn new(
        source: Arc<S>,
        source_kind: LcuSourceKind,
        initial_status: LcuStatus,
        config: MonitorConfig,
    ) -> Self {
        Self {
            source,
            machine: Arc::new(Mutex::new(ConnectionMachine::new(
                initial_status,
                source_kind,
                false,
            ))),
            monitor: Arc::new(Mutex::new(None)),
            wake: Arc::new(Notify::new()),
            auto_retry: Arc::new(AtomicBool::new(true)),
            config,
        }
    }

    pub fn set_auto_retry(&self, enabled: bool) {
        if !self.auto_retry.swap(enabled, Ordering::Relaxed) && enabled {
            self.wake.notify_one();
        }
    }

    pub fn status(&self) -> LcuStatusDto {
        lock(&self.machine).snapshot()
    }

    #[cfg(test)]
    pub fn is_monitoring(&self) -> bool {
        lock(&self.monitor).is_some()
    }

    /// Starts one background monitor, or wakes the existing task for a manual retry.
    pub fn start_monitoring(&self, callback: StatusCallback) -> LcuStatusDto {
        let mut monitor = lock(&self.monitor);
        if monitor.is_some() {
            self.wake.notify_one();
            return self.status();
        }

        if self.status().status == LcuStatus::UnsupportedPlatform {
            return self.status();
        }

        let (generation, initial_event) = {
            let mut machine = lock(&self.machine);
            let generation = machine.bump_generation();
            (
                generation,
                machine.transition(StatusUpdate::new(LcuStatus::Discovering)),
            )
        };

        let (cancel, cancel_rx) = watch::channel(false);
        let source = Arc::clone(&self.source);
        let machine = Arc::clone(&self.machine);
        let callback_for_task = Arc::clone(&callback);
        let config = self.config;
        let wake = Arc::clone(&self.wake);
        let auto_retry = Arc::clone(&self.auto_retry);
        let join = tokio::spawn(async move {
            run_monitor(
                source,
                machine,
                generation,
                cancel_rx,
                config,
                callback_for_task,
                wake,
                auto_retry,
            )
            .await;
        });

        *monitor = Some(MonitorHandle {
            cancel,
            join,
            callback: Arc::clone(&callback),
        });
        drop(monitor);

        if let Some(status) = initial_event {
            callback(status);
        }
        self.status()
    }

    /// Cancels and awaits the monitor. A concurrent new start cannot be overwritten.
    pub async fn stop_monitoring(&self) -> LcuStatusDto {
        let (handle, stop_generation) = {
            let mut monitor = lock(&self.monitor);
            let Some(handle) = monitor.take() else {
                return self.status();
            };
            let mut machine = lock(&self.machine);
            (handle, machine.bump_generation())
        };

        let _ = handle.cancel.send(true);
        let _ = handle.join.await;

        let update = {
            let mut machine = lock(&self.machine);
            if machine.is_current(stop_generation) {
                machine.transition(StatusUpdate::stopped())
            } else {
                None
            }
        };
        if let Some(status) = update {
            (handle.callback)(status);
        }
        self.status()
    }

    /// Application-exit cleanup: no await, abort the task and invalidate its generation.
    pub fn shutdown(&self) {
        let handle = {
            let mut monitor = lock(&self.monitor);
            monitor.take()
        };
        if let Some(handle) = handle {
            {
                let mut machine = lock(&self.machine);
                machine.bump_generation();
            }
            let _ = handle.cancel.send(true);
            handle.join.abort();
        }
    }

    #[cfg(test)]
    fn apply_status(
        &self,
        generation: u64,
        update: StatusUpdate,
        callback: &StatusCallback,
    ) -> Option<LcuStatusDto> {
        let changed = {
            let mut machine = lock(&self.machine);
            if machine.is_current(generation) {
                machine.transition(update)
            } else {
                None
            }
        };
        if let Some(status) = &changed {
            callback(status.clone());
        }
        changed
    }
}

fn lock<T>(mutex: &Mutex<T>) -> MutexGuard<'_, T> {
    mutex
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
}

fn status_for_error(error: &LcuError) -> StatusUpdate {
    match error.code.as_str() {
        "authentication_failed"
        | "invalid_response"
        | "invalid_lockfile"
        | "discovery_failed"
        | "internal" => StatusUpdate::with_code(LcuStatus::Error, error.code.clone()),
        "connection_refused" | "timeout" | "tls_error" | "http_status" => {
            StatusUpdate::with_code(LcuStatus::Disconnected, error.code.clone())
        }
        _ => StatusUpdate::with_code(LcuStatus::Error, error.code.clone()),
    }
}

async fn run_monitor<S: LcuSource>(
    source: Arc<S>,
    machine: Arc<Mutex<ConnectionMachine>>,
    generation: u64,
    mut cancel: watch::Receiver<bool>,
    config: MonitorConfig,
    callback: StatusCallback,
    wake: Arc<Notify>,
    auto_retry: Arc<AtomicBool>,
) {
    let manager = LcuManagerRef {
        machine: Arc::clone(&machine),
        generation,
        callback,
    };
    let mut retry = config.retry_initial;
    let mut last_fingerprint: Option<String> = None;
    let mut retrying = false;

    loop {
        if *cancel.borrow() {
            break;
        }

        if retrying {
            let current = lock(&machine).status();
            if matches!(current, LcuStatus::Disconnected | LcuStatus::Error) {
                manager.apply(StatusUpdate::with_code(
                    LcuStatus::Reconnecting,
                    "reconnecting",
                ));
            }
            retrying = false;
        }

        let discovery = tokio::select! {
            _ = cancel.changed() => break,
            result = source.discover() => result,
        };

        let mut should_stop = false;
        match discovery {
            Ok(None) => {
                let was_connected = lock(&machine).status() == LcuStatus::Connected;
                last_fingerprint = None;
                let update = if was_connected {
                    StatusUpdate::with_code(LcuStatus::Disconnected, "client_exited")
                } else {
                    StatusUpdate::with_code(LcuStatus::NotRunning, "client_not_found")
                };
                manager.apply(update);
            }
            Ok(Some(client)) => {
                let fingerprint = client.fingerprint();
                let current = lock(&machine).status();
                if last_fingerprint.as_deref() != Some(fingerprint.as_str())
                    || current != LcuStatus::Connected
                {
                    manager.apply(StatusUpdate::new(LcuStatus::Connecting));
                }
                last_fingerprint = Some(fingerprint);

                let probe = tokio::select! {
                    _ = cancel.changed() => break,
                    result = source.probe(&client) => result,
                };
                match probe {
                    Ok(()) => {
                        retry = config.retry_initial;
                        manager.apply(StatusUpdate::new(LcuStatus::Connected));
                    }
                    Err(error) if error.is_unsupported() => {
                        manager.apply(
                            StatusUpdate::with_code(LcuStatus::UnsupportedPlatform, error.code)
                                .without_monitoring(),
                        );
                        should_stop = true;
                    }
                    Err(error) => {
                        retrying = true;
                        manager.apply(status_for_error(&error));
                    }
                }
            }
            Err(error) if error.is_unsupported() => {
                manager.apply(
                    StatusUpdate::with_code(LcuStatus::UnsupportedPlatform, error.code)
                        .without_monitoring(),
                );
                should_stop = true;
            }
            Err(error) => {
                retrying = true;
                manager.apply(status_for_error(&error));
            }
        }

        if should_stop || *cancel.borrow() {
            break;
        }

        let connected = lock(&machine).status() == LcuStatus::Connected;
        let delay = if connected {
            config.poll_interval
        } else {
            retry
        };
        let refreshed = tokio::select! {
            _ = sleep(delay), if connected || auto_retry.load(Ordering::Relaxed) => false,
            _ = wake.notified() => true,
            _ = cancel.changed() => break,
        };
        if !refreshed && !connected && !auto_retry.load(Ordering::Relaxed) {
            tokio::select! {
                _ = wake.notified() => {}
                _ = cancel.changed() => break,
            }
        }
        retry = if connected || refreshed {
            config.retry_initial
        } else {
            (retry * 2).min(config.retry_max)
        };
    }
}

/// Small helper so the monitor loop cannot accidentally bypass the generation check.
struct LcuManagerRef {
    machine: Arc<Mutex<ConnectionMachine>>,
    generation: u64,
    callback: StatusCallback,
}

impl LcuManagerRef {
    fn apply(&self, update: StatusUpdate) {
        let changed = {
            let mut machine = lock(&self.machine);
            if machine.is_current(self.generation) {
                machine.transition(update)
            } else {
                None
            }
        };
        if let Some(status) = changed {
            println!(
                "[lcu_status] status={:?} source={:?} code={:?} monitoring={}",
                status.status, status.source, status.code, status.monitoring
            );
            (self.callback)(status);
        }
    }
}

/// Production source. On non-Windows it fails explicitly before any network request.
pub struct SystemLcuSource;

#[async_trait]
impl LcuSource for SystemLcuSource {
    async fn discover(&self) -> Result<Option<LcuClient>, LcuError> {
        discover()
    }

    async fn probe(&self, client: &LcuClient) -> Result<(), LcuError> {
        #[cfg(windows)]
        {
            let http = LcuHttpClient::new()?;
            http.probe(client).await
        }
        #[cfg(not(windows))]
        {
            let _ = client;
            Err(LcuError::unsupported_platform())
        }
    }
}

pub type SystemLcuManager = LcuManager<SystemLcuSource>;

impl SystemLcuManager {
    pub fn system() -> Self {
        let source = Arc::new(SystemLcuSource);
        let (status, source_kind) = if cfg!(windows) {
            (LcuStatus::NotRunning, LcuSourceKind::Real)
        } else {
            (LcuStatus::UnsupportedPlatform, LcuSourceKind::Unavailable)
        };
        Self::new(source, source_kind, status, MonitorConfig::default())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::lcu::discovery::LcuLockfile;
    use crate::lcu::error::LcuErrorCode;
    use std::collections::VecDeque;
    use std::sync::atomic::{AtomicUsize, Ordering};
    use tokio::sync::mpsc;

    struct FakeSource {
        discoveries: Mutex<VecDeque<Result<Option<LcuClient>, LcuError>>>,
        probes: Mutex<VecDeque<Result<(), LcuError>>>,
        default_client: Mutex<Option<LcuClient>>,
        discovery_calls: AtomicUsize,
        probe_calls: AtomicUsize,
    }

    impl FakeSource {
        fn new(
            discoveries: Vec<Result<Option<LcuClient>, LcuError>>,
            probes: Vec<Result<(), LcuError>>,
            default_client: Option<LcuClient>,
        ) -> Self {
            Self {
                discoveries: Mutex::new(discoveries.into()),
                probes: Mutex::new(probes.into()),
                default_client: Mutex::new(default_client),
                discovery_calls: AtomicUsize::new(0),
                probe_calls: AtomicUsize::new(0),
            }
        }
    }

    #[async_trait]
    impl LcuSource for FakeSource {
        async fn discover(&self) -> Result<Option<LcuClient>, LcuError> {
            self.discovery_calls.fetch_add(1, Ordering::SeqCst);
            let mut queue = lock(&self.discoveries);
            if let Some(result) = queue.pop_front() {
                return result;
            }
            Ok(lock(&self.default_client).clone())
        }

        async fn probe(&self, _client: &LcuClient) -> Result<(), LcuError> {
            self.probe_calls.fetch_add(1, Ordering::SeqCst);
            let mut queue = lock(&self.probes);
            queue.pop_front().unwrap_or(Ok(()))
        }
    }

    fn lock<T>(mutex: &Mutex<T>) -> MutexGuard<'_, T> {
        mutex
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
    }

    fn client(port: u16, password: &str) -> LcuClient {
        LcuClient::from_lockfile(
            LcuLockfile::parse(&format!("LeagueClientUx:4242:{port}:{password}:https"))
                .expect("lockfile"),
        )
        .expect("client")
    }

    fn config() -> MonitorConfig {
        MonitorConfig {
            poll_interval: Duration::from_millis(20),
            retry_initial: Duration::from_millis(10),
            retry_max: Duration::from_millis(40),
        }
    }

    fn manager(source: FakeSource) -> LcuManager<FakeSource> {
        LcuManager::new(
            Arc::new(source),
            LcuSourceKind::Real,
            LcuStatus::NotRunning,
            config(),
        )
    }

    fn callback(tx: mpsc::UnboundedSender<LcuStatusDto>) -> StatusCallback {
        Arc::new(move |status| {
            let _ = tx.send(status);
        })
    }

    async fn wait_for(
        rx: &mut mpsc::UnboundedReceiver<LcuStatusDto>,
        predicate: impl Fn(&LcuStatusDto) -> bool,
    ) -> LcuStatusDto {
        tokio::time::timeout(Duration::from_secs(2), async {
            loop {
                let status = rx.recv().await.expect("status channel closed");
                if predicate(&status) {
                    return status;
                }
            }
        })
        .await
        .expect("timed out waiting for status")
    }

    #[tokio::test]
    async fn duplicate_start_does_not_spawn_a_second_task() {
        let source = FakeSource::new(vec![], vec![], None);
        let manager = manager(source);
        let (tx, _rx) = mpsc::unbounded_channel();
        let cb = callback(tx);

        let first = manager.start_monitoring(Arc::clone(&cb));
        let second = manager.start_monitoring(cb);

        assert_eq!(first.status, LcuStatus::Discovering);
        assert_eq!(second.status, first.status);
        assert!(manager.is_monitoring());
        manager.stop_monitoring().await;
    }

    #[tokio::test]
    async fn manual_retry_wakes_monitor_without_waiting_for_backoff() {
        let source = Arc::new(FakeSource::new(vec![], vec![], None));
        let manager = LcuManager::new(
            Arc::clone(&source),
            LcuSourceKind::Real,
            LcuStatus::NotRunning,
            MonitorConfig {
                poll_interval: Duration::from_secs(60),
                retry_initial: Duration::from_secs(60),
                retry_max: Duration::from_secs(60),
            },
        );
        let (tx, mut rx) = mpsc::unbounded_channel();
        let cb = callback(tx);
        manager.start_monitoring(Arc::clone(&cb));
        wait_for(&mut rx, |status| status.status == LcuStatus::NotRunning).await;
        let calls = source.discovery_calls.load(Ordering::SeqCst);
        manager.start_monitoring(cb);
        tokio::time::timeout(Duration::from_secs(1), async {
            while source.discovery_calls.load(Ordering::SeqCst) == calls {
                tokio::task::yield_now().await;
            }
        })
        .await
        .expect("manual retry did not wake the existing monitor");
        assert!(manager.is_monitoring());
        manager.stop_monitoring().await;
    }

    #[tokio::test]
    async fn disabling_auto_retry_pauses_discovery_until_woken() {
        let source = Arc::new(FakeSource::new(vec![], vec![], None));
        let manager = LcuManager::new(
            Arc::clone(&source),
            LcuSourceKind::Real,
            LcuStatus::NotRunning,
            config(),
        );
        manager.set_auto_retry(false);
        let (tx, mut rx) = mpsc::unbounded_channel();
        manager.start_monitoring(callback(tx));
        wait_for(&mut rx, |status| status.status == LcuStatus::NotRunning).await;
        let calls = source.discovery_calls.load(Ordering::SeqCst);
        sleep(Duration::from_millis(35)).await;
        assert_eq!(source.discovery_calls.load(Ordering::SeqCst), calls);
        manager.set_auto_retry(true);
        tokio::time::timeout(Duration::from_secs(1), async {
            while source.discovery_calls.load(Ordering::SeqCst) == calls {
                tokio::task::yield_now().await;
            }
        })
        .await
        .expect("enabling retry wakes discovery");
        manager.stop_monitoring().await;
    }

    #[tokio::test]
    async fn no_client_is_not_running() {
        let manager = manager(FakeSource::new(vec![Ok(None)], vec![], None));
        let (tx, mut rx) = mpsc::unbounded_channel();
        manager.start_monitoring(callback(tx));
        let status = wait_for(&mut rx, |status| status.status == LcuStatus::NotRunning).await;
        assert_eq!(status.code.as_deref(), Some("client_not_found"));
        manager.stop_monitoring().await;
    }

    #[tokio::test]
    async fn normal_connection_is_connected_and_event_has_no_credentials() {
        let source = FakeSource::new(
            vec![Ok(Some(client(51000, "top-secret")))],
            vec![Ok(())],
            None,
        );
        let manager = manager(source);
        let (tx, mut rx) = mpsc::unbounded_channel();
        manager.start_monitoring(callback(tx));
        let status = wait_for(&mut rx, |status| status.status == LcuStatus::Connected).await;

        assert_eq!(status.source, LcuSourceKind::Real);
        assert!(!status.simulated);
        let serialized = serde_json::to_string(&status).expect("serialize status");
        assert!(!serialized.contains("top-secret"));
        assert!(!serialized.contains("authorization"));
        assert!(!serialized.contains("password"));
        manager.stop_monitoring().await;
    }

    #[tokio::test]
    async fn authentication_failure_is_an_error_without_secret() {
        let source = FakeSource::new(
            vec![Ok(Some(client(51001, "top-secret")))],
            vec![Err(LcuError::new(
                LcuErrorCode::AuthenticationFailed,
                "LCU authentication failed",
            ))],
            None,
        );
        let manager = manager(source);
        let (tx, mut rx) = mpsc::unbounded_channel();
        manager.start_monitoring(callback(tx));
        let status = wait_for(&mut rx, |status| status.status == LcuStatus::Error).await;
        assert_eq!(status.code.as_deref(), Some("authentication_failed"));
        assert!(
            !serde_json::to_string(&status)
                .unwrap()
                .contains("top-secret")
        );
        manager.stop_monitoring().await;
    }

    #[tokio::test]
    async fn connection_refused_timeout_and_invalid_response_are_distinct() {
        for (error, expected_status, expected_code) in [
            (
                LcuError::new(
                    LcuErrorCode::ConnectionRefused,
                    "LCU connection was refused",
                ),
                LcuStatus::Disconnected,
                "connection_refused",
            ),
            (
                LcuError::new(LcuErrorCode::Timeout, "LCU request timed out"),
                LcuStatus::Disconnected,
                "timeout",
            ),
            (
                LcuError::new(
                    LcuErrorCode::InvalidResponse,
                    "LCU returned a malformed response",
                ),
                LcuStatus::Error,
                "invalid_response",
            ),
        ] {
            let source =
                FakeSource::new(vec![Ok(Some(client(51002, "pw")))], vec![Err(error)], None);
            let manager = manager(source);
            let (tx, mut rx) = mpsc::unbounded_channel();
            manager.start_monitoring(callback(tx));
            let status = wait_for(&mut rx, |status| {
                status.status == expected_status && status.code.as_deref() == Some(expected_code)
            })
            .await;
            assert_eq!(status.status, expected_status);
            manager.stop_monitoring().await;
        }
    }

    #[tokio::test]
    async fn client_exit_is_disconnected_then_restart_is_connected() {
        let source = FakeSource::new(
            vec![
                Ok(Some(client(51003, "pw"))),
                Ok(None),
                Ok(Some(client(51004, "pw"))),
            ],
            vec![Ok(()), Ok(())],
            None,
        );
        let manager = manager(source);
        let (tx, mut rx) = mpsc::unbounded_channel();
        manager.start_monitoring(callback(tx));
        wait_for(&mut rx, |status| status.status == LcuStatus::Connected).await;
        let disconnected =
            wait_for(&mut rx, |status| status.status == LcuStatus::Disconnected).await;
        assert_eq!(disconnected.code.as_deref(), Some("client_exited"));
        let reconnected = wait_for(&mut rx, |status| status.status == LcuStatus::Connected).await;
        assert!(reconnected.revision > disconnected.revision);
        manager.stop_monitoring().await;
    }

    #[tokio::test]
    async fn stop_cancels_monitor_and_prevents_later_events() {
        let source = FakeSource::new(vec![], vec![], None);
        let manager = manager(source);
        let (tx, mut rx) = mpsc::unbounded_channel();
        manager.start_monitoring(callback(tx));
        let _ = wait_for(&mut rx, |status| status.status == LcuStatus::NotRunning).await;

        let stopped = manager.stop_monitoring().await;
        assert_eq!(stopped.status, LcuStatus::NotRunning);
        assert_eq!(stopped.code.as_deref(), Some("monitoring_stopped"));
        assert!(!manager.is_monitoring());

        let calls_after_stop = manager.status();
        tokio::time::sleep(Duration::from_millis(40)).await;
        assert_eq!(calls_after_stop, manager.status());
    }

    #[tokio::test]
    async fn shutdown_clears_monitor_without_events() {
        let source = FakeSource::new(vec![], vec![], None);
        let manager = manager(source);
        let (tx, mut rx) = mpsc::unbounded_channel();
        manager.start_monitoring(callback(tx));
        let _ = wait_for(&mut rx, |status| status.status == LcuStatus::NotRunning).await;
        manager.shutdown();
        assert!(!manager.is_monitoring());

        let after = manager.status();
        tokio::time::sleep(Duration::from_millis(40)).await;
        assert_eq!(after, manager.status());
    }

    #[test]
    fn old_generation_cannot_overwrite_new_state() {
        let manager = manager(FakeSource::new(vec![], vec![], None));
        let (tx, mut rx) = mpsc::unbounded_channel();
        let cb = callback(tx);

        let old_generation = {
            let mut machine = lock(&manager.machine);
            machine.bump_generation()
        };
        let applied = manager.apply_status(
            old_generation,
            StatusUpdate::new(LcuStatus::Connecting),
            &cb,
        );
        assert!(applied.is_some());

        {
            let mut machine = lock(&manager.machine);
            machine.bump_generation();
        }
        let stale =
            manager.apply_status(old_generation, StatusUpdate::new(LcuStatus::Connected), &cb);
        assert!(stale.is_none());
        assert_eq!(manager.status().status, LcuStatus::Connecting);
        assert!(rx.try_recv().is_ok());
    }

    #[test]
    fn unsupported_platform_does_not_start_monitor() {
        let source = FakeSource::new(vec![], vec![], None);
        let manager = LcuManager::new(
            Arc::new(source),
            LcuSourceKind::Unavailable,
            LcuStatus::UnsupportedPlatform,
            config(),
        );
        let (tx, _rx) = mpsc::unbounded_channel();
        let status = manager.start_monitoring(callback(tx));
        assert_eq!(status.status, LcuStatus::UnsupportedPlatform);
        assert!(!manager.is_monitoring());
    }
}
