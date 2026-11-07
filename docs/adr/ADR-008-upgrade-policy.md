# ADR-008: Board upgrade policy

- **Status:** Proposed
- **Date:** 2026-11-06
- **Related:** ADR-001, ADR-003, ADR-009

## Context

Per-repo boards mean a bug in the contract affects one repo, but a bug can still block payouts or corrupt that repo's bounty state. The platform needs a credible answer to "what happens when you find a bug after launch?"

Upgrade keys recreate the centralization the contract was designed to avoid. Full immutability makes bugs permanent. The decision affects the audit scope and the launch trust story.

## Decision

For the public testnet beta and the first mainnet release:

- Deploy **immutable per-repo boards** from a pinned, audited wasm.
- Publish the wasm hash and expose `version()`.
- Give the launch service **no upgrade authority**.
- Provide a verification page that shows the deployed wasm hash and launch transactions.

### If a board needs replacement

1. Council pauses the board (existing `pause_repo`).
2. A replacement board is deployed from a fixed wasm under a new account.
3. The indexer marks the old board as `retired` and the new board as canonical for the repo.
4. Reputation history is preserved by the indexer based on identities and payout records.
5. Unpaid bounties are recreated on the replacement by council action; paid history stays on the old board.
6. The old DAO role for the retired board is revoked.

This is an emergency path, not a routine upgrade mechanism.

### Revisit before mainnet

Evaluate a DAO-controlled upgrade model:

- A per-board `upgrade(new_wasm)` callable only by that repo's DAO through a full-council vote.
- State migration guarded by a version field and tested migrations.
- A time-lock or challenge window before the new code becomes active.

If adopted, it supersedes this ADR. Until then, immutability is the default.

## Consequences

### Positive

- No platform key can alter a board.
- Users can verify exactly what code runs their treasury policy.
- Audit scope is smaller: no upgrade proxy or migration logic.

### Negative

- Critical bugs require replacement, which is disruptive.
- State migration is manual and limited in beta.
- The pinned wasm hash becomes a long-lived trust anchor.

### Neutral

- The DAO can always revoke the board role and pause the repo, even without upgrades.

## Alternatives considered

### Platform-held upgrade key

- Pros: fast fixes.
- Cons: the platform can change policy and payout logic; unacceptable for treasury trust.
- Rejected.

### DAO-controlled upgrade from day one

- Pros: each repo controls its own fixes.
- Cons: proxy and migration complexity, larger audit surface, delayed beta.
- Deferred and to be re-evaluated before mainnet.

### Factory-controlled upgrades

- Pros: one fix for all boards.
- Cons: shared authority across DAOs; recreates the shared-contract risk.
- Rejected.

## Follow-ups

- Add `version()` and expose it in the app.
- Build the verification page with wasm hash and transaction links.
- Write the replacement runbook in R7.
- Revisit this ADR during the pre-mainnet audit.
