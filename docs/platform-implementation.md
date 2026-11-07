# Platform implementation and operations

**Status:** Email/password and GitHub auth, board launch, identity linking, contribution and governance actions, and read path implemented; Docker, auth, and sandbox/e2e verified; live testnet launch completed for `rjvkr2021/bountyboard_test_repo`; GitHub OAuth configured; GitHub App credentials and webhooks remain open (2026-11-07)
**Plan:** `PLATFORM.md`
**R0 spikes:** `docs/spikes/R0-spikes.md`

## What works now

The app has a real-only platform read path, launch service, identity linker, and contributor flow:

- Better Auth email/password and GitHub sign-in, sign-out, and HTTP-only sessions backed by Postgres.
- Account dashboard at `/account` with owned repositories.
- Public directory at `/`.
- Launch wizard at `/launch` that requires an account, verifies GitHub admin access with the stored OAuth token, reserves a slug, and runs the real NEAR deploy adapter.
- Per-repository pages at `/r/<slug>` and issue detail at `/r/<slug>/issues/<issueId>`.
- Contribution actions on issue pages: wallet-backed claim, maintainer approval, GitHub-verified merge proof, and payout requests.
- Governance actions on repository pages: candidate listing, promotion, council requests, DAO vote approval, request sync, bootstrap state, and reputation progress.
- Self-service identity linking in `/account#identity`: GitHub session verification, NEP-413 wallet signature verification, and oracle writes to every active board.
- Runtime and indexer status at `/status`.
- JSON-backed platform store for local persistence.
- A state-reconciliation indexer over NEAR RPC.
- A real NEAR launch adapter that creates the DAO, BountyBoard, and oracle accounts.

Launching requires a GitHub sign-in with the `public_repo` scope, a linked NEAR
founder account with enough balance for launch funding, and a configured NEAR
deployer/oracle. Identity linking also
requires `PLATFORM_ORACLE_PRIVATE_KEY`. Public bounty creation (S0–S3), claim,
approval, merge-proof submission, payout requests, budget proposals, cancellation,
private-security creation/disclosure/payout, and S0 native settlement are exposed.
Private S0, payout recovery, and the full DAO proposal inbox remain open.

## Local run

The Docker Compose path starts Postgres and the app together:

```bash
# Create .env with POSTGRES_PASSWORD, BETTER_AUTH_SECRET, GitHub OAuth credentials, and NEAR settings.
docker compose up --build
```

Open `http://localhost:3000`. The app applies the Better Auth schema on startup.
Postgres and the JSON platform store use named volumes. Reset both with
`docker compose down -v`. Compose bind-mounts the wasm files from the repository;
build them with `npm run smart-contract:build` and `npm run fetch:sputnik` before
launching a board. Accounts do not need them.

For local development without the app container, load the root `.env` values
into the shell, start Postgres with `docker compose up -d db`, then run
`npm install && npm run dev` from `app/`.

Docker Compose and the app container read the repository-root `.env`. When
running `app/` directly, export the same values in the shell.

Resetting with `docker compose down -v` removes both Postgres and platform
volumes. On restart the Better Auth schema is recreated and the platform store
starts empty; no data is migrated. The current test environment was reset this
way and has zero auth users and no repositories or deployments.

## Testnet readiness

Readiness check on 2026-11-06:

- Root/deployer: `bountyboard.testnet`, 3.9699 NEAR available after the live launch.
- Founder: `rjvkr2021.testnet`, 53.8796 NEAR available.
- The standalone test founder and oracle accounts were removed and their
  remaining balances returned to the root.
- Launch derives the founder from the signed-in user's linked NEAR identity.
  The founder wallet funds the launch by transferring the required amount to the
  deployer. The oracle keypair remains configured at
  `ed25519:71wD5bimNf4aX9sDGxbDH5Nf8BSGZ38ocXZNtcMfupwk`; per-board oracle
  accounts are created at launch.
- The initial DAO budget is transferred into the DAO. Funding is calculated from
  the actual wasm sizes: DAO storage `5.19723`, DAO budget `2`, board storage
  `5.77537`, a `1` NEAR payout bond reserve, oracle `1`, proposal bonds `3`, and
  a `0.5` fee buffer — `18.4726 NEAR` for the default launch.
- Live launch: `rjvkr2021/bountyboard_test_repo` is active at
  `/r/bountyboard-test-repo-live` with DAO, board, and oracle accounts on testnet.
- Role E2E launch: `rjvkr2021/bountyboard_e2e` is active at `/r/bountyboard-e2e`.
  It has app-created S0/S1/S2/S3 bounties, a completed native S0 bounty,
  board-covered payout bonds, two contributors, council-promoted maintainers and
  council members, an escalated-then-council-resolved bounty, and a contributor
  whose S0/S1/S2/S3 counts reached the maintainer candidate threshold.
- Remaining blockers are GitHub App credentials/webhooks, KMS, and production
  recovery/rollback tooling.

## Configuration

### Platform and storage

| Variable | Default | Used for |
| --- | --- | --- |
| `DATABASE_URL` | empty; required | PostgreSQL connection used by Better Auth |
| `BETTER_AUTH_SECRET` | empty; required | At least 32 random characters used to encrypt and sign auth data |
| `BETTER_AUTH_URL` | Compose default: `http://localhost:3000`; required at runtime | Public app URL used for auth callbacks and trusted origins |
| `PLATFORM_ROOT_ACCOUNT` | `bountyboard.testnet` | Parent account for `<slug>-dao`, `<slug>-board`, `<slug>-oracle` |
| `PLATFORM_DATA_FILE` | `<cwd>/.data/platform.json` | JSON store path |
| `PLATFORM_DEFAULT_BUDGET_NEAR` | `2` | Initial DAO budget, transferred into the DAO |
| `PLATFORM_DEFAULT_DAILY_CAP_NEAR` | `1` | Launch default daily cap |
| `PLATFORM_BOOTSTRAP_UNTIL_MAINTAINERS` | `3` | Bootstrap threshold written to the board |
| `NEAR_NETWORK` | `testnet` | Network label and RPC default |
| `NEAR_RPC_URL` | network default | NEAR RPC endpoint |

### NEAR launch

Required to launch:

| Variable | Purpose |
| --- | --- |
| `PLATFORM_DEPLOYER_ACCOUNT` | Root/deployer account that creates subaccounts and signs DAO proposals |
| `PLATFORM_DEPLOYER_PRIVATE_KEY` | Deployer key. **Prefer KMS; do not commit or log.** |
| `PLATFORM_ORACLE_PUBLIC_KEY` | Oracle key installed on each `<slug>-oracle` subaccount |
| `PLATFORM_BOARD_WASM` | BountyBoard wasm path |
| `PLATFORM_SPUTNIK_WASM` | Sputnik DAO wasm path |

Optional NEAR settings:

| Variable | Default |
| --- | --- |
| `PLATFORM_ORACLE_PRIVATE_KEY` | empty; required for self-service identity links and founder linking during launch |
| `PLATFORM_DAO_PROPOSAL_BOND_NEAR` | `1` |
| `PLATFORM_DAO_BOUNTY_BOND_NEAR` | `1` |
| `PLATFORM_DAO_PROPOSAL_PERIOD_SECS` | `604800` |
| `PLATFORM_DAO_BOUNTY_FORGIVENESS_SECS` | `86400` |
| `PLATFORM_LAUNCH_FUNDING_BUFFER_NEAR` | `0.5`; fee/storage buffer added to calculated wasm funding |
| `PLATFORM_KMS_PROVIDER` | `local` |
| `PLATFORM_KMS_KEY_ID` | empty |

### GitHub OAuth and verification

Email/password and GitHub sign-in are enabled. Better Auth uses a GitHub OAuth App configured
with callback URL `<BETTER_AUTH_URL>/api/auth/callback/github`, for example
`http://localhost:3000/api/auth/callback/github`. Better Auth requests the
GitHub profile and verified email, then stores the user, GitHub account link, and
session in Postgres.

Required for login:

| Variable | Purpose |
| --- | --- |
| `GITHUB_CLIENT_ID` | GitHub OAuth App client ID |
| `GITHUB_CLIENT_SECRET` | GitHub OAuth App client secret |

The launch flow uses the stored GitHub OAuth token with the `public_repo` scope
to list eligible repositories and verify admin access. `app/src/lib/platform/github-admin.ts` calls GitHub
GraphQL and requires:

- `viewerPermission == ADMIN`.
- Repository `databaseId` (numeric GitHub repo ID).
- Viewer `databaseId` and `login`.
- Repository `nameWithOwner`, `defaultBranchRef`, and `isPrivate`.

Private repositories are rejected for launch; only public repositories are supported.

Reserved for the future GitHub App installation and webhook flow:

| Variable | Purpose |
| --- | --- |
| `GITHUB_APP_ID` | GitHub App identity |
| `GITHUB_WEBHOOK_SECRET` | Webhook HMAC verification |

GitHub App installation callbacks and webhook handlers are **not implemented**
in this slice. The GitHub OAuth App credentials are configured, and the
sign-in endpoint returns a GitHub authorization redirect with scopes
`read:user user:email public_repo`. `/status` now reports only `GITHUB_APP_ID` and
`GITHUB_WEBHOOK_SECRET` as missing production inputs; all NEAR launch inputs are
configured. A full interactive OAuth callback still needs to be completed.

## Accounts

Better Auth supports email/password and GitHub sign-in. It stores users, GitHub
account links, and sessions in Postgres; there are no password credentials.
Sessions use HTTP-only cookies managed by the auth handler. The app mounts the
handler at `/api/auth/[...all]` and reads sessions on the server through
`auth.api.getSession`.

The Better Auth schema is applied automatically when the Next.js server starts,
using `getMigrations` from `better-auth/db/migration`. For managed deployments,
run `npx auth@latest migrate` as a release step instead.

Email/password authentication is disabled, and `/signup` redirects to
`/signin`. The current account slice does **not** enable account deletion,
two-factor authentication, shared rate limiting, or audit logging. Postgres
backups, retention, and abuse controls are still required before a public launch.

## API

Better Auth routes live under `/api/auth/[...all]`; platform routes live under
`/api/platform`. All run in the Node.js runtime. Paths such as
`/api/auth/sign-up/email`, `/api/auth/sign-in/email`, `/api/auth/sign-out`, and
`/api/auth/get-session` are owned by Better Auth.

| Method | Route | Purpose |
| --- | --- | --- |
| `*` | `/api/auth/[...all]` | Better Auth handler |

| Method | Route | Purpose |
| --- | --- | --- |
| `GET` | `/repos` | Repository summaries |
| `GET` | `/repos/<slug>` | Repository detail, board, issues, events, cursor |
| `GET` | `/launch/preflight` | Check the linked NEAR account and launch readiness |
| `POST` | `/launch` | Verify and launch a repository (requires account) |
| `GET` | `/github/repos` | List public repositories where the signed-in GitHub user is an admin |
| `GET` | `/launch/<id>` | Deployment status and repository |
| `GET` | `/identity/me` | Current GitHub identity and linked NEAR account |
| `POST` | `/identity/challenge` | Create a signed NEP-413 link challenge |
| `POST` | `/identity` | Verify the wallet signature and write the link |
| `DELETE` | `/identity` | Unlink the current GitHub identity using the session |
| `POST` | `/issues/<slug>/<issueId>/merge` | Verify a merged GitHub PR and have the oracle record merge proof |
| `GET` | `/repos/<slug>/reputation?account=<id>` | Read an account's on-chain reputation from the board |
| `POST` | `/indexer/tick` | Run one reconciliation pass |
| `GET` | `/status` | Safe config summary, counts, cursors, recent events |

Launch request:

```json
{
  "githubRepo": "owner/name",
  "slug": "optional-slug",
  "description": "Optional description",
  "budgetNear": 2,
  "dailyCapNear": 1,
  "fundingTxHash": "base58-transaction-hash"
}
```

The founder first sends the launch funding amount to the deployer. The API
verifies that the transaction is final, was signed by the linked founder, was
sent to the deployer, and transferred at least the required amount. The stored
OAuth token is used server-side for repository listing and admin verification;
it is never sent to the browser.

## Data model and storage

The JSON store contains:

- `repositories`: GitHub numeric ID, slug, owner/name, verification source, launch metadata.
- `deployments`: status, accounts, tx hashes, council, errors.
- `boards`: repo binding, maintainers, oracle, budget, committed, daily cap, paused state.
- `issues`: mirrored chain issue snapshot.
- `identities`: GitHub numeric ID/login to NEAR account.
- `events`: append-only local event feed.
- `cursors`: per-board indexer cursor.

Writes are atomic (write temp file then rename). The store is single-process only
and has no locking. It is suitable for local development, not concurrent
production use. Better Auth users and sessions are already in Postgres; the
remaining platform metadata should follow using the tables in `PLATFORM.md`
section 10. The API and service boundaries are intentionally separated so the
store can be swapped without changing UI routes.

## Launch flow

`app/src/lib/platform/launch/near-adapter.ts` implements this sequence:

1. Validate deployer/oracle configuration and wasm files.
2. Verify the founder funding transaction and reject reused funding hashes.
3. Generate ephemeral DAO and board keys.
4. Create `<slug>-dao`, `<slug>-board`, and `<slug>-oracle` subaccounts.
5. Deploy Sputnik and BountyBoard wasm.
6. Initialize the DAO with a bootstrap policy: council is the deployer, board has scoped permissions.
7. Initialize the board with the DAO and bootstrap config.
8. Delete the ephemeral DAO and board keys.
9. Submit and approve DAO proposals for `add_repo` and `set_budget`.
10. Call `sync_dao_params`.
11. Optionally link the founder identity if `PLATFORM_ORACLE_PRIVATE_KEY` is set.
12. Submit a `ChangePolicy` proposal that replaces the council with the founder.

Known gaps:

- A live testnet launch has completed for `rjvkr2021/bountyboard_test_repo`.
  GitHub App credentials and webhooks remain open.
- Ephemeral keys are in process memory, not KMS. A crash after account creation but before key deletion can leave orphan keys and partially deployed accounts.
- No idempotency key or resume flow. Re-running launch with the same slug fails at account creation.
- No rollback or account deletion on failure.
- `PLATFORM_ORACLE_PRIVATE_KEY` is a local-development escape hatch. Production must sign through KMS and should not store the oracle key in the app.
- The adapter assumes the DAO proposal execution status becomes `Executed`; verify this against the pinned Sputnik build on testnet.
- No verification page or pinned-wasm review yet.

Before the first live run: confirm GitHub App/test-repository credentials, pin
audited wasm, and verify account/key cleanup manually. The dedicated testnet
root is already funded.

## Indexer

`NearBoardReader` polls:

- `get_repo`
- `get_budget`
- `get_issues(from, limit)`
- latest final block

It diffs board and issue snapshots and appends events for board changes and issue
status transitions. This is **state reconciliation**, not event-log ingestion. It
does not:

- Consume NEAR event logs or Lake data.
- Handle reorgs beyond final-block reads.
- Backfill historical events.
- Ingest DAO proposals, GitHub issues, pull requests, or advisories.
- Verify GitHub webhooks.
- Reconcile maintainers from DAO policy automatically.

Production indexer work remains R3 in `PLATFORM.md`.

## Identity

Identity records are stored in the JSON file and shown only to the signed-in owner in `/account#identity`. The app does not publish a global identity directory; on-chain links remain public contract state.
Self-service linking works through `POST /identity/challenge` and
`POST /identity`:

1. The server verifies the Better Auth GitHub session and fetches the canonical
   GitHub numeric ID and login with the stored OAuth token.
2. It returns a signed, expiring challenge containing the GitHub identity, the
   selected NEAR account, the app recipient, and a 32-byte nonce.
3. The browser wallet signs the NEP-413 message.
4. The server verifies the signature and the wallet's full-access key over RPC.
5. The service enforces global uniqueness, then the oracle calls
   `link_identity_with_id` on every active board.
6. The global identity record is updated and shown in `/account#identity`.

Unlinking is authorized by the signed-in GitHub session (`DELETE /identity`) and
calls `unlink_identity` on every active board; it does not require a wallet
connection or a fresh signature. Changing or re-linking has no cooldown. Abuse
signals, shared rate limits, and the KMS-backed oracle path remain open.

## Contribution flow

The contributor path is exposed on `/r/<slug>/issues/<issueId>`:

1. **Claim** — the connected NEAR wallet calls `claim(issue_id)` on the board.
2. **Approval** — a wallet connected to a board maintainer calls `approve(issue_id)` while the bounty is `PendingApproval`.
3. **Work proof** — after the bounty is approved, a signed-in contributor submits a merged pull request number. The server verifies through GitHub REST that the PR is merged, belongs to the repository, was authored by the signed-in GitHub account, references the bounty issue number, and that the author has a linked NEAR identity and has claimed the bounty. The oracle then calls `mark_merged`.
4. **Payout request** — the wallet calls `request_payout(issue_id)`. New boards cover the DAO proposal bond from a payout reserve; legacy boards require the bond to be attached. The board creates and auto-votes the DAO proposal; the indexer reconciles the resulting payout state.

The issue page also has a **Refresh chain state** action that runs the indexer
after wallet transactions. Still open: private S0, payout recovery controls, and the
full DAO proposal inbox.

## Governance flow

Repository pages expose the promotion path:

1. **Candidate** — the contract creates a maintainer candidate automatically after at least 1 S0, 2 S1, 3 S2, and 4 S3 paid/closed PRs.
2. **Promote** — after the candidate challenge period, any wallet can call `promote(candidate)`. The DAO can veto during the challenge through DAO governance; the app displays vetoed candidates.
3. **Council request** — a maintainer involved in at least 2 S0, 4 S1, 6 S2, and 8 S3 closed PRs can call `request_council_promotion()`. The board creates a DAO proposal to add the account to the council role. A council member can also promote any account to maintainer directly or start a council proposal for any account.
4. **DAO vote** — a council member can send `act_proposal` with `VoteApprove` from the repository governance panel.
5. **Sync** — anyone can call `sync_council_request(account)` after the vote so the board refreshes the proposal state.

The indexer reads `get_config`, `get_bootstrap_state`, `get_candidates`, and
`get_council_requests` and stores them on the board snapshot. The reputation API
reads `get_reputation` directly over RPC. Full DAO veto proposals, the proposal
inbox, rejection notifications, and cross-repo reputation views remain open.

## What is still needed from the operator

To reach a real public testnet beta:

1. **Account hardening**: Enable account deletion, two-factor authentication, shared rate limiting (including identity link/unlink), abuse signals, and an audit log. Email/password login is enabled; GitHub OAuth credentials are configured for GitHub sign-in and repository admin checks.
2. **GitHub App**: App ID, private key, webhook secret, installation callback, and approved permissions from `PLATFORM.md` section 8. A public test repo has completed the first live launch; the App/webhook flow remains open.
3. **KMS**: Provider, key ID, signing API, and an operator runbook for deployer and oracle keys. Do not use raw private keys in production.
4. **NEAR root account**: The testnet root/deployer is configured and funded. Launch derives the founder from the signed-in user's linked NEAR identity, and per-board oracle accounts are created automatically. At the readiness check `bountyboard.testnet` had 3.9699 NEAR available after the live launch. Mainnet still needs a separate root/account plan.
5. **Wasm**: Local builds are present. Audited/pinned BountyBoard wasm and Sputnik wasm, plus expected SHA-256 hashes, are still needed.
6. **Database**: Production Postgres, backup/retention policy, and a migration plan for the remaining JSON platform store.
7. **Indexer infrastructure**: Worker runtime, NEAR Lake or RPC access, webhook endpoint, retry/backfill policy.
8. **Domain and TLS**: Public app URL, OAuth callback URLs, and webhook URL.
9. **Monitoring**: Error tracking, indexer lag alerts, failed-launch alerts, and an incident contact.
10. **Legal and policy**: Terms, privacy policy, bounty/security disclosure policy, sanctions/abuse handling, and a takedown process.
11. **Security audit**: Contract audit and launch-service threat model before mainnet. Public beta remains testnet-only.
12. **Decision on private repos/advisories**: Confirm GitHub App access and whether private boards are in beta scope.

## Security notes

- Better Auth stores GitHub account links, verified emails, users, and sessions in Postgres; the JSON platform store contains repository metadata and identity links, but no private keys. Both must be backed up and access-controlled in any shared environment. Move the remaining JSON data to Postgres before running multiple instances.
- The launch form uses the stored GitHub OAuth token with the `public_repo` scope. The token is never sent to the browser, but the scope is broader than read-only public metadata. Prefer a GitHub App installation token before shared production use.
- NEAR launch and self-service identity writes read deployer and oracle private keys from environment variables in this slice. That is a local-development escape hatch. Production must use KMS, rotation, audit logging, and least-privilege deployer/oracle keys.
- Claim, approval, and payout requests are signed by the user's NEAR wallet; merge proof is submitted through the app and written by the oracle after GitHub verification. Public and private-security bounty creation, budget proposals, cancellation, S0 native settlement, claim/approval/merge/payout, disclosure, and council promotion are exposed. Private S0 and payout-recovery writes remain open.
- Public beta should stay on testnet until the contract audit, launch-service review, and incident-response plan are complete.

## Tests and verification

Commands:

```bash
cd app
npm run typecheck
npm run lint
npm run test -- --run
npm run build

cd ..
npm run typecheck
npm run test
npm run test:e2e
```

Platform tests cover request-origin checks, repository persistence, naming,
GitHub admin verification, policy construction, launch orchestration with
injected verifier and adapter doubles, identity challenge signing and
expiry, identity link/rotate/unlink behavior with an injected chain,
merged-PR verification and oracle merge-proof writes, and indexer
reconciliation. Better
Auth and Postgres integration is exercised through the HTTP smoke path. Contract behavior is covered by Rust
unit tests and the sandbox platform-hardening suite.

Readiness check (2026-11-07): app typecheck, lint, 57 tests, and build passed;
root typecheck and 24 tests passed; sandbox e2e passed 4/4; NEP-413 signature
verification against the testnet oracle account passed; Docker auth and
clean-state smoke checks passed.
