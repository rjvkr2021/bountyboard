# BountyBoard Platform — Public Release Plan

**Status:** Implementation in progress (real launch and read path)
**Date:** 2026-11-06
**Scope:** Multi-repo public platform
**Scope note:** This document supersedes the earlier single-repo implementation plan and is the source of truth for platform work.

## 1. Vision

BountyBoard is a platform where:

- A GitHub repo owner can self-serve launch a DAO-backed bounty board for their repo.
- Anyone can discover repos and bounties, contribute, and receive payouts.
- Reputation is portable across repos, with per-repo and global ratings.
- Governance bootstraps itself: contributor → maintainer → council, with council members acting as maintainers.

The platform uses one DAO and one BountyBoard instance per repo while keeping the custody and policy guarantees of the contract. The earlier single-repo app, operator scripts, and deployment records have been removed.

## 2. Current state vs target

| Area | Current | Target |
| --- | --- | --- |
| Repos per deployment | 1 (app env) | Many |
| DAOs | 1 | One per repo |
| BountyBoard contracts | 1 | One per repo |
| Onboarding | Operator scripts | Self-serve launch service |
| Discovery | Single board | Directory, search, contributor feed |
| Identity | Self-serve GitHub + NEP-413; oracle writes active boards | Self-serve with abuse signals, rate limits, and lazy per-board sync |
| Reputation | Closed-PR tier counts | Global and per-repo stats |
| Issue sync | Live GitHub reads | GitHub App webhooks + indexer |
| Data | RPC + GitHub only | Postgres indexer + webhooks |
| Network | Testnet | Public testnet beta, then mainnet after audit |

Key code facts behind this table:

- `contracts/bounty-board/src/lib.rs` stores one DAO per BountyBoard contract; the platform deploys one pair per repo.
- Repository metadata is bound to a numeric GitHub repo ID.
- Launch runs through the app and the real near launch adapter.

## 3. Decisions

| # | Decision | Rationale |
| --- | --- | --- |
| 1 | Public testnet beta first; mainnet only after audit | Real money needs audit, monitoring, and incident response |
| 2 | Hybrid tenancy: one Sputnik DAO + one BountyBoard per repo; shared indexer/directory | Isolates treasury blast radius; avoids a shared spending contract |
| 3 | Operated, non-custodial launch service with a KMS-held deployer key | Self-serve without giving the platform custody or ongoing powers |
| 4 | GitHub App for webhooks and repo installs; user token for admin verification | Per-repo permissions, issue sync, ownership checks |
| 5 | Ratings use transparent closed-PR tier counts | Avoids an opaque score and matches promotion thresholds |
| 6 | Postgres + indexer + webhook sync | Required for discovery, search, issue sync, and cross-repo reputation |
| 7 | Multi-author equal split deferred; schema-ready | Keep beta scope bounded; current contract pays one author |
| 8 | Council promotion stays consent-based; eligibility auto-detected | Proposal bond and consent are required; silent proposals are unsafe |
| 9 | Directory is indexer-derived for beta; on-chain registry before mainnet | Faster beta; chain remains the source of truth |

## 4. Target architecture

```text
GitHub App (webhooks, installs) + GitHub OAuth (identity, admin check)
                    |
        +-----------+-----------+
        v                       v
  Launch service          Indexer workers
  (KMS deployer)          NEAR events + GitHub webhooks
        |                       |
        v                       v
 per repo: Sputnik DAO     Postgres (directory, issues,
 + BountyBoard instance    bounties, reputation, proposals)
 + per-repo oracle key          |
        ^                       v
        |                 Next.js multi-tenant app
   scoped oracle service   (directory, repo pages, profiles,
                            launch wizard, panels)
```

Components:

- **Launch service:** verifies repo ownership, creates accounts, deploys the DAO and board, initializes policy, and hands control to the user's council. Holds deployment keys in KMS. No ongoing powers.
- **Oracle service:** receives GitHub webhooks and signs `mark_merged`, `mark_security_fixed`, and identity-link calls for the affected board.
- **Indexer:** consumes BountyBoard events, DAO proposals, and GitHub webhooks; writes the read model to Postgres.
- **App:** multi-tenant Next.js UI. Reads from the indexer API; writes through the wallet and the oracle/launch services.
- **Contracts:** existing BountyBoard template, one instance per repo. No shared spending contract.

The DAO is still the custodian. The board still holds no treasury funds. The platform still cannot move money, add council members, or upgrade a repo's board.

## 5. Tenancy and naming

Each launched repo gets:

- DAO: `<slug>-dao.<root>` (for example `acme-widgets-dao.bountyboard.testnet`)
- Board: `<slug>-board.<root>`
- Oracle: `<slug>-oracle.<root>`

Rules:

- `<slug>` is globally reserved, lowercase, and length-limited to keep full account IDs under 64 characters.
- The platform root cannot take over a subaccount after creation. The launch service removes its own keys after initialization.
- The user's verified GitHub admin account becomes the initial council member and maintainer.
- A repo can have one canonical board. Duplicate launches are rejected by numeric GitHub repo ID, not by name.
- Repo renames keep the same board; the indexer updates display metadata.
- Repo transfers mark the board as unverified and pause new bounties until the new admin re-verifies and the council accepts.
- Forks, archived repos, disabled repos, and empty repos are rejected.

## 6. Contract changes

Reuse the existing contract. Add only what multi-tenancy requires.

### Repo and identity fields

- `Repo.github_repo_id: u64` alongside the existing `github_repo` full name (numeric ID survives renames and transfers).
- `Repo.created_at`, `Repo.verification_source`.
- Identity mapping stores `github_user_id: u64` alongside the handle. Handles can be renamed and reused; numeric IDs cannot.

### Council as default maintainer

- Initial maintainers are the verified repo admins who become the initial council.
- Add permissionless `sync_council_maintainers()`: reads the DAO `get_policy`, adds council accounts as maintainers with `council_derived: true`.
- Add `MaintainerRecord.council_derived: bool` and `MaintainerRecord.promoted: bool`; a record may be both.
- Sync never removes separately promoted maintainers.
- If a council member is removed from the DAO, their council-derived maintainer role is removed unless they were independently promoted. This requires a policy decision at implementation time; default is removal of the derived role only.

### Operations

- `set_oracle(account)` DAO-only, for oracle key rotation.
- Enrich events with repo ID, DAO, and board metadata so the indexer does not need out-of-band context.
- Add `version()`.
- Keep multi-author splits out of the beta contract, but leave a documented extension point in `PayoutRecord`.

### Upgrade policy

- Recommendation for beta and mainnet: immutable per-repo boards deployed from a pinned wasm.
- Publish the wasm hash and provide a verification page.
- Do not expose a platform-held upgrade key.
- If a board must be replaced, the DAO council deploys a replacement and the indexer marks the old board as retired. No state migration in beta.

## 7. Launch service

### Flow

1. User signs in with GitHub and submits a repository URL.
2. Service checks the repo with the user's token:
   - `viewerPermission` is `ADMIN` (GraphQL) or `permissions.admin == true` (REST).
   - The GitHub App is installed on the repository.
   - The repo is not a fork, archived, disabled, or empty.
3. User chooses a slug. Service reserves it in the database with a short hold.
4. User signs a launch intent message with their NEAR account (proves control of the initial council account).
5. Service creates the accounts, deploys the Sputnik DAO and BountyBoard, initializes policy, sets the council, and configures the oracle.
6. User funds the DAO treasury and sets a budget. Testnet uses a sponsored faucet path; mainnet requires a minimum deposit.
7. Indexer confirms the deployment and the repo appears in the directory.

### Trust and key management

- Deployer key lives in KMS/HSM; it is never in the app or repository.
- The deployer can create deployments but cannot move treasury funds, vote, or upgrade a board.
- Every launch is idempotent and auditable; retries do not create duplicate boards.
- Publish the pinned wasm hash and the full launch transaction list.
- Rate-limit launches per GitHub account and per IP.
- Mainnet: small non-refundable launch fee (storage + anti-spam) and a minimum treasury deposit. Testnet: sponsored.

### Failure handling

- If deployment fails midway, mark the launch failed and leave a visible audit record. Never leave a half-initialized board active.
- If the repo is transferred before initialization completes, abort.
- Name collisions fail early with a clear message.

## 8. GitHub App

Replace the single OAuth app for platform operations with a GitHub App, while keeping user authorization for identity.

### Repository permissions

| Permission | Level | Purpose |
| --- | --- | --- |
| Metadata | Read | Mandatory; repo details, rename/transfer events |
| Issues | Read | Issue open/close and label sync |
| Pull requests | Read | Merge detection and linked issue parsing |
| Contents | Read | Commit metadata and repo checks |
| Repository security advisories | Read | GHSA details and `repository_advisory` events |

### Organization permissions

| Permission | Level | Purpose |
| --- | --- | --- |
| Members | Read | Optional; org ownership checks for org-owned repos |

### Account permissions

| Permission | Level | Purpose |
| --- | --- | --- |
| Email addresses | Read | Optional; notifications only |

Do not request Administration, Actions, or write permissions for beta.

### Webhook events

- `issues`
- `pull_request`
- `repository`
- `repository_advisory`
- `installation`
- `installation_repositories`

### Ownership verification

- Use the GitHub App user-to-server token for the signed-in user.
- Prefer GraphQL `repository(owner, name) { viewerPermission }` and require `ADMIN`; fall back to REST `permissions.admin`.
- Require the App installation token to confirm the App is installed on that repo.
- For org-owned repos, require the user to have admin on the repo. Optionally require org-owner approval if the org enforces it; show the verifying account on the board.
- Store `repository.id` (numeric) as the canonical identifier.
- Re-verify on `repository.renamed` and `repository.transferred`.

### Private advisory access

- Maintainers and council read advisory details with their own GitHub access; the platform does not store advisory bodies.
- The `repository_advisory.published` webhook provides the GHSA ID, advisory URL, and credited user for `mark_security_fixed`.
- Never log advisory titles, descriptions, CVEs, or GHSA IDs before publication.

## 9. Identity service

Flow:

1. Sign in with GitHub (App user authorization).
2. Sign a NEP-413 message containing the GitHub numeric user ID, the NEAR account, a nonce, and an expiry.
3. Server verifies the GitHub session and the signature.
4. The app links the identity to every active board through the oracle; lazy sync when a user first interacts with a newer board remains target behavior.
5. Store the global mapping in the platform store for resolution; the app does not publish a public identity directory. Boards remain the on-chain source of truth for payouts.

Rules:

- One GitHub user ID maps to one NEAR account at a time; one NEAR account maps to one GitHub user ID.
- Changing a link requires a fresh NEP-413 signature.
- Unlinking only requires the signed-in GitHub session and does not reopen a wallet connection; re-linking has no cooldown.
- Prevent handle squatting by keying on numeric IDs.
- Add abuse signals: GitHub account age, verified email, and rate limits.
- Never store GitHub access tokens in logs; encrypt if persisted.

## 10. Indexer and database

### Sources

- BountyBoard events per board.
- Sputnik DAO proposals and policy changes.
- GitHub App webhooks.
- Launch service deployment records.

### Tables (initial)

- `repositories`: numeric GitHub ID, full name, owner, description, metadata, verification state.
- `deployments`: slug, DAO, board, oracle, wasm hash, launch tx hashes, status.
- `boards`: policy snapshot, budget, committed, paused, bootstrap state.
- `issues`: GitHub issue number, state, title, labels, linked bounty.
- `bounties`: on-chain issue ID, tier, amount, status, creator, approvals.
- `claims`: issue ID, claimant, timestamp.
- `payouts`: issue ID, recipient, amount, tier, proof, tx hash.
- `identities`: GitHub numeric ID, handle, NEAR account, linked at, status.
- `reputation`: per account, per repo, and aggregate counters.
- `proposals`: DAO proposal ID, kind, status, board, timestamps.
- `webhook_deliveries`: delivery ID, event, status, attempts.
- `notifications`: recipient, kind, payload reference, read state.
- `indexer_cursors`: contract, block height, updated at.

### Correctness

- Chain is the source of truth for money and bounty state.
- GitHub is the source for issue and PR state.
- Every write is idempotent; webhook delivery IDs and block cursors prevent duplicates.
- Handle finality and reorgs; never mark a payout final before the chain does.
- Backfill from each board's deployment block.
- Reconciliation job compares on-chain views with the read model and reports drift.
- Multi-network support (`testnet`, `mainnet`) with separate cursors and databases or schemas.

## 11. Web app surfaces

- `/` — directory: repos, search, activity, aggregate stats.
- `/r/[owner]/[repo]` — repo board: issues, bounties, claims, payouts, maintainers, council, activity.
- `/r/[owner]/[repo]/issues/[number]` — issue detail with history.
- `/new` — launch wizard.
- `/me` — dashboard: my repos as council, my repos as maintainer, my claims, payouts, proposals.
- `/u/[handle]` — contributor profile: global and per-repo stats.
- `/notifications` — claims, merges, approvals, payouts, promotions, proposals.
- `/verify/[slug]` — deployed addresses and wasm hash.
- `/account` — account dashboard plus link, rotate, and unlink.
- Private-security detail — gated by maintainer/council status and GitHub access.
- Maintainer panel — triage, create/fund, approve, promotions.
- Council panel — budget, pause, veto, promotion, multi-DAO proposal inbox.

The existing bootstrap banner, private-security redaction, and payout-recovery UI are preserved per repo.

## 12. Reputation and rating

Beta displays transparent stats, not an opaque score:

- Global: completed bounties, closed-PR tier breakdown, total earned, active repos, maintainer involvement.
- Per repo: the same counters scoped to that repo.
- Security researchers: advisory-linked payouts and S0/S1 counts.
- Optional badges: first bounty, S0 completed, security researcher, trusted maintainer.

Promotion uses closed-PR counts by tier. Cross-repo aggregation is computed by the indexer from payout records. Anti-farming relies on identity verification, account-age signals, budget caps, and council veto.

## 13. Governance defaults

- Council members are maintainers from launch through `sync_council_maintainers`.
- Contributor → maintainer remains automatic when the contract bootstrap threshold is met.
- Maintainer → council eligibility uses closed-PR involvement counts (2 S0, 4 S1, 6 S2, 8 S3). The maintainer calls `request_council_promotion`; a council member can also start the proposal for any account.
- Council members get a multi-DAO proposal inbox and notifications; they should not need near-cli to see pending votes.
- Bootstrap mode stays per repo and ends at three maintainers.

## 14. Safety, legal, operations

- Moderation: report and blocklist flows for repos, bounties, and users; spam heuristics.
- Rate limits: launch, identity link, claims, and webhook processing.
- Terms of service and privacy policy: what is collected (GitHub identity, email, NEAR address), why, retention, and deletion.
- Payments: the platform is not a custodian; contributors are responsible for taxes; include a clear disclaimer.
- Security: contract and launch-service audit before mainnet; secret scanning; dependency audits; least-privilege keys; incident response runbook.
- Monitoring: indexer lag, webhook failures, RPC errors, payout failures, launch failures, oracle errors.
- Support: docs, FAQ, status page, feedback channel.
- Cost model: RPC, Postgres, workers, storage; mainnet launch fee and minimum treasury.

## 15. Milestones

### R0 — Decisions and spikes (1 week)

Deliverables:

- ADRs listed in section 16.
- Spikes: GitHub App admin verification on personal and org repos, fork/transfer handling; `Repository security advisories` access; NEAR account length and slug limits; indexer cursor design; DAO + board deployment cost estimate.

Status (2026-11-06): ADRs complete. Local spikes complete in `docs/spikes/R0-spikes.md`; live GitHub App and security-advisory checks are blocked on App credentials.

### R1 — Contract platform hardening (2 weeks)

- Implement repo/identity fields, council-maintainer sync, oracle rotation, event enrichment, `version()`.
- Unit and sandbox tests for all new paths.
- Keep S0–S3, private security, bootstrap, promotion, and payout-recovery suites green.

Status (2026-11-06): implemented. 201 contract tests and 4 sandbox E2E tests pass; app typecheck, lint, and unit tests pass.

### R2 — Launch service (2–3 weeks)

- GitHub App install and admin verification.
- Slug reservation, account creation, DAO + board + oracle deployment, policy init.
- KMS key management, idempotency, rollback, audit log.
- Verification page and pinned wasm hash.
- Testnet launch end-to-end with no operator.

Status (2026-11-06): launch service implemented with slug/GitHub-ID uniqueness, deployment status transitions, live GitHub admin verification, and the real Near adapter. A live testnet launch completed for `rjvkr2021/bountyboard_test_repo`; the sandbox/e2e path is verified. KMS, idempotency keys, crash recovery, rollback, GitHub App/webhooks, and the verification page remain open.

### R3 — Indexer, database, directory API (2–3 weeks)

- Postgres schema and migrations.
- NEAR ingestion and GitHub webhook workers.
- Finality, reorg, idempotency, backfill, reconciliation.
- Directory, search, repo stats, contributor stats, proposals inbox API.

Status (2026-11-06): JSON store, repository detail API, status API, and a state-reconciliation indexer implemented. Postgres, block/log ingestion, GitHub webhooks, finality/reorg handling, backfill, search, and proposal inbox remain open.

### R4 — Multi-tenant app (2–3 weeks)

- Directory, repo board, issue detail, contributor feed and profile, launch wizard.
- Maintainer and council panels; bootstrap banner; private-security gating.
- Route entirely by repository and board identity.

Status (2026-11-07): Better Auth email/password and GitHub accounts in Postgres, account dashboard, directory, launch wizard, repo page, issue detail, identity page, and status page implemented against the platform store. Issue pages expose wallet claim, maintainer approval, GitHub-verified merge proof, private-security disclosure, payout requests, cancellation, and S0 native settlement. Repository pages expose public and private-security bounty creation, budget proposals, tier-count promotion, council-promoted maintainers/council members, DAO vote approval, request sync, bootstrap state, and closed-PR progress. Board launch rejects private repositories. Account deletion, two-factor authentication, shared rate limiting, private S0, contributor feed, DAO veto proposals, proposal inbox, and payout-recovery controls remain open.

### R5 — Identity service (1–2 weeks)

- GitHub OAuth + NEP-413; numeric IDs; link, rotate, unlink.
- Global uniqueness and abuse controls.
- Lazy per-board sync through the oracle.

Status (2026-11-06): identity storage, numeric IDs, GitHub-session verification, NEP-413 self-service link/rotate, session-authorized unlink, global uniqueness, and oracle writes to active boards implemented. Abuse signals, rate limits, and the KMS-backed oracle path remain open.

### R6 — Governance and reputation defaults (1–2 weeks)

- Council-maintainer sync surfaced in the UI.
- Promotion eligibility automation and one-click consent.
- Multi-DAO proposal inbox; notifications.
- Global and per-repo reputation views.

Status (2026-11-06): maintainer-candidate listing, challenge-aware promotion, bootstrap state, reputation progress, council promotion requests, DAO vote approval, and request sync implemented. DAO veto proposals, full proposal inbox, notifications, and cross-repo reputation views remain open.

### R7 — Public beta hardening (2–3 weeks)

- Moderation, rate limits, ToS/privacy, disclaimers.
- Monitoring, alerts, runbooks, load tests, failure drills.
- Security review and staged allowlist before opening.

### R8 — Mainnet (after audit)

- Audit contract and launch service; fix findings.
- Key ceremony, incident response, launch fee and minimum treasury.
- Staged mainnet rollout.

## 16. R0 ADR list

Individual ADRs live in [`docs/adr/`](docs/adr/README.md).

1. **ADR-001 Tenancy:** per-repo DAO + BountyBoard, shared indexer; reject a shared spending contract.
2. **ADR-002 Naming:** slug rules, account hierarchy, collision handling, length limits.
3. **ADR-003 Launch trust:** KMS deployer, non-custodial handoff, key removal, audit trail.
4. **ADR-004 Ownership verification:** GitHub App user token, admin check, org policy, fork/rename/transfer rules.
5. **ADR-005 Indexer correctness:** NEAR Lake vs RPC, finality, reorg, backfill, reconciliation.
6. **ADR-006 Reputation:** stats-only rating, closed-PR tier counts, per-repo aggregation, anti-farming signals.
7. **ADR-007 Council-maintainer sync:** dynamic read vs mirrored sync, provenance, removal semantics.
8. **ADR-008 Upgrade policy:** immutable per-repo boards vs DAO-controlled upgrade, wasm hash verification.
9. **ADR-009 Launch economics:** testnet sponsorship, mainnet fee, minimum treasury, rate limits.
10. **ADR-010 Multi-author split:** defer to post-beta; extension point in `PayoutRecord`.
11. **ADR-011 GitHub App scope:** final permission set, webhook events, private-advisory handling.
12. **ADR-012 Data retention and privacy:** what is stored, for how long, deletion, token handling.

## 17. Public beta acceptance criteria

- A repo admin can launch a DAO-backed board end-to-end in under ~10 minutes with no operator.
- The directory lists repos; search and filters work from the indexer.
- Issues and merges sync automatically; a PR merge triggers the payout flow.
- A contributor links GitHub + NEAR once, claims, merges, gets paid, and sees global and per-repo stats.
- Council members automatically have maintainer powers.
- Promotions work; bootstrap ends at three maintainers.
- Private security bounties stay hash-only until publication.
- The app never holds deployer or oracle keys.
- Alerts, runbooks, and a status page exist.
- Testnet beta has been load-tested and failure-tested.

## 18. Risks

- GitHub App review and `Repository security advisories` availability.
- Launch-service centralization and deployer key compromise.
- Indexer correctness across many boards; drift between chain and read model.
- Spam launches and bounty spam without fees or moderation.
- DAO proliferation and voter fatigue.
- Repo rename, transfer, and fork impersonation.
- Legal and tax posture for cross-border payouts.
- Audit cost and schedule.
- Immutable contract bugs versus DAO-controlled upgrade complexity.
- Cross-repo reputation gaming.

## 19. Deferred

- Multi-author equal payout split.
- USDC / NEP-141 payouts.
- Private repositories.
- Cross-chain payouts.
- Dispute resolution and work-quality arbitration.
- Platform fee beyond the launch fee.
- Fully client-side / wallet-only launch.
- On-chain registry (before mainnet only).
- Mobile app.

## 20. Next actions

1. Harden the live launch flow and complete KMS, rollback/resume, and GitHub App/webhook integrations; the first testnet launch is complete (see `docs/platform-implementation.md`).
2. Add wallet/DAO signing for admin, bounty creation/funding, cancellation, council resolution, S0, private-security, and DAO veto writes; claim/approve/payout, promotion/council, and identity writes are implemented.
3. Replace the JSON store with Postgres and add webhook/NEAR ingestion (R3).
4. Wire GitHub App install and webhook flows; GitHub OAuth login is implemented (R2/R5).
5. Enable account deletion, two-factor authentication, shared rate limiting, audit logging, and authorization checks for new write flows in Better Auth.
6. Complete KMS-backed key management, idempotency, rollback, and launch recovery.
