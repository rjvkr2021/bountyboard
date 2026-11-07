# ADR-004: GitHub repo ownership verification

- **Status:** Accepted
- **Date:** 2026-11-06
- **Related:** ADR-002, ADR-003, ADR-011

## Context

Only a repo's owner/admin should be able to open a DAO for it. "Owner" is unambiguous for user-owned repos but ambiguous for organizations, where the org owns the repo and individuals have admin permission. Attackers can also fork a popular repo and try to launch a lookalike board.

Verification must be automatic, auditable, and resistant to rename/transfer impersonation.

## Decision

Use the GitHub App user-to-server token plus the App installation:

1. The user authorizes the GitHub App and submits a repo.
2. With the user token, call GraphQL `repository(owner, name) { viewerPermission }` and require `ADMIN`.
   - Fallback: REST `GET /repos/{owner}/{repo}` and require `permissions.admin == true`.
3. With the installation token, confirm the App is installed on that repository.
4. Fetch and store the numeric `repository.id`; it is the canonical identity.
5. Reject:
   - `fork == true`
   - `archived == true`
   - `disabled == true`
   - Repos with no commits
   - Mirrors, unless explicitly supported later
6. Record the verifying GitHub user ID, handle, timestamp, and method.

### Organization-owned repos

- Require the individual to have `ADMIN` on the repo.
- If the organization enforces an app-installation or ownership policy, respect it.
- Optionally require org-owner approval before launch; this is a policy flag, not a hard requirement for beta.
- Display the verifying account on the board so contributors can see who vouched for it.

### Renames and transfers

- Use the numeric repo ID to survive renames.
- On `repository.renamed`, update display metadata; no re-verification required.
- On `repository.transferred`:
  - Immediately mark the board unverified and pause new bounty creation.
  - Existing approved work and payouts continue.
  - The new repo admin must re-verify and the existing council must accept the transfer before new bounties resume.
  - If the new admin does not verify within a configured window, the board stays paused.

### Forks and lookalikes

- Reject forks outright.
- The directory shows the numeric repo ID, owner, and verification source.
- Report/blocklist flows cover impersonation attempts.

## Consequences

### Positive

- Automated, reproducible ownership checks.
- Numeric IDs prevent handle and repo-name impersonation.
- Transfer handling prevents a new owner from silently inheriting a treasury-backed board.

### Negative

- Requires the GitHub App to be installed before launch.
- Org policies may add friction.
- GitHub API availability and permission changes can affect launches.

### Neutral

- Repo admins are treated as owners; org-owner approval is optional policy.

## Alternatives considered

### OAuth `repo` scope only

- Pros: simple.
- Cons: broad access, no webhooks, no per-repo installation, weaker least-privilege story.
- Rejected for platform operations; user authorization remains for identity.

### Commit-a-nonce proof

The user pushes a file with a nonce to prove write access.

- Pros: no broad OAuth scopes.
- Cons: extra friction, pollutes the repo, and admin permission is the real requirement.
- Rejected.

### Manual review

- Rejected for public beta; kept for emergency disputes.

## Follow-ups

- Implement the verification call and record it in the launch audit log.
- Add tests for fork, archived, disabled, empty, renamed, and transferred repos.
- ADR-011 defines the exact GitHub App permissions.
