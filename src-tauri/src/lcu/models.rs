use serde::Serialize;
use std::time::{SystemTime, UNIX_EPOCH};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum LcuStatus {
    UnsupportedPlatform,
    NotRunning,
    Discovering,
    Connecting,
    Connected,
    Disconnected,
    Reconnecting,
    Error,
}

/// Source provenance shown to the frontend. `mock` is frontend-only; Rust emits real/unavailable.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum LcuSourceKind {
    Real,
    Unavailable,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LcuStatusDto {
    pub status: LcuStatus,
    pub code: Option<String>,
    pub message: Option<String>,
    pub source: LcuSourceKind,
    pub simulated: bool,
    pub revision: u64,
    pub updated_at: u64,
    pub monitoring: bool,
}

impl LcuStatusDto {
    pub fn initial(status: LcuStatus, source: LcuSourceKind, simulated: bool) -> Self {
        Self {
            status,
            code: None,
            message: None,
            source,
            simulated,
            revision: 1,
            updated_at: now_ms(),
            monitoring: false,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct StatusUpdate {
    pub status: LcuStatus,
    pub code: Option<String>,
    pub message: Option<String>,
    pub monitoring: bool,
}

impl StatusUpdate {
    pub fn new(status: LcuStatus) -> Self {
        Self {
            status,
            code: None,
            message: None,
            monitoring: true,
        }
    }

    pub fn with_code(status: LcuStatus, code: impl Into<String>) -> Self {
        Self {
            status,
            code: Some(code.into()),
            message: None,
            monitoring: true,
        }
    }

    pub fn without_monitoring(mut self) -> Self {
        self.monitoring = false;
        self
    }

    pub fn stopped() -> Self {
        Self {
            status: LcuStatus::NotRunning,
            code: Some("monitoring_stopped".to_string()),
            message: None,
            monitoring: false,
        }
    }
}

pub fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis().min(u128::from(u64::MAX)) as u64)
        .unwrap_or(0)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn initial_status_has_revision_and_timestamp() {
        let status = LcuStatusDto::initial(LcuStatus::NotRunning, LcuSourceKind::Real, false);
        assert_eq!(status.status, LcuStatus::NotRunning);
        assert_eq!(status.revision, 1);
        assert!(status.updated_at > 0);
        assert!(!status.monitoring);
    }

    #[test]
    fn status_serializes_snake_case_and_camel_case_without_secrets() {
        let status = LcuStatusDto {
            status: LcuStatus::Connected,
            code: None,
            message: None,
            source: LcuSourceKind::Real,
            simulated: false,
            revision: 7,
            updated_at: 123,
            monitoring: true,
        };
        let json = serde_json::to_value(&status).expect("serialize status");
        assert_eq!(json["status"], "connected");
        assert_eq!(json["source"], "real");
        assert_eq!(json["revision"], 7);
        assert!(json.get("updatedAt").is_some());
        assert!(json.get("password").is_none());
        assert!(json.get("authorization").is_none());
    }
}
