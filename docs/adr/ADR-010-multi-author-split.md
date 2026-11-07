# ADR-010: Multi-author payout split

- **Status:** Accepted (deferred)
- **Date:** 2026-11-06
- **Related:** ADR-006, ADR-008

## Context

The requirements say that if a merged PR has multiple authors, the payout should be distributed equally. The current contract pays the single merged PR author. Private security bounties pay the first credited individual.

Multi-author payouts are deceptively complex:

- Are authors the PR author, commit authors, `Co-authored-by` trailers, or everyone who touched the issue?
- What about multiple PRs linked to the same issue?
- How are duplicate identities, unlinked NEAR accounts, and rounding handled?
- Native S0 bounties have a single receiver, so equal splits do not fit the native `BountyDone` model.
- Equal splits can be gamed by adding co-authors.

## Decision

Defer automatic multi-author splits to post-beta.

### Beta behavior

- Pay the merged PR author only.
- Document the limitation in the README and the bounty UI.
- For genuine multi-author work, maintainers can:
  - create separate bounties for each contributor, or
  - settle the difference through the DAO with a council-approved transfer, outside BountyBoard reputation.
- Private security bounties continue to pay the first credited individual.

### Schema readiness

- Keep `PayoutRecord` extensible with a list of recipients and weights, even if beta writes a single entry.
- Store GitHub numeric author IDs so future splits can be attributed reliably.
- Do not put a single `recipient` field in a place that blocks a future `recipients[]` migration.

### Semantics to settle before implementation

- Definition of author: PR author plus explicit `Co-authored-by`, or commit authors.
- Multiple PRs: one payout per issue, split across PR authors, or first-merged wins.
- Equal split rounding and dust.
- Unlinked recipients hold their share pending, like the current single-author flow.
- Self-dealing and maintainer conflict checks apply per recipient.
- S0 native bounty handling for multiple recipients.
- Anti-gaming rules for added co-authors.

## Consequences

### Positive

- Beta ships without a complex, ambiguous payout model.
- No risk of splitting a bounty incorrectly or paying sock-puppet co-authors.
- The contract schema is not painted into a corner.

### Negative

- Some contributors in multi-author PRs are not paid automatically.
- The product may look unfair until the feature ships.
- Maintainers must handle exceptions manually.

### Neutral

- Private security remains single-recipient regardless.

## Alternatives considered

### Implement equal split now

- Pros: matches the requirement literally.
- Cons: ambiguous semantics, S0 incompatibility, gaming, and contract complexity before beta.
- Deferred.

### Split by commit count or lines changed

- Pros: feels proportional.
- Cons: easily gamed; not what the requirement asks.
- Rejected.

### First author only, permanently

- Pros: simple.
- Cons: contradicts the requirement and discourages collaboration.
- Rejected as a permanent policy.

## Follow-ups

- Write a dedicated spec before implementation.
- Add `recipients[]` design to the payout schema.
- Add contract and E2E tests for each chosen semantic.
- Update the README limitation once the feature ships.
