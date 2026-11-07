# ADR-001: Per-repo tenancy

- **Status:** Accepted
- **Date:** 2026-11-06
- **Related:** ADR-003, ADR-005, ADR-006, ADR-008

## Context

The original product was single-tenant: one Sputnik DAO, one BountyBoard contract, and one repository per app deployment, onboarded by operator scripts. The platform requires many repos, each with its own treasury and governance. The central question is whether multiple repos/DAOs share one BountyBoard contract or each repo gets its own.

## Decision

Use **per-repo tenancy**:

- Each repo gets its own Sputnik DAO, its own BountyBoard contract, and its own scoped oracle account.
- The platform runs one shared **indexer and directory** for discovery, issue sync, and cross-repo reputation.
- There is **no shared spending contract** across DAOs.
- The existing BountyBoard contract remains the per-repo template rather than being rewritten into a multi-DAO contract.

## Consequences

### Positive

- Treasury blast radius is isolated to one repo. A bug or compromised board cannot touch another repo's treasury.
- Each DAO grants roles only to its own board and oracle.
- The existing contract, tests, and security work are reused with additive changes.
- Users can verify a pinned wasm hash for their board.
- Council can revoke a board's DAO role without affecting other repos.
- Incident response can pause or replace one board.

### Negative

- More deployments and more operational overhead than a single shared contract.
- Reputation is fragmented on-chain; the indexer must aggregate it.
- Policy initialization and oracle key provisioning repeat per repo.
- Cross-repo queries depend on the indexer being available.

### Neutral

- Cross-repo identity is handled by the shared identity service and indexer, not by shared contract state.
- A repo still maps to exactly one canonical board.

## Alternatives considered

### Shared multi-DAO BountyBoard

Move `dao` into `Repo` and serve every repo from one contract.

- Pros: one deployment, native cross-repo reputation, simpler discovery.
- Cons: every DAO must trust the same contract and upgrade authority; one bug affects all treasuries; per-DAO isolation is lost.
- Rejected for public release. Reconsider only if deployment cost becomes prohibitive and a DAO-controlled upgrade model is proven.

### Fully client-side per-user deployments

Users deploy their own DAO and board from the wallet.

- Pros: strongest trust model; no operated deployer.
- Cons: poor UX, high friction, requires users to hold funds and understand NEAR account creation; slower to ship.
- Rejected for beta; keep as an advanced path later.

### No per-repo contract, indexer-only policy

Enforce policy entirely off-chain.

- Rejected: violates the core guarantee that treasury policy is on-chain and verifiable.

## Follow-ups

- ADR-003 defines the deployment service.
- ADR-005 defines the shared indexer and reconciliation.
- ADR-006 defines cross-repo reputation aggregation.
- ADR-008 defines the board upgrade/replacement policy.
