# ADR-011: GitHub App scope

- **Status:** Accepted
- **Date:** 2026-11-06
- **Related:** ADR-004, ADR-005, ADR-012

## Context

The original integration used a GitHub OAuth app plus per-repo repository workflows with `read:user`, `user:email`, and `security_events` scopes. That model required per-repo workflow setup, could not reliably sync issues, and did not give the platform a clean ownership check. A GitHub App provides per-repo installation, fine-grained permissions, and webhooks.

## Decision

Use a GitHub App for platform operations and user authorization for identity.

### Repository permissions

| Permission | Level | Purpose |
| --- | --- | --- |
| Metadata | Read | Mandatory; repo details and rename/transfer events |
| Issues | Read | Issue open/close and label sync |
| Pull requests | Read | Merge detection and linked issue parsing |
| Contents | Read | Commit metadata and repo checks |
| Repository security advisories | Read | GHSA details and `repository_advisory` events |

### Organization permissions

| Permission | Level | Purpose |
| --- | --- | --- |
| Members | Read | Optional; org ownership checks |

### Account permissions

| Permission | Level | Purpose |
| --- | --- | --- |
| Email addresses | Read | Optional; notifications only |

Do **not** request:

- Administration
- Actions
- Any write permission
- Any organization administration permission

### Webhook events

- `issues`
- `pull_request`
- `repository`
- `repository_advisory`
- `installation`
- `installation_repositories`

### User authorization

- Use the App's user-to-server token for the signed-in user.
- Use it only for:
  - repo `viewerPermission` / `permissions.admin` verification (ADR-004),
  - listing the user's accessible repos during launch,
  - gated private-advisory detail reads by maintainers and council.
- Do not use a classic OAuth `repo` scope for platform operations.

### Token and webhook handling

- Verify `X-Hub-Signature-256` on every webhook before parsing.
- Deduplicate by `X-GitHub-Delivery`.
- Do not log payloads containing advisory content, tokens, or emails.
- Keep installation tokens short-lived and in memory; never persist them.
- Encrypt any refresh token that must be stored; prefer session-only storage.
- Request the minimum permissions; a permission change requires user re-consent.

### Private security advisories

- The `repository_advisory.published` event supplies the GHSA ID, advisory URL, and credited user.
- Details are fetched only through the viewer's own GitHub access, never stored.
- Never log advisory titles, descriptions, CVEs, or GHSA IDs before publication.

## Consequences

### Positive

- Per-repo installs and least-privilege permissions.
- Native issue and PR webhooks; no per-repo workflow files.
- Cleaner ownership verification and transfer detection.

### Negative

- Users must install the App before launching.
- GitHub App review may be needed for sensitive permissions.
- Permission changes require re-consent and directory refresh.

### Neutral

- The existing GitHub Actions workflows can remain as a fallback during migration.

## Alternatives considered

### OAuth app plus repository webhooks

- Pros: familiar.
- Cons: needs `admin:repo_hook`, broad scopes, per-repo setup.
- Rejected.

### Personal access tokens

- Rejected: unsafe and user-hostile.

### GitHub Actions only

- Pros: already implemented.
- Cons: requires workflow files per repo; no issue sync or ownership verification; poor multi-tenant UX.
- Kept only as a fallback.

## Follow-ups

- Register the App and document the exact permission list.
- Implement webhook verification and deduplication.
- Add an app-install step to the launch wizard.
- Confirm `Repository security advisories` availability with GitHub.
