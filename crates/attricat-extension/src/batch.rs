//! Catalog write batches, the JSON of `attricat.command.v1` and
//! `attricat-data.batch`.

use serde::{Deserialize, Serialize};
use serde_json::{Value, json};

/// One attribute value to write, in an explicit context.
#[derive(Clone, Debug, Serialize)]
pub struct Scalar {
    pub attribute_code: String,
    pub context_id: String,
    pub value: Value,
}

impl Scalar {
    pub fn new(attribute_code: &str, context_id: &str, value: impl Into<Value>) -> Self {
        Self {
            attribute_code: attribute_code.to_owned(),
            context_id: context_id.to_owned(),
            value: value.into(),
        }
    }

    fn json(&self) -> Value {
        json!({
            "kind": "scalar",
            "attribute_code": self.attribute_code,
            "context_id": self.context_id,
            "value": self.value,
        })
    }
}

fn values(scalars: &[Scalar]) -> Vec<Value> {
    scalars.iter().map(Scalar::json).collect()
}

/// One change in a batch. Keep `intent_key` stable across retries: a key that
/// was already applied is reported as `already_applied` and not written twice.
#[derive(Clone, Debug)]
pub struct Intent(Value);

impl Intent {
    pub fn create(
        intent_key: &str,
        blueprint_id: &str,
        blueprint_version: u64,
        scalars: &[Scalar],
    ) -> Self {
        Self(json!({
            "kind": "create",
            "intent_key": intent_key,
            "blueprint_id": blueprint_id,
            "blueprint_version": blueprint_version,
            "values": values(scalars),
        }))
    }

    pub fn update(intent_key: &str, record_id: &str, scalars: &[Scalar]) -> Self {
        Self(json!({
            "kind": "update",
            "intent_key": intent_key,
            "record_id": record_id,
            "values": values(scalars),
        }))
    }

    /// Updates the record whose declared business key attribute holds
    /// `lookup_value`, or creates it when none does.
    pub fn upsert(
        intent_key: &str,
        blueprint_id: &str,
        blueprint_version: u64,
        lookup_attribute_id: &str,
        lookup_value: &str,
        scalars: &[Scalar],
    ) -> Self {
        Self(json!({
            "kind": "upsert",
            "intent_key": intent_key,
            "blueprint_id": blueprint_id,
            "blueprint_version": blueprint_version,
            "lookup_attribute_id": lookup_attribute_id,
            "lookup_value": lookup_value,
            "values": values(scalars),
        }))
    }

    /// Patches this extension's own tags and metadata on a record. Needs
    /// `attricat.annotations.write`.
    pub fn annotate(intent_key: &str, record_id: &str, set_metadata: Value) -> Self {
        Self(json!({
            "kind": "annotate",
            "intent_key": intent_key,
            "record_id": record_id,
            "set_metadata": set_metadata,
        }))
    }
}

/// Up to 100 intents under one key. In an operation run the key must be the
/// run's current batch key.
#[derive(Clone, Debug)]
pub struct Batch {
    pub batch_key: String,
    pub dry_run: bool,
    pub intents: Vec<Intent>,
}

impl Batch {
    pub fn new(batch_key: &str, intents: Vec<Intent>) -> Self {
        Self {
            batch_key: batch_key.to_owned(),
            dry_run: false,
            intents,
        }
    }

    /// The request for `attricat.command.v1` or `attricat-data.batch`.
    pub fn to_request(&self) -> String {
        let intents: Vec<&Value> = self.intents.iter().map(|intent| &intent.0).collect();
        json!({
            "operation": "batch",
            "batch": {
                "batch_key": self.batch_key,
                "dry_run": self.dry_run,
                "intents": intents,
            }
        })
        .to_string()
    }
}

#[derive(Clone, Copy, Debug, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum IntentStatus {
    Applied,
    AlreadyApplied,
    Validated,
    Rejected,
}

/// What happened to one intent; the response holds one per intent.
#[derive(Clone, Debug, Deserialize, PartialEq)]
pub struct IntentOutcome {
    pub intent_key: String,
    pub status: IntentStatus,
    pub record_id: Option<String>,
    pub error: Option<String>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_batch_serializes_to_the_host_shape() {
        let batch = Batch::new(
            "key",
            vec![Intent::upsert(
                "line-1",
                "b",
                3,
                "a",
                "SKU-1",
                &[Scalar::new("title", "c", "Chair")],
            )],
        );
        let request: Value = serde_json::from_str(&batch.to_request()).unwrap();
        assert_eq!(request["operation"], "batch");
        assert_eq!(request["batch"]["batch_key"], "key");
        let intent = &request["batch"]["intents"][0];
        assert_eq!(intent["kind"], "upsert");
        assert_eq!(intent["blueprint_version"], 3);
        assert_eq!(intent["values"][0]["attribute_code"], "title");
        assert_eq!(intent["values"][0]["kind"], "scalar");
    }

    #[test]
    fn outcomes_parse_every_status() {
        let outcomes: Vec<IntentOutcome> = serde_json::from_str(
            r#"[{"intent_key":"a","status":"already_applied","record_id":"r","error":null},
                {"intent_key":"b","status":"rejected","record_id":null,"error":"no"}]"#,
        )
        .unwrap();
        assert_eq!(outcomes[0].status, IntentStatus::AlreadyApplied);
        assert_eq!(outcomes[1].error.as_deref(), Some("no"));
    }
}
