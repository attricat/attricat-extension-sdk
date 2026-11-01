//! Outbound HTTPS through `network.request.v2`. Needs `network.request` and a
//! granted host permission.

use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::BTreeMap;

use crate::{Host, call};

/// One request. The rule named by `host_permission_id` must match it.
#[derive(Clone, Debug, Default, Serialize)]
pub struct Request {
    pub host_permission_id: String,
    pub method: String,
    pub url: String,
    #[serde(skip_serializing_if = "BTreeMap::is_empty")]
    pub headers: BTreeMap<String, String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub body: Option<String>,
    /// Adds this connection's access token to the request.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub connection: Option<String>,
    /// Sent as `Idempotency-Key`; keep it stable across retries.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub idempotency_key: Option<String>,
}

/// How a request ended. The broker never retries; each case says whether you
/// safely can.
#[derive(Clone, Debug, Deserialize, PartialEq)]
#[serde(tag = "outcome", rename_all = "snake_case")]
pub enum Response {
    /// The destination answered, with any status.
    Response {
        status: u16,
        #[serde(default)]
        headers: BTreeMap<String, String>,
        #[serde(default)]
        body_base64: String,
    },
    /// The rule's budget is spent. Nothing was sent.
    RateLimited { retry_after_ms: u64 },
    /// The connection or TLS handshake failed. Nothing was sent.
    Unreachable,
    /// The destination may have received the request.
    Uncertain,
    /// The connection's token could not be refreshed for a temporary reason.
    ConnectionUnavailable { message: String },
}

pub struct Network<H>(pub H);

impl<H: Host> Network<H> {
    pub fn send(&self, request: &Request) -> Result<Response, String> {
        let request: Value = serde_json::to_value(request).map_err(|error| error.to_string())?;
        call(&self.0, "network.request.v2", request)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::testing::FakeHost;

    #[test]
    fn outcomes_are_typed() {
        let host = FakeHost::answering(&[
            Ok(
                r#"{"outcome":"response","status":201,"headers":{"etag":"x"},"body_base64":"e30="}"#,
            ),
            Ok(r#"{"outcome":"rate_limited","retry_after_ms":500}"#),
            Ok(r#"{"outcome":"uncertain"}"#),
        ]);
        let network = Network(&host);
        let request = Request {
            host_permission_id: "shop".into(),
            method: "POST".into(),
            url: "https://shop.example/items".into(),
            connection: Some("eu".into()),
            ..Request::default()
        };
        assert!(matches!(
            network.send(&request).unwrap(),
            Response::Response { status: 201, .. }
        ));
        assert_eq!(
            network.send(&request).unwrap(),
            Response::RateLimited {
                retry_after_ms: 500
            }
        );
        assert_eq!(network.send(&request).unwrap(), Response::Uncertain);
        let sent = &host.calls.borrow()[0].1;
        assert_eq!(sent["connection"], "eu");
        assert!(sent.get("body").is_none());
    }
}
