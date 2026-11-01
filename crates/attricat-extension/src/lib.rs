//! Typed calls to the Attricat extension host, for server components.
//!
//! The host's generic `api.call` takes an operation name and a JSON string.
//! This crate names those operations and types their JSON. It holds no WIT:
//! your component generates its own bindings for the world it targets, and
//! [`host!`] connects them.
//!
//! ```ignore
//! wit_bindgen::generate!({ path: "wit", world: "outcome-extension" });
//!
//! attricat_extension::host!(attricat::host::api);
//!
//! fn last_sync() -> Result<Option<String>, String> {
//!     Ok(storage().get::<String>("last-sync")?.map(|entry| entry.value))
//! }
//! ```

use serde::{Deserialize, Serialize, de::DeserializeOwned};
use serde_json::{Value, json};

mod batch;
pub mod mappings;
pub mod network;

pub use batch::{Batch, Intent, IntentOutcome, IntentStatus, Scalar};
pub use mappings::Mappings;
pub use network::{Network, Request, Response};

/// The host's `api.call`.
pub trait Host {
    fn call(&self, operation: &str, request: &str) -> Result<String, String>;
}

/// Connects this crate to your generated bindings, and defines `storage()`,
/// `mappings()`, `network()`, `configuration()`, `secret()`, `emit_event()`,
/// `read()` and `connector_scope()` in the calling module.
#[macro_export]
macro_rules! host {
    ($api:path) => {
        #[derive(Clone, Copy)]
        struct GeneratedHost;

        impl $crate::Host for GeneratedHost {
            fn call(&self, operation: &str, request: &str) -> Result<String, String> {
                use $api as api;
                api::call(operation, request)
            }
        }

        #[allow(dead_code)]
        fn storage() -> $crate::Storage<GeneratedHost> {
            $crate::Storage(GeneratedHost)
        }

        #[allow(dead_code)]
        fn mappings() -> $crate::Mappings<GeneratedHost> {
            $crate::Mappings(GeneratedHost)
        }

        #[allow(dead_code)]
        fn network() -> $crate::Network<GeneratedHost> {
            $crate::Network(GeneratedHost)
        }

        #[allow(dead_code)]
        fn configuration<T: serde::de::DeserializeOwned>() -> Result<T, String> {
            $crate::configuration(&GeneratedHost)
        }

        #[allow(dead_code)]
        fn secret(name: &str) -> Result<String, String> {
            $crate::secret(&GeneratedHost, name)
        }

        #[allow(dead_code)]
        fn emit_event(
            contract_id: &str,
            aggregate_kind: &str,
            aggregate_id: &str,
            payload: serde_json::Value,
        ) -> Result<(), String> {
            $crate::emit_event(
                &GeneratedHost,
                contract_id,
                aggregate_kind,
                aggregate_id,
                payload,
            )
        }

        #[allow(dead_code)]
        fn connector_scope() -> Result<Option<$crate::ConnectorScope>, String> {
            $crate::connector_scope(&GeneratedHost)
        }
    };
}

/// Parses a JSON string the host or a request gave you.
pub fn decode<T: DeserializeOwned>(value: &str) -> Result<T, String> {
    serde_json::from_str(value).map_err(|error| format!("invalid JSON: {error}"))
}

/// Serializes a value for the host.
pub fn encode(value: &impl Serialize) -> Result<String, String> {
    serde_json::to_string(value).map_err(|error| format!("cannot serialize: {error}"))
}

pub(crate) fn call<H: Host, T: DeserializeOwned>(
    host: &H,
    operation: &str,
    request: Value,
) -> Result<T, String> {
    decode(&host.call(operation, &request.to_string())?)
}

/// The installation configuration. Needs `configuration.read`.
pub fn configuration<H: Host, T: DeserializeOwned>(host: &H) -> Result<T, String> {
    call(host, "configuration.get.v1", json!({}))
}

/// A workspace secret, for this invocation only. Needs `secrets.read`.
pub fn secret<H: Host>(host: &H, name: &str) -> Result<String, String> {
    #[derive(Deserialize)]
    struct Secret {
        value: String,
    }
    let secret: Secret = call(host, "secrets.get.v1", json!({ "name": name }))?;
    Ok(secret.value)
}

/// Publishes a declared event. Needs `events.emit`.
pub fn emit_event<H: Host>(
    host: &H,
    contract_id: &str,
    aggregate_kind: &str,
    aggregate_id: &str,
    payload: Value,
) -> Result<(), String> {
    host.call(
        "events.emit.v1",
        &json!({
            "contract_id": contract_id,
            "aggregate_kind": aggregate_kind,
            "aggregate_id": aggregate_id,
            "payload": payload,
        })
        .to_string(),
    )
    .map(drop)
}

/// A connector run's job, blueprint, context, channel, connection and mode.
#[derive(Clone, Debug, Deserialize, PartialEq)]
pub struct ConnectorScope {
    #[serde(default)]
    pub connection: Option<String>,
    #[serde(default)]
    pub mode: Option<String>,
    #[serde(flatten)]
    pub rest: serde_json::Map<String, Value>,
}

/// The current connector run's scope; `None` outside one.
pub fn connector_scope<H: Host>(host: &H) -> Result<Option<ConnectorScope>, String> {
    call(host, "connector.scope.v1", json!({}))
}

/// A stored value and the revision to pass as `expected_revision`.
#[derive(Clone, Debug, Deserialize, PartialEq)]
pub struct Entry<T> {
    pub value: T,
    pub revision: i64,
}

/// A page of [`Storage::list`].
#[derive(Clone, Debug, Deserialize, PartialEq)]
pub struct StoragePage {
    pub entries: Vec<StorageItem>,
    pub cursor: Option<String>,
}

#[derive(Clone, Debug, Deserialize, PartialEq)]
pub struct StorageItem {
    pub key: String,
    pub value: Value,
    pub revision: i64,
}

/// The extension's key-value store. Needs `storage.extension`.
pub struct Storage<H>(pub H);

/// How many times [`Storage::update`] retries a lost race.
const STORAGE_UPDATE_ATTEMPTS: usize = 3;

impl<H: Host> Storage<H> {
    pub fn get<T: DeserializeOwned>(&self, key: &str) -> Result<Option<Entry<T>>, String> {
        call(&self.0, "storage.get.v1", json!({ "key": key }))
    }

    /// Stores a value. With `expected_revision`, fails if the key changed
    /// since you read it. Returns the new revision.
    pub fn set(
        &self,
        key: &str,
        value: &impl Serialize,
        expected_revision: Option<i64>,
    ) -> Result<i64, String> {
        #[derive(Deserialize)]
        struct Stored {
            revision: i64,
        }
        let mut request = json!({ "key": key, "value": value });
        if let Some(revision) = expected_revision {
            request["expected_revision"] = revision.into();
        }
        let stored: Stored = call(&self.0, "storage.set.v1", request)?;
        Ok(stored.revision)
    }

    pub fn delete(&self, key: &str, expected_revision: Option<i64>) -> Result<(), String> {
        let mut request = json!({ "key": key });
        if let Some(revision) = expected_revision {
            request["expected_revision"] = revision.into();
        }
        self.0
            .call("storage.delete.v1", &request.to_string())
            .map(drop)
    }

    pub fn list(
        &self,
        prefix: Option<&str>,
        cursor: Option<&str>,
        limit: Option<u32>,
    ) -> Result<StoragePage, String> {
        call(
            &self.0,
            "storage.list.v1",
            json!({ "prefix": prefix, "cursor": cursor, "limit": limit }),
        )
    }

    /// Reads, changes and writes a value, trying again a few times if another
    /// invocation wrote it first. `change` may run more than once.
    pub fn update<T: DeserializeOwned + Serialize + Default>(
        &self,
        key: &str,
        mut change: impl FnMut(&mut T),
    ) -> Result<(), String> {
        let mut failure = String::new();
        for _ in 0..STORAGE_UPDATE_ATTEMPTS {
            let (mut value, revision) = match self.get::<T>(key)? {
                Some(entry) => (entry.value, Some(entry.revision)),
                None => (T::default(), None),
            };
            change(&mut value);
            match self.set(key, &value, revision) {
                Ok(_) => return Ok(()),
                Err(error) => failure = error,
            }
        }
        Err(failure)
    }
}

/// Reads through `attricat.read.v1`. Needs `attricat.read`, and works outside
/// operation runs; runs use `attricat-data.read` with the same JSON.
pub fn read<H: Host, T: DeserializeOwned>(host: &H, request: Value) -> Result<T, String> {
    call(host, "attricat.read.v1", request)
}

#[cfg(test)]
pub(crate) mod testing {
    use super::Host;
    use std::cell::RefCell;

    /// Answers calls in order and records them.
    #[derive(Default)]
    pub struct FakeHost {
        pub answers: RefCell<Vec<Result<String, String>>>,
        pub calls: RefCell<Vec<(String, serde_json::Value)>>,
    }

    impl FakeHost {
        pub fn answering(answers: &[Result<&str, &str>]) -> Self {
            Self {
                answers: RefCell::new(
                    answers
                        .iter()
                        .rev()
                        .map(|answer| answer.map(str::to_owned).map_err(str::to_owned))
                        .collect(),
                ),
                calls: RefCell::default(),
            }
        }
    }

    impl Host for &FakeHost {
        fn call(&self, operation: &str, request: &str) -> Result<String, String> {
            self.calls
                .borrow_mut()
                .push((operation.to_owned(), serde_json::from_str(request).unwrap()));
            self.answers.borrow_mut().pop().expect("an answer")
        }
    }
}

#[cfg(test)]
mod tests {
    use super::testing::FakeHost;
    use super::*;

    #[test]
    fn storage_reads_absent_and_present_keys() {
        let host = FakeHost::answering(&[Ok("null"), Ok(r#"{"value":"a","revision":3}"#)]);
        let storage = Storage(&host);
        assert_eq!(storage.get::<String>("k").unwrap(), None);
        assert_eq!(
            storage.get::<String>("k").unwrap(),
            Some(Entry {
                value: "a".to_owned(),
                revision: 3
            })
        );
    }

    #[test]
    fn storage_update_retries_a_lost_race_against_the_new_revision() {
        let host = FakeHost::answering(&[
            Ok(r#"{"value":1,"revision":1}"#),
            Err("revision conflict"),
            Ok(r#"{"value":5,"revision":2}"#),
            Ok(r#"{"revision":3}"#),
        ]);
        Storage(&host)
            .update::<i64>("n", |value| *value += 1)
            .unwrap();
        let calls = host.calls.borrow();
        assert_eq!(calls[3].0, "storage.set.v1");
        assert_eq!(
            calls[3].1,
            json!({"key": "n", "value": 6, "expected_revision": 2})
        );
    }

    #[test]
    fn storage_update_gives_up_with_the_last_error() {
        let conflict = Err("revision conflict");
        let read = Ok(r#"{"value":1,"revision":1}"#);
        let host = FakeHost::answering(&[read, conflict, read, conflict, read, conflict]);
        let error = Storage(&host).update::<i64>("n", |_| {}).unwrap_err();
        assert_eq!(error, "revision conflict");
    }

    #[test]
    fn secret_returns_only_its_value() {
        let host = FakeHost::answering(&[Ok(r#"{"value":"s3cret"}"#)]);
        assert_eq!(secret(&&host, "token").unwrap(), "s3cret");
        assert_eq!(host.calls.borrow()[0].1, json!({"name": "token"}));
    }

    #[test]
    fn host_failures_pass_through_with_their_message() {
        let host = FakeHost::answering(&[Err("missing capability 'storage.extension'")]);
        let error = Storage(&host).get::<String>("k").unwrap_err();
        assert!(error.contains("missing capability"));
    }
}
