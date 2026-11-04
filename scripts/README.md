# Scripts

Operational scripts for the testnet DAO and BountyBoard deployment. They read
configuration from `.env` at the repository root. Never commit `.env` or print
private keys; the scripts print a masked environment summary.

## Prerequisites

- Node.js 20+
- Rust and `cargo-near` for building the BountyBoard wasm
- Funded testnet accounts for the deployer, founder, and oracle
- `DAO_ACCOUNT` as a subaccount of the deployer (or created manually)
- `BOUNTYBOARD_ACCOUNT` as a subaccount of `DAO_ACCOUNT`

Copy `.env.example` to `.env` and fill every value. For the testnet demo, set
`MAINTAINER_CHALLENGE_SECS`, `COUNCIL_PROMOTION_MIN_TENURE_SECS`, and
`COUNCIL_PROMOTION_DELAY_SECS` to short values such as `60`. Keep the 7-day
defaults for production.

## Order

Run from the repository root:

```bash
npm run check:env
npm run dao:create
npm run smart-contract:build
npm run contract:deploy
npm run verify:policy
npm run reserve:fund
```

`check:env` fails unless the network is `testnet`, the deployer, founder, and
oracle accounts exist, the deployer balance is at least
`MIN_DEPLOYER_BALANCE_NEAR`, and the account ids are distinct.

`dao:create` downloads the pinned Sputnik DAO wasm into `.cache/`, verifies its
sha256 against `scripts/versions.json`, and initializes the DAO with the policy
from `scripts/lib/policy.ts`.

`contract:deploy` deploys the BountyBoard wasm and initializes it with the DAO
account and the D11 timing values from `.env`. It does not fund the reserve.

`reserve:fund` calls the payable `fund_reserve` method from the deployer with
`BOUNTYBOARD_RESERVE_NEAR` attached (at least `10` NEAR on testnet) and verifies
that `get_reserve` increased. `get_reserve` reports the whole contract balance,
not only the unlocked portion.

`verify:policy` reads `get_policy` from the DAO and exits non-zero if any role,
permission, or vote-policy invariant is violated.

## S0 native bounty flow

S0 bounties use a Sputnik native bounty for posting approval. The three wallet
steps are separate from BountyBoard:

1. `bounty_claim(id, deadline)` on the DAO attaches the DAO `bounty_bond`.
2. After the work is merged, `bounty_done(id, account_id, description)` on the
   DAO attaches the DAO `proposal_bond` and creates the `BountyDone` proposal.
3. BountyBoard's permissionless `approve_bounty_done(issue_id, proposal_id)`
   votes `VoteApprove` if needed; `confirm_payout(issue_id)` records the payout
   once the proposal is `Approved`.

The native bounty has a single claim slot. A griefer can occupy it by claiming
first; `replace_s0_bounty` lets the council point the issue at a replacement
bounty, and a higher `bounty_bond` raises the cost of griefing. A private
researcher must link their GitHub identity before `approve_bounty_done` can
release the payout.

## Other commands

- `npm run dao:fetch` downloads and verifies the pinned Sputnik wasm only.
- `npm test` runs the TypeScript policy and environment tests.
- `npm run typecheck` typechecks all scripts.

Public deployment addresses and transaction hashes belong in
`deployments/testnet.json`; that file must not contain secrets.
