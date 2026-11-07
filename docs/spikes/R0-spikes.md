# R0 spikes

Status: `2026-11-06`. R0 ADRs 001–012 are written. Local spikes are complete;
live GitHub checks remain blocked on GitHub App/OAuth registration.

## A. GitHub App admin verification

Goal: prove a GitHub user token can verify that the current user is an admin of
a repository, and that the numeric repository ID is returned for canonical
identity.

Implemented:

- `app/src/lib/platform/github-admin.ts` calls GitHub GraphQL
  `Repository.viewerPermission` with the user token.
- Rejects missing/expired tokens, missing repos, non-`ADMIN` permissions, and
  incomplete GraphQL responses.
- Returns `repoId` (`databaseId`), `fullName`, `defaultBranch`, `isPrivate`, and
  `viewerLogin`.
- Unit tests in `app/src/lib/platform/github-admin.test.ts` cover success,
  `MAINTAIN`, missing repo, `401`, GraphQL errors, and missing-token handling.

GraphQL query:

```graphql
query RepoAdmin($owner: String!, $name: String!) {
  repository(owner: $owner, name: $name) {
    databaseId
    nameWithOwner
    isPrivate
    viewerPermission
    defaultBranchRef { name }
  }
  viewer { login }
}
```

Live verification needs input:

1. Register a GitHub App (or OAuth App) and set `GITHUB_CLIENT_ID` /
   `GITHUB_CLIENT_SECRET`.
2. Provide a user token for a personal repo and an org repo where the user is
   admin, plus a repo where the user is only a maintainer.
3. Confirm `viewerPermission == "ADMIN"` and that the App installation token
   does not replace the user token for this check.
4. Confirm `Repository security advisories` read access with a repo that has a
   test advisory.

Fork/transfer behavior (design result):

- A fork is a new repository with a new `databaseId`; it must launch its own
  board.
- A rename or personal↔org transfer keeps `databaseId`; full name may change.
  The platform keys on the numeric ID, updates `full_name` from webhooks, and
  keeps the existing board.
- Deletion or loss of admin access marks verification stale; the oracle stops
  privileged actions until an admin re-verifies.

## B. Indexer cursor design

Local design result; implementation starts in R3.

- Source of truth: finalized NEAR blocks. Do not index optimistic blocks.
- Cursor: `(block_height, block_hash)` per network, stored in
  `indexer_cursors`. On restart, fetch the block at `block_height + 1`; verify
  its parent hash matches the stored hash before processing.
- Event identity: `(tx_hash, log_index)` unique. Contract events are
  `EVENT_JSON` logs from the board and oracle contracts.
- Backfill: start from the deployment block recorded by the launch service,
  then follow the live cursor. Backfill and live ingestion share the same
  idempotent handler.
- Failure handling: transaction per block, cursor advanced only after all
  events for that block commit. Duplicate events are ignored by unique key.
- GitHub side: webhook deliveries keyed by `X-GitHub-Delivery`; repo identity
  keyed by numeric repo ID; installation events update verification state.
- Reconciliation: periodic `get_repo`, `get_maintainers`, and identity views
  overwrite derived rows if an event was missed.

## C. NEAR account length and slug limits

Implemented `app/src/lib/platform/naming.ts` with tests.

- Slug: 3–32 chars, lowercase `[a-z0-9-]`, no leading/trailing hyphen.
- Account IDs: max 64 chars.
- Names: `<slug>.dao.<root>`, `<slug>.board.<root>`, `<slug>.oracle.<root>`.

Longest suffix is `.oracle.` (8 chars including dots). With a 32-char slug, the
root can be up to 23 chars before an oracle ID exceeds 64. The current root
`bountyboard.testnet` (19 chars) leaves 37 chars, so the 32-char slug limit is
safe. `platformAccountNames` throws if a root produces an over-long id; it does
not silently truncate.

## D. DAO + board deployment cost

Local E2E result: the 21 pre-existing sandbox tests pass with the R1 contract
build, and the 4 new platform-hardening tests pass in
`tests/e2e/platform.test.ts`. Cost measurement is still pending because it
needs a dedicated sandbox run that records balances.

Measurement plan:

1. Record `worker.rootAccount` balance before launch.
2. Create the repo sub-account, deploy the DAO, deploy the board, deploy the
   oracle, fund the board reserve, call `add_repo`, and `set_budget`.
3. Record the balance delta and each account's `storage_usage`.
4. Record gas burned from each receipt.
5. Repeat three times and report median values, split into:
   - storage stake: `storage_usage_bytes * 10^19` yoctoNEAR;
   - gas fees: `gas_burnt * gas_price`;
   - refundable board reserve and DAO proposal bond.
6. Use the result to set the mainnet launch fee and minimum treasury.

## E. Outcome

R0 is complete except live GitHub App checks. R1 contract and app hardening is
implemented and verified locally. The next external dependency is GitHub App /
OAuth registration and credentials before R2 live launch work.
