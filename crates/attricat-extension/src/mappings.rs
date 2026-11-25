//! Export mappings, the record's export status at a destination. Needs
//! `exports.mappings`. `begin` and `commit` protect a push against reordered
//! and duplicate work.

use serde::{Deserialize, Serialize};
use serde_json::{Value, json};

use crate::{Host, call};

/// A record's state at one connection.
#[derive(Clone, Debug, Deserialize, PartialEq)]
pub struct Mapping {
    pub record_id: String,
    pub status: String,
    #[serde(default)]
    pub external_id: Option<String>,
    #[serde(default)]
    pub content_hash: Option<String>,
    #[serde(flatten)]
    pub rest: serde_json::Map<String, Value>,
}

/// The answer to [`Mappings::begin`].
#[derive(Clone, Debug, Deserialize, PartialEq)]
#[serde(tag = "outcome", rename_all = "snake_case")]
pub enum Begin {
    /// Push it, then commit with this lease.
    Proceed {
        lease_token: String,
        mapping: Option<Mapping>,
    },
    /// Nothing new to push.
    Stale { mapping: Option<Mapping> },
    /// Someone else is pushing it.
    Busy { lease_until: Option<String> },
}

/// What to record with [`Mappings::commit`].
#[derive(Clone, Debug, Default, Serialize)]
pub struct Commit {
    pub record_id: String,
    /// `synced`, `uncertain`, `retrying` or `withdrawn`.
    pub status: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub connection: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub lease_token: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub record_revision: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub external_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub content_hash: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

pub struct Mappings<H>(pub H);

impl<H: Host> Mappings<H> {
    pub fn begin(
        &self,
        connection: Option<&str>,
        record_id: &str,
        record_revision: i64,
    ) -> Result<Begin, String> {
        call(
            &self.0,
            "mappings.begin.v1",
            json!({
                "connection": connection,
                "record_id": record_id,
                "record_revision": record_revision,
            }),
        )
    }

    pub fn commit(&self, commit: &Commit) -> Result<(), String> {
        let request = serde_json::to_string(commit).map_err(|error| error.to_string())?;
        self.0.call("mappings.commit.v1", &request).map(drop)
    }

    /// The mapping of a record.
    pub fn get(
        &self,
        connection: Option<&str>,
        record_id: &str,
    ) -> Result<Option<Mapping>, String> {
        #[derive(Deserialize)]
        struct Found {
            mapping: Option<Mapping>,
        }
        let found: Found = call(
            &self.0,
            "mappings.get.v1",
            json!({ "connection": connection, "record_id": record_id }),
        )?;
        Ok(found.mapping)
    }

    /// Gives a lease back without recording a result.
    pub fn release(
        &self,
        connection: Option<&str>,
        record_id: &str,
        lease_token: &str,
    ) -> Result<(), String> {
        self.0
            .call(
                "mappings.release.v1",
                &json!({
                    "connection": connection,
                    "record_id": record_id,
                    "lease_token": lease_token,
                })
                .to_string(),
            )
            .map(drop)
    }

    /// A page of one connection's mappings, optionally in one `status`, in
    /// record ID order. Pass the page's `next` as `after` to read on.
    /// `limit` is 1–100 (100 when absent).
    pub fn list(
        &self,
        connection: Option<&str>,
        status: Option<&str>,
        after: Option<&str>,
        limit: Option<u32>,
    ) -> Result<MappingPage, String> {
        call(
            &self.0,
            "mappings.list.v1",
            json!({
                "connection": connection,
                "status": status,
                "after": after,
                "limit": limit,
            }),
        )
    }

    /// Forgets a record's mapping. Refused while another worker holds a live
    /// lease; pass your own `lease_token` to delete under it. Returns whether
    /// a mapping existed.
    pub fn delete(
        &self,
        connection: Option<&str>,
        record_id: &str,
        lease_token: Option<&str>,
    ) -> Result<bool, String> {
        #[derive(Deserialize)]
        struct Deleted {
            deleted: bool,
        }
        let deleted: Deleted = call(
            &self.0,
            "mappings.delete.v1",
            json!({
                "connection": connection,
                "record_id": record_id,
                "lease_token": lease_token,
            }),
        )?;
        Ok(deleted.deleted)
    }
}

/// A page of [`Mappings::list`].
#[derive(Clone, Debug, Deserialize, PartialEq)]
pub struct MappingPage {
    pub mappings: Vec<Mapping>,
    /// The record ID to pass as `after`; `None` on the last page.
    pub next: Option<String>,
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::testing::FakeHost;

    #[test]
    fn begin_answers_are_typed() {
        let host = FakeHost::answering(&[
            Ok(r#"{"outcome":"proceed","lease_token":"t","mapping":null}"#),
            Ok(
                r#"{"outcome":"stale","mapping":{"record_id":"r","status":"synced","external_id":"9"}}"#,
            ),
            Ok(r#"{"outcome":"busy","lease_until":"2026-01-01T00:00:00Z"}"#),
        ]);
        let mappings = Mappings(&host);
        assert!(matches!(
            mappings.begin(Some("eu"), "r", 4).unwrap(),
            Begin::Proceed { .. }
        ));
        let Begin::Stale {
            mapping: Some(mapping),
        } = mappings.begin(None, "r", 4).unwrap()
        else {
            panic!("expected stale");
        };
        assert_eq!(mapping.external_id.as_deref(), Some("9"));
        assert!(matches!(
            mappings.begin(None, "r", 4).unwrap(),
            Begin::Busy { .. }
        ));
    }

    #[test]
    fn commit_sends_only_what_is_set() {
        let host = FakeHost::answering(&[Ok(r#"{"mapping":{"record_id":"r","status":"synced"}}"#)]);
        Mappings(&host)
            .commit(&Commit {
                record_id: "r".into(),
                status: "synced".into(),
                lease_token: Some("t".into()),
                ..Commit::default()
            })
            .unwrap();
        assert_eq!(
            host.calls.borrow()[0].1,
            json!({"record_id": "r", "status": "synced", "lease_token": "t"})
        );
    }

    #[test]
    fn list_pages_by_record_id() {
        let host = FakeHost::answering(&[
            Ok(r#"{"mappings":[{"record_id":"a","status":"rejected"}],"next":"a"}"#),
            Ok(r#"{"mappings":[],"next":null}"#),
        ]);
        let mappings = Mappings(&host);
        let page = mappings
            .list(Some("eu"), Some("rejected"), None, Some(1))
            .unwrap();
        assert_eq!(page.mappings[0].status, "rejected");
        let last = mappings
            .list(Some("eu"), Some("rejected"), page.next.as_deref(), Some(1))
            .unwrap();
        assert_eq!(last.next, None);
        assert_eq!(
            host.calls.borrow()[1].1,
            json!({"connection": "eu", "status": "rejected", "after": "a", "limit": 1})
        );
    }

    #[test]
    fn delete_reports_whether_a_mapping_existed() {
        let host = FakeHost::answering(&[Ok(r#"{"deleted":true}"#)]);
        assert!(Mappings(&host).delete(None, "r", Some("t")).unwrap());
        assert_eq!(
            host.calls.borrow()[0],
            (
                "mappings.delete.v1".to_owned(),
                json!({"connection": null, "record_id": "r", "lease_token": "t"})
            )
        );
    }
}
