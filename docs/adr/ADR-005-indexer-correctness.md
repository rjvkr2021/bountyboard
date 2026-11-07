# ADR-005: Indexer and read-model correctness

- **Status:** Accepted
- **Date:** 2026-11-06
- **Related:** ADR-001, ADR-006, ADR-007, ADR-011

## Context

The platform currently reads and writes a local JSON store; a production multi-repo platform needs:

- a directory of repos and boards,
- search and filtering,
- issue and PR state from GitHub,
- cross-repo reputation,
- a proposals inbox,
- fast page loads without scanning every board on every request.

The platform must do this without letting the read model become a source of truth for money or governance.

## Decision

Build a Postgres read model fed by a dedicated indexer.

### Source-of-truth rules

- **Chain is authoritative** for DAO policy, bounty state, approvals, payouts, and reputation events.
- **GitHub is authoritative** for issue title/state/labels and PR merge state.
- The indexer joins the two but never overrides either.
- No indexer state change can move funds or alter on-chain policy.

### Ingestion

- Prefer NEAR Lake (or an equivalent finalized stream) for BountyBoard and DAO events per board.
- Fall back to RPC polling with finality checks where Lake is unavailable.
- GitHub App webhooks for `issues`, `pull_request`, `repository`, `repository_advisory`, `installation`, and `installation_repositories`.
- Backfill each board from its deployment block.
- Separate cursors per contract and per webhook stream.

### Delivery semantics

- At-least-once processing with idempotency keys:
  - `(contract_id, block_height, event_index)`
  - GitHub `X-GitHub-Delivery` ID
- Only process finalized chain blocks for money and status. Optimistic/pending UI is allowed, but must be labelled.
- Verify webhook HMAC signatures before processing.
- Store block hash and height; detect and handle reorgs by rewinding the affected cursor.
- Retry failed webhook deliveries and failed chain ranges with backoff; dead-letter after a limit.

### Data model

Initial tables: `repositories`, `deployments`, `boards`, `issues`, `bounties`, `claims`, `payouts`, `identities`, `reputation`, `proposals`, `webhook_deliveries`, `notifications`, `indexer_cursors`.

### Reconciliation

- A scheduled job compares on-chain view results (`get_issue`, `get_payouts`, `get_repo`, `get_policy`) with the read model per board.
- Drift is reported and fixed by re-deriving from chain events, not by manual edits.
- Payout status is never marked final before the chain is final.

### Rebuildability

- The read model must be rebuildable from chain events plus GitHub history.
- PII that cannot be rebuilt (emails, OAuth tokens) lives in separate tables with their own retention rules (ADR-012).
- A board can be de-indexed and re-indexed without affecting on-chain state.

### Environments

- Separate databases or schemas and cursors for `testnet` and `mainnet`.
- No cross-network joins.

## Consequences

### Positive

- Fast directory, search, and profile pages.
- Cross-repo reputation is possible without a shared contract.
- Failures are recoverable by replaying events.

### Negative

- Eventual consistency: the UI can lag chain or GitHub.
- Operational burden: workers, database, monitoring, backfills.
- Incorrect indexing can mislead users even though funds are safe.

### Neutral

- The on-chain registry becomes optional; the indexer-derived directory is enough for beta.

## Alternatives considered

### RPC reads only

- Pros: no database.
- Cons: slow and expensive at scale; cannot support directory search or cross-repo reputation.
- Rejected.

### Third-party indexer only

- Pros: less operational work.
- Cons: coverage, latency, and availability dependencies; may not decode BountyBoard events.
- Considered as a supplement, not the primary source.

### On-chain registry only

- Pros: censorship-resistant directory.
- Cons: no issue metadata, search, or fast stats; still needs GitHub ingestion.
- Deferred to pre-mainnet.

## Follow-ups

- Choose Lake versus RPC per environment in the R0 spike.
- Define the cursor and idempotency schema.
- Build the reconciliation report and alerts for indexer lag.
- Add alerting for webhook signature failures and dead letters.
