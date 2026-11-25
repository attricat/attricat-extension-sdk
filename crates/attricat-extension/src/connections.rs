//! Credential connections (host ABI 1.1). Needs `connections.use`.
//!
//! The host runs the OAuth grants and keeps the tokens; a component sees only
//! a connection's non-secret description. To send a request with its token,
//! name the connection in [`crate::network::Request::connection`].

use serde::Deserialize;
use serde_json::{Value, json};

use crate::{Host, call};

/// A connection an operator created for one of the manifest's
/// `server.connections` kinds.
#[derive(Clone, Debug, Deserialize, PartialEq)]
pub struct Connection {
    /// The operator's name for it, as passed to `connection` elsewhere.
    pub connection: String,
    /// The manifest connection kind.
    pub kind: String,
    pub display_name: String,
    /// The operator's values for the kind's `parameters_schema`, such as a
    /// seller or marketplace ID.
    pub parameters: Value,
    /// `pending_authorization`, `active`, `failed` or `revoked`.
    pub status: String,
}

pub struct Connections<H>(pub H);

impl<H: Host> Connections<H> {
    pub fn get(&self, connection: &str) -> Result<Connection, String> {
        call(
            &self.0,
            "connections.get.v1",
            json!({ "connection": connection }),
        )
    }

    /// Every connection of this installation.
    pub fn list(&self) -> Result<Vec<Connection>, String> {
        #[derive(Deserialize)]
        struct List {
            connections: Vec<Connection>,
        }
        let list: List = call(&self.0, "connections.list.v1", json!({}))?;
        Ok(list.connections)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::testing::FakeHost;

    const EU: &str = r#"{"connection":"eu","kind":"amazon","display_name":"Amazon EU","parameters":{"seller_id":"S1"},"status":"active"}"#;

    #[test]
    fn connections_are_typed() {
        let host = FakeHost::answering(&[Ok(EU), Ok(&format!(r#"{{"connections":[{EU}]}}"#))]);
        let connections = Connections(&host);
        let eu = connections.get("eu").unwrap();
        assert_eq!(eu.parameters["seller_id"], "S1");
        assert_eq!(connections.list().unwrap(), vec![eu]);
        assert_eq!(host.calls.borrow()[0].1, json!({"connection": "eu"}));
    }
}
