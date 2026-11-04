# BountyBoard

Status: implementation in progress. Replace the placeholders below as milestones land.

## 1. What the product is

BountyBoard is a NEAR smart contract and web app for posting, approving, and paying
developer bounties from a Sputnik DAO treasury.

## 2. Problem it solves

_TODO: describe the maintainer workflow and the private-security disclosure gap._

## 3. Architecture and trust model

- Sputnik DAO holds the treasury and council.
- BountyBoard records bounties, approvals, merges, payouts, and reputation.
- BountyBoard never holds user funds except held payouts that are retried or refunded.
- The oracle verifies GitHub merge and advisory publication events.
- Private-security identifiers stay off-chain until the advisory is public.

_TODO: add the contract/module diagram and the threat model summary._

## 4. Testnet addresses and contract ids

| Item | Value |
| --- | --- |
| Network | `testnet` (placeholder) |
| DAO account | `TODO` |
| BountyBoard account | `TODO` |
| GitHub repository | `TODO` |

## 5. Prerequisites

- Rust stable with the `wasm32-unknown-unknown` target
- `cargo-near`
- `near-cli-rs`
- Node.js and npm

## 6. Environment variables

Copy `.env.example` to `.env` and fill in values. Never commit `.env`.

Secrets used by CI (names only): `NEAR_ORACLE_PRIVATE_KEY`, `DEPLOYER_PRIVATE_KEY`,
`GITHUB_TOKEN`, `GITHUB_CLIENT_SECRET`, `NEXTAUTH_SECRET`.

## 7. Demo steps ("do X, see Y")

1. Create the testnet DAO. _Expected: the founder is the only council member and maintainer._
2. Deploy BountyBoard. _Expected: `get_dao` returns the DAO account._
3. Seed a repo and the founder maintainer. _Expected: `get_maintainers` lists the founder._
4. Bootstrap-approve the first bounty. _Expected: the board shows the bootstrap banner._
5. Link a GitHub handle to a NEAR account. _Expected: `get_identity_by_account` returns the handle._
6. Claim the bounty. _Expected: the claim appears on the board._
7. Merge a PR or trigger the oracle. _Expected: the issue becomes `Merged`._
8. Observe the payout and reputation update. _Expected: `Paid` and increased points._
9. Observe a contributor become a maintainer candidate and be promoted. _Expected: candidate then maintainer._
10. Observe a maintainer request council promotion and the `AddMemberToRole` vote. _Expected: the vote appears in the DAO._
11. Observe S0 before and after council growth. _Expected: 1-of-1, then 2-of-2._
12. Observe bootstrap ending at 3 maintainers. _Expected: bootstrap is disabled permanently._
13. Create a dummy private security advisory in a test repo. _Expected: an advisory exists in the test repo._
14. Create a private security bounty from its GHSA hash. _Expected: a redacted board entry._
15. Show that the GHSA ID is absent on-chain before publication. _Expected: only the hash is stored._
16. Publish the dummy advisory, run `mark_security_fixed`, and show the payout. _Expected: payout to the credited researcher._
17. Show that the public board reveals the advisory link only after publication. _Expected: details appear after disclosure._

## 8. Expected output for each step

_TODO: fill in after the testnet run in M15._

## 9. Test commands

```sh
# Contract
cd contracts/bounty-board
cargo fmt --check
cargo clippy --all-targets -- -D warnings
cargo test
cargo near build non-reproducible-wasm

# Repository tooling
npm install
npm run typecheck
npm test
```

## 10. Known limitations

_TODO: list single-repo v1, S0 native claim griefing, advisory expiry handling, and
the testnet timing overrides once they are implemented._

## 11. Hackathon disclosure

_TODO: state what was built during the hackathon window, what is baseline, and which
external libraries are used._
