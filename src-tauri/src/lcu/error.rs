use serde::Serialize;

/// Stable, public error codes. Messages must never contain credentials or host stacks.
#[allow(dead_code)]
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum LcuErrorCode {
    UnsupportedPlatform,
    InvalidLockfile,
    DiscoveryFailed,
    AuthenticationFailed,
    ConnectionRefused,
    Timeout,
    TlsError,
    InvalidResponse,
    HttpStatus,
    Cancelled,
    NotLoggedIn,
    AccountChanged,
    Internal,
}

impl LcuErrorCode {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::UnsupportedPlatform => "unsupported_platform",
            Self::InvalidLockfile => "invalid_lockfile",
            Self::DiscoveryFailed => "discovery_failed",
            Self::AuthenticationFailed => "authentication_failed",
            Self::ConnectionRefused => "connection_refused",
            Self::Timeout => "timeout",
            Self::TlsError => "tls_error",
            Self::InvalidResponse => "invalid_response",
            Self::HttpStatus => "http_status",
            Self::Cancelled => "cancelled",
            Self::NotLoggedIn => "not_logged_in",
            Self::AccountChanged => "account_changed",
            Self::Internal => "internal",
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct LcuError {
    pub code: String,
    pub message: String,
}

#[allow(dead_code)]
impl LcuError {
    pub fn new(code: LcuErrorCode, message: impl Into<String>) -> Self {
        Self {
            code: code.as_str().to_string(),
            message: message.into(),
        }
    }

    pub fn unsupported_platform() -> Self {
        Self::new(
            LcuErrorCode::UnsupportedPlatform,
            "LCU discovery is only available on Windows",
        )
    }

    pub fn invalid_lockfile(detail: impl Into<String>) -> Self {
        Self::new(LcuErrorCode::InvalidLockfile, detail)
    }

    pub fn discovery_failed(detail: impl Into<String>) -> Self {
        Self::new(LcuErrorCode::DiscoveryFailed, detail)
    }

    pub fn internal(detail: impl Into<String>) -> Self {
        Self::new(LcuErrorCode::Internal, detail)
    }

    pub fn is_unsupported(&self) -> bool {
        self.code == LcuErrorCode::UnsupportedPlatform.as_str()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn error_codes_are_stable() {
        assert_eq!(
            LcuErrorCode::AuthenticationFailed.as_str(),
            "authentication_failed"
        );
        assert_eq!(
            LcuErrorCode::ConnectionRefused.as_str(),
            "connection_refused"
        );
        assert_eq!(LcuErrorCode::Timeout.as_str(), "timeout");
        assert_eq!(LcuErrorCode::InvalidResponse.as_str(), "invalid_response");
        assert_eq!(
            LcuErrorCode::UnsupportedPlatform.as_str(),
            "unsupported_platform"
        );
    }

    #[test]
    fn error_serialization_has_no_stack_or_secret_fields() {
        let error = LcuError::new(
            LcuErrorCode::AuthenticationFailed,
            "LCU authentication failed",
        );
        let json = serde_json::to_value(&error).expect("serialize error");
        assert_eq!(json["code"], "authentication_failed");
        assert_eq!(json["message"], "LCU authentication failed");
        assert!(json.get("stack").is_none());
        assert!(json.get("password").is_none());
        assert!(json.get("authorization").is_none());
    }
}
