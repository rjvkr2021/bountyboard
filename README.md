# BountyBoard

Multi-repo bounty boards for GitHub repositories, settled from per-repo Sputnik
DAOs on NEAR. A repository owner can launch a DAO, BountyBoard contract, and
oracle account; contributors discover work; maintainers fund issues; and payouts
settle on-chain under DAO policy.

The platform uses Better Auth with email/password and GitHub sign-in, board
launch, a live GitHub admin verifier, self-service GitHub-to-NEAR identity
links proven with NEP-413 wallet signatures, wallet-backed contribution and
governance actions, and the real NEAR launch adapter.
Better Auth stores GitHub account links, users, and sessions in Postgres. The Docker
stack and sandbox/e2e suite are verified. A live testnet launch has completed for
`rjvkr2021/bountyboard_test_repo`; GitHub OAuth is configured, while GitHub App
credentials, webhooks, and KMS integrations remain open.

## Quickstart with Docker

```bash
# Create .env with POSTGRES_PASSWORD, BETTER_AUTH_SECRET, GitHub OAuth credentials, and NEAR settings.
openssl rand -base64 48
docker compose up --build
```

Open `http://localhost:3000`. Compose starts Postgres, waits for it to become
healthy, and the app applies the Better Auth schema on startup. PostgreSQL and
platform JSON data are kept in named volumes. Compose bind-mounts the wasm files
from the repository; run `npm run smart-contract:build` and
`npm run fetch:sputnik` before launching a board. Accounts and repository
Accounts work without those artifacts.

Routes:

- `/` — repository directory
- `/signin`, `/signup`, `/account` — email/password and GitHub sign-in, explicit GitHub linking for email accounts, session, owned boards, earnings, and NEAR identity linking
- `/launch` — launch a DAO-backed board for a repository
- `/r/<slug>` — board, issues, activity, contribution actions, and maintainer/council governance
- `/r/<slug>/issues/<issueId>` — claim, maintainer approval, merge-proof submission, and payout request
- `/docs` — user documentation
- `/status` — configuration, indexer cursors, and recent platform events

The first request creates the platform state in Postgres (`platform_state`). Local Docker can still import `/data/platform.json` on first boot. See [`docs/vercel-deployment.md`](docs/vercel-deployment.md). The legacy JSON file is backed by
the `platform-data` volume. To reset both platform and auth data locally, remove
the volumes and restart:

```bash
docker compose down -v
docker compose up -d --build
```

Restarting recreates the Better Auth schema and starts with an empty platform
store; no data is migrated. The current Docker test environment was reset this
way and has zero auth users and no repositories or deployments.

For local development without the app container, load the root `.env` values
into the shell, start Postgres with `docker compose up -d db`, then run:

```bash
set -a
. ./.env
set +a
cd app
npm install
npm run dev
```

Launching requires a GitHub sign-in with repository admin access, a linked NEAR
founder account with enough balance to pay the launch funding, and the NEAR
deployer/oracle configuration below. The founder wallet transfers the launch
amount to the deployer; the server verifies that transaction before deploying.

## Architecture

```text
GitHub repository
      |
      v
Launch service  --->  per repo:
                        <slug>-dao.<root>     Sputnik DAO treasury
                        <slug>-board.<root>   BountyBoard policy/registry
                        <slug>-oracle.<root>  oracle signer
      |
      v
Platform store + indexer  --->  directory, boards, issues, identities, events
      |
      v
Next.js app
```

- The DAO holds funds and final approval authority.
- BountyBoard holds no treasury funds; it records bounties, approvals, claims,
  identities, and payout requests.
- The oracle signs merge/security proofs and identity links.
- The platform launch service creates accounts and initial policy but keeps no
  ongoing custody or governance powers.

See `PLATFORM.md` for the target design and `docs/platform-implementation.md` for
the implemented flow, API, launch sequence, limitations, and production
checklist.

## Configuration

Docker Compose and the app container read the repository-root `.env`; do not
commit it. When running `app/` directly, export the same values in the shell.
The tables below list the required values.

Required for accounts:

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | PostgreSQL connection used by Better Auth |
| `BETTER_AUTH_SECRET` | At least 32 random characters; encrypts and signs auth data |
| `BETTER_AUTH_URL` | Public base URL of the app, e.g. `http://localhost:3000`; required at runtime (Compose defaults it) |
| `GITHUB_CLIENT_ID` | GitHub OAuth App client ID; required for GitHub sign-in and repository admin checks |
| `GITHUB_CLIENT_SECRET` | GitHub OAuth App client secret |

Create a GitHub OAuth App with callback URL
`<BETTER_AUTH_URL>/api/auth/callback/github`, for example
`http://localhost:3000/api/auth/callback/github` locally. Better Auth requests
the GitHub profile, verified email, and `public_repo` scope. Docker Compose also requires
`POSTGRES_PASSWORD`; it builds `DATABASE_URL` from `POSTGRES_USER`,
`POSTGRES_PASSWORD`, and `POSTGRES_DB`.

Required to launch boards:

| Variable | Purpose |
| --- | --- |
| `PLATFORM_DEPLOYER_ACCOUNT` | Root/deployer account |
| `PLATFORM_DEPLOYER_PRIVATE_KEY` | Deployer signing key (prefer KMS) |
| `PLATFORM_ORACLE_PUBLIC_KEY` | Key installed on each oracle account |
| `PLATFORM_BOARD_WASM` | BountyBoard wasm path |
| `PLATFORM_SPUTNIK_WASM` | Sputnik DAO wasm path |

The launch flow uses the stored GitHub OAuth token with the `public_repo` scope
to list eligible public repositories and verify admin access. The current adapter expects the deployer to create subaccounts under
`PLATFORM_ROOT_ACCOUNT`; in practice set both to the same account.

`PLATFORM_ORACLE_PRIVATE_KEY` is required for self-service identity links and
also links the founder identity during launch. Production must use KMS instead.
`PLATFORM_IDENTITY_RELINK_COOLDOWN_SECS` controls the cooldown before changing
or re-linking an identity; it defaults to `86400`.

## Contract

The BountyBoard contract is in `contracts/bounty-board`. It is a NEAR smart
contract written with `near-sdk` 5.29. It supports:

- Repository metadata bound to a numeric GitHub repo ID.
- Tiered bounties, approvals, claims, merge proofs, and cancellation.
- Private security-advisory commitments and post-publication disclosure.
- Numeric GitHub identity links.
- Council-derived maintainers and promotion provenance.
- DAO-only oracle rotation and council-policy synchronization.
- Budget commitments, daily caps, payout recovery, and reputation.

Build and test:

```bash
export PATH="$HOME/.cargo/bin:$PATH"
cargo test --manifest-path contracts/bounty-board/Cargo.toml
cargo clippy --manifest-path contracts/bounty-board/Cargo.toml --all-targets -- -D warnings
cargo fmt --manifest-path contracts/bounty-board/Cargo.toml --check
npm run smart-contract:build
```

Platform-hardening contract tests run against a sandbox:

```bash
npm run test:e2e
```

## Verification

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

The app test suite covers request-origin checks, platform naming, GitHub admin
verification, policy construction, JSON store persistence, launch orchestration
with injected verifier/adapter doubles, identity challenge/link behavior,
merged-PR verification and oracle merge-proof writes, indexer reconciliation,
and formatting.
Contract behavior is covered by Rust unit tests and the sandbox
platform-hardening suite.

Readiness check (2026-11-06): app typecheck, lint, 57 tests, and build passed;
root typecheck and 24 tests passed; sandbox e2e passed 4/4; NEP-413 signature
verification against the testnet oracle account passed; merged-PR verification
and oracle merge-proof writes are covered by tests; Docker auth and clean-state
smoke checks passed.

## Current limitations

- The JSON platform store is single-process and not suitable for concurrent production use. Better Auth users and sessions are in Postgres, but repository and board metadata still use the JSON store and should move to Postgres before a real public launch.
- The real NEAR launch adapter completed a live testnet launch for
  `rjvkr2021/bountyboard_test_repo` at `/r/bountyboard-test-repo-live`. KMS,
  idempotency, crash recovery, rollback, and verification tooling remain open.
- Board launch is public-repository only. Private repositories are rejected.
- GitHub App installation callbacks, webhooks, and security-advisory access are
  not implemented.
- Account auth is GitHub OAuth only. Account deletion, two-factor
  authentication, and shared rate limiting are not configured yet. Better Auth
  uses the verified email returned by GitHub.
- Identity linking is exposed in `/account#identity` and uses the configured oracle key.
  Abuse signals and shared rate limits for identity link/unlink remain open.
  Public and private-security bounty creation, budget proposals, cancellation,
  claim, maintainer approval, merge proof, payout requests, S0 native settlement,
  candidate promotion, council requests, DAO vote approval, and request sync are
  exposed. Private S0, payout recovery, DAO veto proposals, and the proposal inbox
  remain open.
- The indexer is state reconciliation over RPC, not event-log ingestion; it has
  no reorg handling, backfill, or GitHub webhook sync.
- Platform metadata in Postgres, search, contributor feeds, and production
  monitoring are future work.
- Multi-author equal split is deferred.

## Security

- Never commit `.env`, private keys, or GitHub tokens.
- Near launch and identity writes read deployer and oracle keys from environment
  variables as a local-development escape hatch. Production must use KMS,
  rotation, audit logging, and least-privilege keys.
- The GitHub OAuth session uses the `public_repo` scope for repository listing
  and admin verification. It is never exposed to the browser.
- Merge-proof verification uses the public GitHub REST API, so only public
  repositories are supported until the GitHub App integration lands.
- Keep the public beta on testnet until the contract audit, launch-service
  review, and incident-response plan are complete.
