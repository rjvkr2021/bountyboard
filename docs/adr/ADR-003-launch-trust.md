# ADR-003: Launch service trust model

- **Status:** Accepted
- **Date:** 2026-11-06
- **Related:** ADR-001, ADR-002, ADR-004, ADR-008, ADR-009

## Context

Self-serve launch requires creating NEAR accounts, deploying the Sputnik DAO and BountyBoard wasm, initializing policy, and configuring roles. Users should not need to run CLI tooling or manage deployer keys. Whoever holds the deployment key has real power and is a centralization point.

The platform must be able to launch boards without being able to steal treasury funds, vote in DAOs, add council members, or upgrade existing boards.

## Decision

Operate a **non-custodial launch service**:

- Deployment keys live in KMS/HSM, never in the app, repository, or logs.
- The launch service creates accounts and deploys pinned wasm.
- The verified user's NEAR account becomes the initial council member; the service never holds that key.
- The service is not added to the DAO council and gets no ongoing role.
- The board is owned by its DAO, not by the platform.
- No platform-held upgrade key exists.
- The service removes or disables its deployment key material after initialization.
- Every launch is recorded with transaction hashes, wasm hash, and verifier identity.

### Launch flow

1. User signs in with GitHub and submits a repo.
2. The service runs ownership verification (ADR-004).
3. User chooses a slug (ADR-002) and proves control of the initial NEAR council account by signing a launch intent message.
4. The service reserves the slug and creates the accounts.
5. The service deploys and initializes the DAO and board, sets the council and oracle, and configures policy.
6. The user funds the treasury and sets a budget.
7. The indexer confirms the deployment and publishes it.

### Hard requirements

- Idempotent launch jobs; retries must not create duplicate boards.
- Fail closed: a partially initialized board is never marked active.
- Rate limits per GitHub account, NEAR account, and IP.
- An append-only audit log for every deployment action.
- Public pinned wasm hash and a verification page with all launch transactions.
- A documented incident runbook for key compromise or bad deployments.

### What a compromised deployer can and cannot do

Can:

- Deploy a malicious board under a new slug.
- Grief a slug reservation.
- Consume deployment funds.

Cannot:

- Move funds from an existing DAO treasury.
- Vote in an existing DAO.
- Add or remove council members.
- Upgrade or modify an existing board.
- Take over an existing account.

## Consequences

### Positive

- Users get self-serve onboarding without key management.
- Treasury custody remains with the DAO.
- The trust boundary is explicit and auditable.

### Negative

- The platform is a deployment gatekeeper and could censor launches.
- KMS/HSM and key ceremony are operational requirements.
- A deployer compromise causes reputational and griefing damage even without fund loss.

### Neutral

- Advanced users can later be given a self-deploy path that bypasses the service.

## Alternatives considered

### Fully client-side launch

- Pros: no platform key.
- Cons: multi-transaction UX, wallet complexity, harder recovery, slow to ship.
- Deferred.

### User-supplied deployer key

- Rejected: users should not paste private keys into a web app.

### Manual allowlist launches

- Rejected for public beta: not self-serve; kept only as an emergency fallback.

## Follow-ups

- Define the KMS key policy and rotation schedule.
- Add deployment idempotency keys and a job state machine.
- Add a verification page and publish wasm hashes.
- ADR-008 defines what happens if a deployed board needs replacement.
- ADR-009 defines who pays for deployments.
