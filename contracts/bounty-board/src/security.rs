use sha2::{Digest, Sha256};

use crate::errors::ContractError;

pub const MAX_ADVISORY_URL_LEN: usize = 2048;

pub fn normalize_ghsa_id(raw: &str) -> String {
    raw.trim().to_ascii_uppercase()
}

pub fn private_ref_for(ghsa_id: &str) -> String {
    let normalized = normalize_ghsa_id(ghsa_id);
    let digest = Sha256::digest(normalized.as_bytes());
    let mut out = String::with_capacity(64);
    for byte in digest {
        out.push_str(&format!("{byte:02x}"));
    }
    out
}

pub fn is_valid_private_ref(private_ref: &str) -> bool {
    private_ref.len() == 64
        && private_ref
            .bytes()
            .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte))
}

pub fn normalize_handle(raw: &str) -> Result<String, ContractError> {
    let handle = raw
        .trim()
        .strip_prefix('@')
        .unwrap_or(raw.trim())
        .to_ascii_lowercase();
    if handle.is_empty()
        || handle.len() > 39
        || handle.starts_with('-')
        || handle.ends_with('-')
        || !handle
            .bytes()
            .all(|byte| byte.is_ascii_lowercase() || byte.is_ascii_digit() || byte == b'-')
    {
        return Err(ContractError::InvalidHandle);
    }
    Ok(handle)
}

pub fn normalize_researcher_handle(raw: &str) -> Result<String, ContractError> {
    normalize_handle(raw)
}

pub fn normalize_advisory_url(raw: &str) -> Result<String, ContractError> {
    let url = raw.trim();
    if url.len() < 10
        || url.len() > MAX_ADVISORY_URL_LEN
        || !url.starts_with("https://")
        || url.chars().any(char::is_whitespace)
    {
        return Err(ContractError::InvalidAdvisoryUrl);
    }
    Ok(url.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn known_ghsa_vector_is_stable() {
        assert_eq!(
            private_ref_for("GHSA-AAAA-BBBB-CCCC"),
            "20afedace1019a892127a0b8a584c379427b55b41e07aa29aafb9b2ffe0837fb"
        );
    }

    #[test]
    fn ghsa_trim_and_case_are_equivalent() {
        assert_eq!(
            normalize_ghsa_id(" ghsa-aaaa-bbbb-cccc "),
            "GHSA-AAAA-BBBB-CCCC"
        );
        assert_eq!(
            private_ref_for(" ghsa-aaaa-bbbb-cccc "),
            private_ref_for("GHSA-AAAA-BBBB-CCCC")
        );
    }

    #[test]
    fn private_ref_validation_rejects_bad_values() {
        assert!(is_valid_private_ref(&"a".repeat(64)));
        assert!(!is_valid_private_ref(&"a".repeat(63)));
        assert!(!is_valid_private_ref(&"a".repeat(65)));
        assert!(!is_valid_private_ref(&"A".repeat(64)));
        assert!(!is_valid_private_ref(&"g".repeat(64)));
    }

    #[test]
    fn researcher_handle_is_normalized() {
        assert_eq!(
            normalize_researcher_handle(" @Researcher-1 ").unwrap(),
            "researcher-1"
        );
        assert_eq!(
            normalize_researcher_handle(""),
            Err(ContractError::InvalidHandle)
        );
    }

    #[test]
    fn advisory_url_is_https_and_bounded() {
        assert_eq!(
            normalize_advisory_url(
                "https://github.com/o/r/security/advisories/GHSA-AAAA-BBBB-CCCC"
            )
            .unwrap(),
            "https://github.com/o/r/security/advisories/GHSA-AAAA-BBBB-CCCC"
        );
        assert_eq!(
            normalize_advisory_url("http://example.com/advisory"),
            Err(ContractError::InvalidAdvisoryUrl)
        );
        assert_eq!(
            normalize_advisory_url("https://example.com/with space"),
            Err(ContractError::InvalidAdvisoryUrl)
        );
        assert_eq!(
            normalize_advisory_url(""),
            Err(ContractError::InvalidAdvisoryUrl)
        );
    }
}
