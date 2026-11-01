use crate::lcu::discovery::LcuClient;
use crate::lcu::error::{LcuError, LcuErrorCode};
use reqwest::{Client, StatusCode};
use std::time::Duration;

const LCU_PROBE_PATH: &str = "/riotclient/region-locale";
#[allow(dead_code)]
const LCU_TIMEOUT: Duration = Duration::from_secs(3);

/// Dedicated local HTTPS connector for the LCU.
///
/// The League client serves a self-signed certificate on a loopback port. We disable
/// certificate verification only for this dedicated client, and only target the loopback
/// endpoint validated from the client lockfile. The setting is never applied globally.
pub struct LcuHttpClient {
    client: Client,
}

#[allow(dead_code)]
impl LcuHttpClient {
    pub fn new() -> Result<Self, LcuError> {
        let client = Client::builder()
            .https_only(true)
            .danger_accept_invalid_certs(true)
            .connect_timeout(LCU_TIMEOUT)
            .timeout(LCU_TIMEOUT)
            .build()
            .map_err(|_| {
                LcuError::new(LcuErrorCode::Internal, "failed to build LCU HTTP client")
            })?;
        Ok(Self { client })
    }

    /// Read-only probe. Only `/riotclient/region-locale` is requested; no game state writes.
    #[allow(dead_code)]
    pub async fn probe(&self, endpoint: &LcuClient) -> Result<(), LcuError> {
        let url = format!("{}{}", endpoint.endpoint(), LCU_PROBE_PATH);
        let response = self
            .client
            .get(url)
            .basic_auth("riot", Some(endpoint.password()))
            .send()
            .await
            .map_err(map_reqwest_error)?;

        match response.status() {
            StatusCode::UNAUTHORIZED | StatusCode::FORBIDDEN => Err(LcuError::new(
                LcuErrorCode::AuthenticationFailed,
                "LCU authentication failed",
            )),
            status if !status.is_success() => Err(LcuError::new(
                LcuErrorCode::HttpStatus,
                "LCU returned an unexpected status",
            )),
            _ => {
                let _: serde_json::Value = response.json().await.map_err(|_| {
                    LcuError::new(
                        LcuErrorCode::InvalidResponse,
                        "LCU returned a malformed response",
                    )
                })?;
                Ok(())
            }
        }
    }

    /// Read-only GET for a known LCU endpoint. Path is validated to start with `/`.
    pub async fn get_json(
        &self,
        endpoint: &LcuClient,
        path: &str,
    ) -> Result<serde_json::Value, LcuError> {
        let response = self.send_read(endpoint, path).await?;
        parse_json_response(response).await
    }

    /// Optional read for endpoints where 404/204 legitimately means "no resource".
    pub async fn get_json_optional(
        &self,
        endpoint: &LcuClient,
        path: &str,
    ) -> Result<Option<serde_json::Value>, LcuError> {
        let response = self.send_read(endpoint, path).await?;
        if response.status() == StatusCode::NOT_FOUND || response.status() == StatusCode::NO_CONTENT
        {
            return Ok(None);
        }
        parse_json_response(response).await.map(Some)
    }

    async fn send_read(
        &self,
        endpoint: &LcuClient,
        path: &str,
    ) -> Result<reqwest::Response, LcuError> {
        if !path.starts_with('/') || path.starts_with("//") {
            return Err(LcuError::new(
                LcuErrorCode::Internal,
                "invalid LCU read-only path",
            ));
        }
        let url = format!("{}{}", endpoint.endpoint(), path);
        let response = self
            .client
            .get(url)
            .basic_auth("riot", Some(endpoint.password()))
            .send()
            .await
            .map_err(map_reqwest_error)?;

        match response.status() {
            StatusCode::UNAUTHORIZED | StatusCode::FORBIDDEN => Err(LcuError::new(
                LcuErrorCode::AuthenticationFailed,
                "LCU authentication failed",
            )),
            status if status == StatusCode::NOT_FOUND || status == StatusCode::NO_CONTENT => {
                Ok(response)
            }
            status if !status.is_success() => Err(LcuError::new(
                LcuErrorCode::HttpStatus,
                "LCU returned an unexpected status",
            )),
            _ => Ok(response),
        }
    }
}

async fn parse_json_response(response: reqwest::Response) -> Result<serde_json::Value, LcuError> {
    response.json().await.map_err(|_| {
        LcuError::new(
            LcuErrorCode::InvalidResponse,
            "LCU returned a malformed response",
        )
    })
}

fn map_reqwest_error(error: reqwest::Error) -> LcuError {
    if error.is_timeout() {
        return LcuError::new(LcuErrorCode::Timeout, "LCU request timed out");
    }
    if error.is_connect() {
        let text = error.to_string().to_ascii_lowercase();
        if text.contains("certificate") || text.contains("tls") {
            return LcuError::new(LcuErrorCode::TlsError, "LCU TLS handshake failed");
        }
        return LcuError::new(
            LcuErrorCode::ConnectionRefused,
            "LCU connection was refused",
        );
    }
    LcuError::new(LcuErrorCode::Internal, "LCU request failed")
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::lcu::discovery::LcuLockfile;

    fn client() -> LcuClient {
        LcuClient::from_lockfile(
            LcuLockfile::parse("LeagueClientUx:4242:54321:s3cret:https").expect("lockfile"),
        )
        .expect("client")
    }

    #[test]
    fn uses_https_loopback_only() {
        let client = client();
        assert_eq!(client.endpoint(), "https://127.0.0.1:54321");
        assert!(client.endpoint().starts_with("https://127.0.0.1:"));
    }

    #[test]
    fn http_client_builds_without_global_tls_mutation() {
        assert!(LcuHttpClient::new().is_ok());
    }
}
