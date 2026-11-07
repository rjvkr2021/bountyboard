# Architecture Decision Records

Platform-level decisions for the public multi-repo BountyBoard product. These ADRs sit alongside `PLATFORM.md`, which is the implementation source of truth.

| ADR | Title | Status |
| --- | --- | --- |
| [ADR-001](ADR-001-tenancy.md) | Per-repo tenancy | Accepted |
| [ADR-002](ADR-002-naming.md) | Account naming and slugs | Accepted |
| [ADR-003](ADR-003-launch-trust.md) | Launch service trust model | Accepted |
| [ADR-004](ADR-004-ownership-verification.md) | GitHub repo ownership verification | Accepted |
| [ADR-005](ADR-005-indexer-correctness.md) | Indexer and read-model correctness | Accepted |
| [ADR-006](ADR-006-reputation.md) | Reputation and ratings | Accepted |
| [ADR-007](ADR-007-council-maintainer-sync.md) | Council as default maintainer | Accepted |
| [ADR-008](ADR-008-upgrade-policy.md) | Board upgrade policy | Proposed |
| [ADR-009](ADR-009-launch-economics.md) | Launch economics | Proposed |
| [ADR-010](ADR-010-multi-author-split.md) | Multi-author payout split | Accepted (deferred) |
| [ADR-011](ADR-011-github-app-scope.md) | GitHub App scope | Accepted |
| [ADR-012](ADR-012-data-retention-and-privacy.md) | Data retention and privacy | Accepted |

## Conventions

- Status values: `Proposed`, `Accepted`, `Accepted (deferred)`, `Superseded`, `Rejected`.
- Every ADR records context, decision, consequences, alternatives, and follow-ups.
- Once accepted, an ADR is not rewritten. Supersede it with a new ADR and link both.
