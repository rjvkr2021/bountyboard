# ADR-002: Account naming and slugs

- **Status:** Accepted
- **Date:** 2026-11-06
- **Related:** ADR-001, ADR-003

## Context

Per-repo tenancy creates three on-chain accounts per repo:

- The DAO treasury and governance account.
- The BountyBoard policy contract.
- The scoped oracle account.

NEAR account IDs are limited to 64 characters, are globally unique, and cannot be renamed after creation. Repo names can be long, duplicated across owners, and can change. The naming scheme must be predictable, collision-safe, and usable in URLs.

## Decision

Use a platform root account and deterministic subaccounts:

```text
<slug>.dao.<root>
<slug>.board.<root>
<slug>.oracle.<root>
```

Example with root `bountyboard.testnet`:

```text
acme-widgets.dao.bountyboard.testnet
acme-widgets.board.bountyboard.testnet
acme-widgets.oracle.bountyboard.testnet
```

### Slug rules

- Lowercase ASCII letters, digits, and hyphens only: `[a-z0-9-]`.
- Length 3–32 characters.
- Must start and end with a letter or digit.
- No consecutive hyphens.
- Reserved words rejected: `dao`, `board`, `oracle`, `admin`, `api`, `app`, `www`, `mail`, `support`, `bountyboard`.
- Globally unique within the platform root; uniqueness is keyed by slug, not by GitHub repo name.
- Auto-suggested from `<owner>-<repo>` (truncated), but the user may edit before reservation.
- The slug is immutable after deployment. A different name requires a new board and retirement of the old one by council decision.

### Ownership of names

- The platform root creates subaccounts during launch.
- After initialization, the root cannot add keys to or take over a subaccount.
- The launch service removes its own keys and retains no control.
- The DAO council controls the DAO; the DAO controls the board.

### Display metadata

- Display name, description, logo, and GitHub URL are off-chain indexer fields and may change.
- The canonical on-chain identifiers are the numeric GitHub repo ID (`u64`) and the account IDs above.
- Repo renames update display metadata only; the board accounts do not change.

## Consequences

### Positive

- Human-readable, predictable URLs and explorer entries.
- Numeric repo ID prevents rename/transfer impersonation.
- Slug immutability avoids dangling references in payouts and reputation.

### Negative

- The platform must own and operate a root account.
- Users cannot bring an existing DAO account under this scheme in beta.
- Long repo names need truncation or a user-chosen shorter slug.
- A typo in a slug is permanent for that deployment.

### Neutral

- Advanced users may later deploy under their own account; that path needs a separate naming ADR.

## Alternatives considered

### User-owned accounts

`<slug>.<user>.near` or a user-created top-level account.

- Pros: no platform root.
- Cons: requires the user to create accounts and sign multiple transactions; inconsistent URLs; harder launch automation.
- Deferred.

### Numeric or hash-only accounts

`r<github_repo_id>.dao.<root>`.

- Pros: no collisions, short.
- Cons: unreadable; poor UX and explorer legibility.
- Rejected.

### Allow existing Sputnik DAOs

Attach a board to a DAO the user already owns.

- Pros: meets existing DAO users where they are.
- Cons: needs a separate verification and policy-compatibility path.
- Deferred; the launch service can add a "bring your own DAO" lane later.

## Follow-ups

- Enforce the 64-character limit in the launch UI and service.
- Add the reserved-word list to the database and validation tests.
- Reserve slugs with a short hold before deployment to prevent races.
- Check chain account availability before submitting the deployment.
