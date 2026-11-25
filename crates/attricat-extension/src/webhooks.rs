//! Kept webhook payloads (host ABI 1.2). Needs `webhooks.receive`.
//!
//! `webhook-receiver.receive` keeps a payload; the host then delivers a
//! `webhook.received.v1` event to the extension's event handlers, which read
//! the payload back with [`Webhooks::receipt`]. `receive` itself cannot call
//! this.

use serde::Deserialize;
use serde_json::json;

use crate::{Host, call, decode};

/// A kept payload, as the event handler reads it back.
#[derive(Clone, Debug, Deserialize, PartialEq)]
pub struct Receipt {
    pub id: String,
    /// The manifest webhook ID.
    pub webhook: String,
    /// The operator's endpoint name.
    pub endpoint: String,
    pub dedupe_key: Option<String>,
    /// The payload `receive` kept, as it kept it.
    pub payload: String,
    /// RFC 3339.
    pub received_at: String,
}

/// The payload of a `webhook.received.v1` event.
#[derive(Clone, Debug, Deserialize, PartialEq)]
pub struct Received {
    pub extension_id: String,
    pub webhook: String,
    pub endpoint: String,
    pub receipt_id: String,
    pub dedupe_key: Option<String>,
    /// RFC 3339.
    pub received_at: String,
}

impl Received {
    /// The event type the host delivers kept payloads as.
    pub const EVENT_TYPE: &str = "webhook.received.v1";

    /// Parses a `webhook.received.v1` event's payload; `None` for any other
    /// event type.
    pub fn from_event(event_type: &str, payload: &str) -> Result<Option<Self>, String> {
        if event_type != Self::EVENT_TYPE {
            return Ok(None);
        }
        decode(payload).map(Some)
    }
}

pub struct Webhooks<H>(pub H);

impl<H: Host> Webhooks<H> {
    /// The kept payload of a receipt, or `None` once retention (7 days) has
    /// removed it.
    pub fn receipt(&self, receipt_id: &str) -> Result<Option<Receipt>, String> {
        call(
            &self.0,
            "webhooks.receipt.get.v1",
            json!({ "receipt_id": receipt_id }),
        )
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::testing::FakeHost;

    #[test]
    fn a_receipt_reads_back_or_has_expired() {
        let host = FakeHost::answering(&[
            Ok(
                r#"{"id":"r1","webhook":"orders","endpoint":"shop","dedupe_key":"d1","payload":"{}","received_at":"2026-11-25T10:00:00Z"}"#,
            ),
            Ok("null"),
        ]);
        let webhooks = Webhooks(&host);
        let receipt = webhooks.receipt("r1").unwrap().unwrap();
        assert_eq!(receipt.endpoint, "shop");
        assert_eq!(receipt.dedupe_key.as_deref(), Some("d1"));
        assert_eq!(webhooks.receipt("r1").unwrap(), None);
        assert_eq!(
            host.calls.borrow()[0],
            (
                "webhooks.receipt.get.v1".to_owned(),
                json!({"receipt_id": "r1"})
            )
        );
    }

    #[test]
    fn only_webhook_events_parse_as_received() {
        let payload = r#"{"extension_id":"acme.orders","webhook":"orders","endpoint":"shop","receipt_id":"r1","dedupe_key":null,"received_at":"2026-11-25T10:00:00Z"}"#;
        let received = Received::from_event("webhook.received.v1", payload)
            .unwrap()
            .unwrap();
        assert_eq!(received.receipt_id, "r1");
        assert_eq!(
            Received::from_event("record.updated.v1", "{}").unwrap(),
            None
        );
        assert!(Received::from_event("webhook.received.v1", "{}").is_err());
    }
}
