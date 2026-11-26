//! Form assists: a `form_assist` contribution's server command, which the
//! host calls while someone enters a new record (in the record form or a new
//! row of a table of linked records) when a field it watches changes.
//!
//! The command receives a [`Context`] with only the assist's watched and
//! proposed fields, and answers with [`Proposals`]. The host keeps a proposal
//! only for a declared `proposes` field the person has not edited, and only
//! when the field accepts the value; the form applies it as an unsaved change.
//! Writes outside the form never call the command.
//!
//! ```ignore
//! fn handle_command(request: CommandRequest) -> Result<CommandResponse, String> {
//!     let context = form_assist::Context::from_payload(&request.payload)?;
//!     let mut proposals = form_assist::Proposals::new();
//!     if let (Some(net), Some(rate)) = (context.number("price_net"), context.number("vat_rate")) {
//!         proposals.propose_with_note("price_gross", net * (1.0 + rate), "Net price with VAT")?;
//!     }
//!     Ok(CommandResponse { payload: proposals.to_json()? })
//! }
//! ```

use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};

/// The context version this module reads.
pub const CONTEXT_VERSION: u32 = 1;
/// The most proposals one answer may hold.
pub const MAX_PROPOSALS: usize = 16;
/// The longest note, in characters, the host accepts.
pub const MAX_NOTE_CHARS: usize = 140;

/// What the host sends an assist's command.
#[derive(Clone, Debug, Deserialize, PartialEq)]
pub struct Context {
    pub version: u32,
    /// The `form_assist` contribution's ID, for a command several assists
    /// share.
    pub assist: String,
    pub blueprint: Revision,
    /// The record being edited; `None` for a new record.
    pub record_id: Option<String>,
    /// The form's value context, always concrete.
    pub context_id: String,
    /// Every watched and proposed field, `null` when empty. A relationship is
    /// a list of [`Target`]s.
    pub values: Map<String, Value>,
    /// Proposed fields the person has edited; the host keeps them as they are.
    #[serde(default)]
    pub edited: Vec<String>,
}

/// The blueprint revision the form enters a record of.
#[derive(Clone, Debug, Deserialize, PartialEq)]
pub struct Revision {
    pub code: String,
    pub id: String,
    pub version: i64,
}

/// A record a relationship field links to, readable by the person.
#[derive(Clone, Debug, Deserialize, PartialEq)]
pub struct Target {
    pub record_id: String,
    pub blueprint_code: String,
}

impl Context {
    /// Parses a command payload, refusing an unknown context version.
    pub fn from_payload(payload: &str) -> Result<Self, String> {
        let context: Self = crate::decode(payload)?;
        if context.version != CONTEXT_VERSION {
            return Err(format!(
                "form assist context version {} is not supported",
                context.version
            ));
        }
        Ok(context)
    }

    /// A field's value, or `None` when it is empty or not passed.
    pub fn value(&self, code: &str) -> Option<&Value> {
        self.values.get(code).filter(|value| !value.is_null())
    }

    /// A number field's value.
    pub fn number(&self, code: &str) -> Option<f64> {
        self.value(code).and_then(Value::as_f64)
    }

    /// A text field's value.
    pub fn text(&self, code: &str) -> Option<&str> {
        self.value(code).and_then(Value::as_str)
    }

    /// A relationship field's targets; empty when it links to nothing.
    pub fn targets(&self, code: &str) -> Vec<Target> {
        self.value(code)
            .and_then(|value| serde_json::from_value(value.clone()).ok())
            .unwrap_or_default()
    }

    /// Whether the person has edited proposed field `code`.
    pub fn edited(&self, code: &str) -> bool {
        self.edited.iter().any(|edited| edited == code)
    }
}

/// One proposed field value.
#[derive(Clone, Debug, Serialize, PartialEq)]
pub struct Proposal {
    pub attribute_code: String,
    /// The value in the attribute's JSON form, as the record API writes it.
    pub value: Value,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub note: Option<String>,
}

/// An assist's answer, in the host's `extension-form-assist-v1` contract.
#[derive(Clone, Debug, Default, Serialize, PartialEq)]
pub struct Proposals {
    proposals: Vec<Proposal>,
}

impl Proposals {
    /// An answer that proposes nothing.
    pub fn new() -> Self {
        Self::default()
    }

    /// Proposes `value` for `attribute_code`. A second proposal for the same
    /// field replaces the first.
    pub fn propose(
        &mut self,
        attribute_code: &str,
        value: impl Into<Value>,
    ) -> Result<&mut Self, String> {
        self.push(attribute_code, value.into(), None)
    }

    /// [`Self::propose`] with a plain-text note shown under the field,
    /// shortened to [`MAX_NOTE_CHARS`].
    pub fn propose_with_note(
        &mut self,
        attribute_code: &str,
        value: impl Into<Value>,
        note: &str,
    ) -> Result<&mut Self, String> {
        let note = note.trim();
        let note = if note.chars().count() > MAX_NOTE_CHARS {
            let kept: String = note.chars().take(MAX_NOTE_CHARS - 1).collect();
            format!("{}…", kept.trim_end())
        } else {
            note.to_owned()
        };
        self.push(
            attribute_code,
            value.into(),
            (!note.is_empty()).then_some(note),
        )
    }

    fn push(
        &mut self,
        attribute_code: &str,
        value: Value,
        note: Option<String>,
    ) -> Result<&mut Self, String> {
        if value.is_null() {
            return Err(format!("a proposal for '{attribute_code}' needs a value"));
        }
        self.proposals
            .retain(|proposal| proposal.attribute_code != attribute_code);
        if self.proposals.len() == MAX_PROPOSALS {
            return Err(format!("an answer holds at most {MAX_PROPOSALS} proposals"));
        }
        self.proposals.push(Proposal {
            attribute_code: attribute_code.to_owned(),
            value,
            note,
        });
        Ok(self)
    }

    pub fn proposals(&self) -> &[Proposal] {
        &self.proposals
    }

    /// The answer as the command's response payload.
    pub fn to_json(&self) -> Result<String, String> {
        serde_json::to_string(self).map_err(|error| error.to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const PAYLOAD: &str = r#"{
        "version": 1,
        "assist": "customer_price",
        "blueprint": {"code": "order_line", "id": "b1", "version": 3},
        "record_id": null,
        "context_id": "c1",
        "values": {
            "item": [{"record_id": "r1", "blueprint_code": "product"}],
            "quantity": 3,
            "customer": null,
            "note": "rush"
        },
        "edited": ["discount"]
    }"#;

    #[test]
    fn a_context_reads_its_fields() {
        let context = Context::from_payload(PAYLOAD).unwrap();
        assert_eq!(context.blueprint.code, "order_line");
        assert_eq!(context.record_id, None);
        assert_eq!(context.number("quantity"), Some(3.0));
        assert_eq!(context.text("note"), Some("rush"));
        assert_eq!(context.value("customer"), None);
        assert_eq!(
            context.targets("item"),
            vec![Target {
                record_id: "r1".into(),
                blueprint_code: "product".into()
            }]
        );
        assert!(context.targets("customer").is_empty());
        assert!(context.edited("discount"));
        assert!(!context.edited("quantity"));
    }

    #[test]
    fn an_unknown_context_version_is_refused() {
        let payload = PAYLOAD.replace("\"version\": 1,", "\"version\": 2,");
        assert!(Context::from_payload(&payload).is_err());
    }

    #[test]
    fn proposals_follow_the_contract() {
        let mut proposals = Proposals::new();
        proposals.propose("price", 10).unwrap();
        proposals
            .propose_with_note("price", 12.5, "Contract price")
            .unwrap();
        proposals
            .propose_with_note("note", "x", &"long ".repeat(40))
            .unwrap();
        assert!(proposals.propose("empty", Value::Null).is_err());
        let answer: Value = serde_json::from_str(&proposals.to_json().unwrap()).unwrap();
        assert_eq!(
            answer["proposals"][0],
            serde_json::json!({"attribute_code": "price", "value": 12.5, "note": "Contract price"})
        );
        let note = answer["proposals"][1]["note"].as_str().unwrap();
        assert!(note.chars().count() <= MAX_NOTE_CHARS && note.ends_with('…'));

        let mut full = Proposals::new();
        for index in 0..MAX_PROPOSALS {
            full.propose(&format!("field_{index}"), 1).unwrap();
        }
        assert!(full.propose("one_more", 1).is_err());
        assert!(full.propose("field_0", 2).is_ok());
    }
}
