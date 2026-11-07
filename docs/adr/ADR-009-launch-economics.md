# ADR-009: Launch economics

- **Status:** Proposed
- **Date:** 2026-11-06
- **Related:** ADR-002, ADR-003

## Context

A public platform has real costs per launched repo:

- NEAR account creation and storage for the DAO, board, and oracle.
- Wasm deployment and policy initialization.
- Proposal and bounty bond reserves.
- Launch-service infrastructure, KMS, RPC, Postgres, workers, and monitoring.
- Support and moderation.

Free, unlimited launches invite spam and low-quality boards. Charging too much blocks the open-source maintainers the product targets. The fee must never make the platform a custodian of treasury funds.

## Decision

- **Testnet beta:** launches are sponsored and free, with rate limits and GitHub account-age checks.
- **Mainnet:** require a small **non-refundable launch fee** plus a minimum initial treasury deposit.
  - The fee covers storage, deployment, and anti-spam. Target cost + a small buffer, not profit.
  - The minimum treasury deposit ensures the DAO can cover bonds and at least one small bounty.
  - Exact amounts are set by the R0 cost spike and published on the pricing page; they are not hardcoded in this ADR.
- **No platform fee on payouts** in beta.
- Failed launches before any account is created are refundable. Failed launches after deployment are not, but the service must leave an auditable record and support path.
- The launch fee and minimum deposit are paid by the user or sponsor, never deducted from a bounty or from contributor payouts.
- The launch service may fund the BountyBoard reserve from the launch fee as a separate, disclosed item.

### Anti-spam

- GitHub repo admin verification.
- GitHub account age and verified-email signals.
- Per-account and per-IP launch rate limits.
- Manual allowlist during early beta.
- Reputation/allowlist for known maintainers later.

### Sustainability

- The platform may add an optional flat SaaS tier or a DAO-approved fee later.
- Any future fee change needs a new ADR and public notice.
- The platform never takes custody of treasury funds and never takes a percentage of payouts without explicit user consent.

## Consequences

### Positive

- Reduces spam and covers real costs.
- Maintains a clear non-custodial boundary.
- Predictable pricing for maintainers.

### Negative

- A launch fee is friction for small projects.
- Fee collection creates accounting and possibly tax obligations.
- Sponsored testnet launches are a platform cost.

### Neutral

- Pricing is a product surface that can change by ADR without touching the contract.

## Alternatives considered

### Fully free launches

- Pros: maximum adoption.
- Cons: spam, cost overrun, low-quality boards.
- Rejected for mainnet; used for testnet beta.

### Refundable deposit

- Pros: less friction.
- Cons: refund handling, abuse via repeated launch/cancel.
- Rejected.

### Percentage fee on payouts

- Pros: aligned with usage.
- Cons: requires routing funds through the platform or extra contract logic; conflicts with non-custodial design.
- Rejected for beta.

### Subscription/SaaS

- Pros: predictable revenue.
- Cons: billing complexity and a different product motion.
- Deferred.

## Follow-ups

- Run the deployment cost spike in R0.
- Publish a pricing page and receipts.
- Add rate-limit and anti-spam configuration.
- Legal review of fees and refunds.
