//! Public links to record files (host ABI 1.1), for destinations that fetch
//! media themselves, sometimes hours after a listing is submitted. Needs
//! `attricat.files.public_links`, `attricat.files.read` and `attricat.read`.

use serde::Deserialize;
use serde_json::json;
use std::time::Duration;

use crate::{Host, call};

/// The shortest and longest lifetime the host issues.
pub const MIN_LIFETIME: Duration = Duration::from_secs(60);
pub const MAX_LIFETIME: Duration = Duration::from_secs(7 * 24 * 60 * 60);

/// An unguessable link that serves the file without a session until it
/// expires, the record stops referencing the file, or a grant it was issued
/// under is revoked.
#[derive(Clone, Debug, Deserialize, PartialEq)]
pub struct FileLink {
    pub url: String,
    /// RFC 3339.
    pub expires_at: String,
}

pub struct FileLinks<H>(pub H);

impl<H: Host> FileLinks<H> {
    /// Links a file the record references. Inside an operation run, only
    /// records in the run's scope.
    pub fn link(
        &self,
        file_id: &str,
        record_id: &str,
        lifetime: Duration,
    ) -> Result<FileLink, String> {
        if !(MIN_LIFETIME..=MAX_LIFETIME).contains(&lifetime) {
            return Err(format!(
                "file links live {}-{} seconds",
                MIN_LIFETIME.as_secs(),
                MAX_LIFETIME.as_secs()
            ));
        }
        call(
            &self.0,
            "files.link.v1",
            json!({
                "file_id": file_id,
                "record_id": record_id,
                "expires_in_seconds": lifetime.as_secs(),
            }),
        )
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::testing::FakeHost;

    #[test]
    fn a_link_is_issued_for_its_lifetime() {
        let host = FakeHost::answering(&[Ok(
            r#"{"url":"https://a.example/api/public/extension-files/t","expires_at":"2026-11-26T10:00:00Z"}"#,
        )]);
        let link = FileLinks(&host)
            .link("f", "r", Duration::from_secs(86_400))
            .unwrap();
        assert!(link.url.ends_with("/t"));
        assert_eq!(
            host.calls.borrow()[0].1,
            json!({"file_id": "f", "record_id": "r", "expires_in_seconds": 86_400})
        );
    }

    #[test]
    fn lifetimes_out_of_range_never_reach_the_host() {
        let host = FakeHost::default();
        let links = FileLinks(&host);
        assert!(links.link("f", "r", Duration::from_secs(59)).is_err());
        assert!(
            links
                .link("f", "r", MAX_LIFETIME + Duration::from_secs(1))
                .is_err()
        );
        assert!(host.calls.borrow().is_empty());
    }
}
