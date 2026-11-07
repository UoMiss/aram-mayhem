use crate::lcu::discovery::LcuClient;
use crate::lcu::error::{LcuError, LcuErrorCode};
use async_trait::async_trait;
use base64::{Engine as _, engine::general_purpose::STANDARD};
use futures_util::{SinkExt, StreamExt};
use serde_json::Value;
use tokio::net::TcpStream;
use tokio::sync::{mpsc, watch};
use tokio_tungstenite::tungstenite::Message;
use tokio_tungstenite::tungstenite::client::IntoClientRequest;
use tokio_tungstenite::tungstenite::http::HeaderValue;
use tokio_tungstenite::{
    Connector, MaybeTlsStream, WebSocketStream, connect_async_tls_with_config,
};

const GAMEFLOW_PHASE_URI: &str = "/lol-gameflow/v1/gameflow-phase";
const GAMEFLOW_SESSION_URI: &str = "/lol-gameflow/v1/session";
const LOBBY_URI: &str = "/lol-lobby/v2/lobby";
const CHAMP_SELECT_URI: &str = "/lol-champ-select/v1/session";
const SUMMONER_URI: &str = "/lol-summoner/v1/current-summoner";
const LOGIN_URI: &str = "/lol-login/v1/session";

#[derive(Debug, Clone, PartialEq)]
pub struct GameflowEventNotification {
    pub uri: String,
    pub event_type: String,
    pub data: Value,
}

#[async_trait]
#[allow(dead_code)]
pub trait GameflowEventSource: Send + Sync + 'static {
    /// Run an authenticated event subscription until cancelled or disconnected.
    /// It never forwards raw payloads to Vue; it only signals that a refresh is needed.
    async fn listen(
        &self,
        client: &LcuClient,
        wake: mpsc::Sender<()>,
        cancel: watch::Receiver<bool>,
    ) -> Result<(), LcuError>;
}

pub struct LcuWebSocketEventSource;

#[async_trait]
impl GameflowEventSource for LcuWebSocketEventSource {
    async fn listen(
        &self,
        client: &LcuClient,
        wake: mpsc::Sender<()>,
        mut cancel: watch::Receiver<bool>,
    ) -> Result<(), LcuError> {
        if cfg!(not(windows)) {
            let _ = (client, wake, cancel);
            return Err(LcuError::unsupported_platform());
        }

        let mut socket = connect(client).await?;
        socket
            .send(Message::Text("[5,\"OnJsonApiEvent\"]".into()))
            .await
            .map_err(|_| LcuError::new(LcuErrorCode::Internal, "LCU event subscribe failed"))?;

        loop {
            let message = tokio::select! {
                _ = cancel.changed() => return Ok(()),
                message = socket.next() => message,
            };
            let Some(message) = message else {
                return Err(LcuError::new(
                    LcuErrorCode::ConnectionRefused,
                    "LCU event stream closed",
                ));
            };
            let message = message.map_err(|_| {
                LcuError::new(LcuErrorCode::ConnectionRefused, "LCU event stream failed")
            })?;

            match message {
                Message::Text(text) => {
                    if let Some(event) = parse_event_message(text.as_str())?
                        && is_relevant_uri(&event.uri)
                    {
                        let _ = wake.try_send(());
                    }
                }
                Message::Ping(payload) => {
                    socket
                        .send(Message::Pong(payload))
                        .await
                        .map_err(|_| LcuError::new(LcuErrorCode::Internal, "LCU pong failed"))?;
                }
                Message::Close(_) => {
                    return Err(LcuError::new(
                        LcuErrorCode::ConnectionRefused,
                        "LCU event stream closed",
                    ));
                }
                Message::Binary(_) | Message::Pong(_) | Message::Frame(_) => {}
            }
        }
    }
}

#[allow(dead_code)]
async fn connect(
    client: &LcuClient,
) -> Result<WebSocketStream<MaybeTlsStream<TcpStream>>, LcuError> {
    let url = format!("wss://127.0.0.1:{}", client.port);
    let mut request = url
        .into_client_request()
        .map_err(|_| LcuError::internal("invalid LCU WebSocket URL"))?;
    let credentials = STANDARD.encode(format!("riot:{}", client.password()));
    let header = HeaderValue::from_str(&format!("Basic {credentials}"))
        .map_err(|_| LcuError::internal("invalid LCU WebSocket auth header"))?;
    request.headers_mut().insert("Authorization", header);

    let tls = native_tls::TlsConnector::builder()
        .danger_accept_invalid_certs(true)
        .danger_accept_invalid_hostnames(true)
        .build()
        .map_err(|_| LcuError::new(LcuErrorCode::TlsError, "LCU WebSocket TLS setup failed"))?;
    let connector = Connector::NativeTls(tls);
    connect_async_tls_with_config(request, None, false, Some(connector))
        .await
        .map(|(socket, _)| socket)
        .map_err(|_| {
            LcuError::new(
                LcuErrorCode::ConnectionRefused,
                "LCU WebSocket connection failed",
            )
        })
}

#[allow(dead_code)]
fn is_relevant_uri(uri: &str) -> bool {
    let path = uri.split('?').next().unwrap_or(uri);
    path == GAMEFLOW_PHASE_URI
        || path == GAMEFLOW_SESSION_URI
        || path == LOBBY_URI
        || path == CHAMP_SELECT_URI
        || path == SUMMONER_URI
        || path == LOGIN_URI
        || path == "/lol-matchmaking/v1/ready-check"
}

/// LCU uses WAMP JSON frames: [8, "OnJsonApiEvent", { uri, eventType, data }].
#[allow(dead_code)]
pub fn parse_event_message(text: &str) -> Result<Option<GameflowEventNotification>, LcuError> {
    let value: Value = serde_json::from_str(text)
        .map_err(|_| LcuError::new(LcuErrorCode::InvalidResponse, "LCU event is not valid JSON"))?;
    let Some(frame) = value.as_array() else {
        return Ok(None);
    };
    if frame.first().and_then(Value::as_i64) != Some(8) {
        return Ok(None);
    }
    let Some(payload) = frame.get(2).and_then(Value::as_object) else {
        return Ok(None);
    };
    let Some(uri) = payload.get("uri").and_then(Value::as_str) else {
        return Ok(None);
    };
    if !is_relevant_uri(uri) {
        return Ok(None);
    }
    let event_type = payload
        .get("eventType")
        .and_then(Value::as_str)
        .unwrap_or("Update");
    let data = payload.get("data").cloned().unwrap_or(Value::Null);
    Ok(Some(GameflowEventNotification {
        uri: uri.to_string(),
        event_type: event_type.to_string(),
        data,
    }))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn account_update_and_logout_events_wake_gameflow_sampling() {
        for uri in [SUMMONER_URI, LOGIN_URI] {
            let message = serde_json::json!([8,"OnJsonApiEvent",{"uri":uri,"eventType":"Delete","data":null}]).to_string();
            assert!(parse_event_message(&message).unwrap().is_some());
        }
    }

    #[test]
    fn parses_relevant_lcu_wamp_event() {
        let event = parse_event_message(
            r#"[8,"OnJsonApiEvent",{"uri":"/lol-gameflow/v1/gameflow-phase","eventType":"Update","data":"ChampSelect"}]"#,
        )
        .expect("parse")
        .expect("relevant");
        assert_eq!(event.uri, GAMEFLOW_PHASE_URI);
        assert_eq!(event.event_type, "Update");
        assert_eq!(event.data, Value::String("ChampSelect".to_string()));
    }

    #[test]
    fn ignores_unrelated_or_non_event_frames() {
        assert!(
            parse_event_message(r#"[8,"OnJsonApiEvent",{"uri":"/lol-chat/v1/friends","data":{}}]"#)
                .expect("parse")
                .is_none()
        );
        assert!(
            parse_event_message("[5,\"OnJsonApiEvent\"]")
                .expect("parse")
                .is_none()
        );
        assert!(parse_event_message(r#"not-json"#).is_err());
    }
}
