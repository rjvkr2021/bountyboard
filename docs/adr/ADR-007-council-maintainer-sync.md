# ADR-007: Council as default maintainer

- **Status:** Accepted
- **Date:** 2026-11-06
- **Related:** ADR-001, ADR-005, ADR-008

## Context

The requirements say council members should be default maintainers. Today:

- Council membership lives in the Sputnik DAO policy.
- Maintainers live in BountyBoard state.
- An account can be both, but there is no automatic link.

The board's access checks read local maintainer state. Without a sync mechanism, a council member would not be able to create or approve bounties.

## Decision

Mirror council membership into the maintainer set with provenance.

### At launch

- The verified repo admin(s) become the initial council.
- The same accounts are seeded as maintainers with `source: Council`.

### Sync method

- Add `sync_council_maintainers()` to BountyBoard.
- It is permissionless: the oracle, indexer, launch service, or any user may call it.
- It performs an asynchronous `get_policy` call to the DAO and, in the callback, reconciles the maintainer set.
- It is idempotent and safe to call repeatedly.

### Provenance

Track two flags on `MaintainerRecord`:

- `council_derived: bool`
- `promoted: bool`

Rules:

- Adding a council member adds a maintainer with `council_derived = true`.
- Promoting a contributor sets `promoted = true`.
- Removing a council member clears `council_derived`; the account stays a maintainer if `promoted = true`.
- Sync never removes an account that is `promoted`.
- Sync never demotes a council member because they were not in the previous snapshot.

### When sync runs

- At launch.
- After a council-related proposal executes (the indexer or oracle can trigger it).
- Periodically by the indexer.
- On demand from the maintainer/council UI.

### Failure behavior

- If the DAO `get_policy` call fails, no state changes; a later sync retries.
- Sync does not block bounty creation or payouts.
- Large councils are bounded by the DAO policy size; if the list is too large for one callback, cap and continue in pages with a cursor.

## Consequences

### Positive

- Council members can act immediately after launch.
- Provenance prevents accidental demotion of promoted maintainers.
- Works without giving the platform special DAO powers.

### Negative

- Eventual consistency: a new council member may need a sync before acting.
- Extra cross-contract calls and gas.
- Removal semantics need careful tests.

### Neutral

- The DAO remains the only source of council truth; BountyBoard mirrors it.

## Alternatives considered

### Dynamic policy read on every access check

- Pros: always current.
- Cons: cross-contract calls in hot paths are expensive and asynchronous; hard to use in approval checks.
- Rejected.

### Indexer-only mirror

- Pros: no contract change.
- Cons: on-chain access checks would not see council members; unsafe.
- Rejected.

### Give council members a DAO role that maps to board maintainers

- Pros: no sync.
- Cons: the board already needs local state for promoted maintainers; split authority is confusing.
- Rejected.

## Follow-ups

- Add contract fields, method, callback, and events in R1.
- Add tests: add council, remove council with and without promotion, idempotent sync, DAO call failure.
- Surface `council_derived`/`promoted` in the UI.
- Trigger sync from the indexer after `AddMemberToRole`/`RemoveMemberFromRole`.
