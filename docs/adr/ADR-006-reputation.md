# ADR-006: Reputation and ratings

- **Status:** Accepted
- **Date:** 2026-11-06
- **Related:** ADR-001, ADR-005

## Context

The requirements ask for an overall contributor rating and a per-repo rating. The contract tracks global reputation points, completed count, total earned, and payout IDs. Points are tier-based.

A single opaque score is easy to game, hard to explain, and creates disputes. A public platform also needs reputation to be portable across independently deployed boards.

## Decision

Ship **transparent, component-based reputation stats**, not a synthetic score.

### Global stats

- Completed bounties.
- Total points, using the existing tier table.
- Total earned (NEAR).
- Tier breakdown (S0/S1/S2/S3).
- Active repos (repos with at least one paid bounty).
- Tenure (first payout date).
- Security research counts (advisory-linked payouts).

### Per-repo stats

The same counters scoped to one repo.

### Optional presentation

- Percentiles and badges are display-only and computed by the indexer.
- Example badges: first bounty, S0 completed, security researcher, trusted maintainer.
- Any percentile must show its inputs and is never used for on-chain access control.

### Aggregation

- The indexer derives stats from payout records across boards.
- Chain remains authoritative for each payout; the indexer only aggregates.
- Reputation is not stored as a mutable on-chain rank and does not reset on promotion.
- A board replacement does not erase reputation history; the indexer carries it forward by identity.

### Anti-gaming

- Identity verification: numeric GitHub ID plus NEAR signature (ADR-012).
- GitHub account-age and verified-email signals.
- Per-repo budget and per-maintainer caps remain the main spend controls.
- Council veto and maintainer removal remain the social backstop.
- No token-weighted or pay-to-boost reputation in beta.

## Consequences

### Positive

- Users can see exactly why a contributor ranks where they do.
- Stats are portable and rebuildable from events.
- Avoids a contentious "score" formula and appeals process.

### Negative

- No single comparable number for sorting; the UI must choose sensible sort keys.
- Sybil farming remains possible without stronger identity and account-age signals.
- Per-repo stats require correct repo attribution in payout records.

### Neutral

- A composite score can be added later as an optional view if users ask for it.

## Alternatives considered

### Elo-style or weighted score

- Pros: comparable number.
- Cons: opaque, gameable, requires dispute handling.
- Rejected for beta.

### Stake-weighted reputation

- Pros: sybil cost.
- Cons: favors wealthy accounts; contradicts contribution-based reputation.
- Rejected.

### Percentile-only rating

- Pros: simple.
- Cons: meaningless on small samples; hides the underlying work.
- Rejected as the primary model.

## Follow-ups

- Define the API response shape for global and per-repo stats.
- Add reputation rebuild tests from payout fixtures.
- Add badge rules and display copy.
- Ensure payout records store repo ID and GitHub numeric author ID.


Update (2026-11-07): Promotion no longer uses points. Closed-PR counts by tier drive maintainer and council eligibility; points remain a historical reputation stat.
