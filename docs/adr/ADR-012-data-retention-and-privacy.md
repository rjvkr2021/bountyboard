# ADR-012: Data retention and privacy

- **Status:** Accepted
- **Date:** 2026-11-06
- **Related:** ADR-004, ADR-005, ADR-011

## Context

A public platform collects:

- GitHub numeric IDs, handles, avatars, and optionally emails.
- NEAR account IDs and signatures.
- OAuth and installation tokens.
- Webhook payloads, including issue and PR metadata.
- Private security advisory metadata after publication.
- On-chain data, which is public and effectively permanent.

The product must minimize data, protect secrets, and explain what cannot be deleted.

## Decision

### Data minimization

Store only what the product needs:

- GitHub numeric user ID, handle, avatar URL.
- NEAR account ID.
- Optional email for notifications (not required for identity).
- Repo numeric ID, full name, and public metadata.
- Bounty, claim, approval, and payout records.
- No advisory bodies, titles, descriptions, CVEs, or affected-version details.
- Before publication, only `sha256(ghsa_id)` is stored; the GHSA ID appears only after the oracle records publication.

### Tokens

- Never store GitHub access tokens in plaintext or logs.
- Sessions use short-lived tokens; installation tokens stay in memory.
- If a refresh token must persist, encrypt it with a KMS-managed key.
- Rotate and revoke on unlink.

### Retention

- Account and identity data: retained while the account is active and needed for reputation and payouts.
- Webhook payload bodies: retained only as long as needed for processing and debugging, default 30 days.
- Application logs: 30–90 days, with redaction of tokens, emails, and advisory content.
- Backups: encrypted, with a defined maximum retention period.
- Deleted accounts: off-chain PII removed or anonymized; an opaque tombstone prevents GitHub ID reuse abuse.
- On-chain data cannot be deleted. The privacy policy must say so explicitly.

### User rights

Provide:

- Access: export identity, reputation, and payout history.
- Correction: update handle/email via re-authorization.
- Deletion: unlink and delete off-chain PII where legally permitted.
- Explanation: on-chain records, including the GitHub handle ↔ NEAR mapping, remain public.

### Access control

- Least privilege for staff access to PII.
- Audit logs for admin access.
- No PII in analytics events; use opaque IDs.
- No selling or sharing PII with third parties beyond infrastructure subprocessors.

### Legal surfaces

Before public beta, publish:

- Terms of service.
- Privacy policy.
- Data processing and subprocessor list.
- Tax and payment disclaimer: the platform is not a custodian; contributors handle their own taxes.
- Security disclosure policy.

## Consequences

### Positive

- Lower breach impact and clearer user trust.
- Compliance-ready foundation for a public launch.
- Advisory confidentiality is preserved.

### Negative

- On-chain identity links cannot be fully deleted; some users may object.
- Retention jobs and redaction need ongoing maintenance.
- Legal review is required before mainnet.

### Neutral

- Reputation may need to survive account anonymization; handle it with opaque IDs.

## Alternatives considered

### No persistent PII

- Pros: minimal risk.
- Cons: no profiles, notifications, or cross-repo reputation.
- Rejected.

### Store hashed identities only

- Pros: privacy.
- Cons: cannot display handles or match GitHub webhooks reliably.
- Rejected.

### Store OAuth tokens for background sync

- Pros: convenient.
- Cons: high breach impact; webhooks and installation tokens are better.
- Rejected.

## Follow-ups

- Write the privacy policy and ToS in R7.
- Implement redaction in logs and analytics.
- Add retention and deletion jobs.
- Document on-chain permanence in the UI before identity linking.
