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
```

`check:env` fails unless the network is `testnet`, the deployer, founder, and
oracle accounts exist, the deployer balance is at least
`MIN_DEPLOYER_BALANCE_NEAR`, and the account ids are distinct.

`dao:create` downloads the pinned Sputnik DAO wasm into `.cache/`, verifies its
sha256 against `scripts/versions.json`, and initializes the DAO with the policy
from `scripts/lib/policy.ts`.

`contract:deploy` deploys the BountyBoard wasm and initializes it with the DAO
account and the D11 timing values from `.env`. It does not fund the reserve;
seeding is a separate later step.

`verify:policy` reads `get_policy` from the DAO and exits non-zero if any role,
permission, or vote-policy invariant is violated.

## Other commands

- `npm run dao:fetch` downloads and verifies the pinned Sputnik wasm only.
- `npm test` runs the TypeScript policy and environment tests.
- `npm run typecheck` typechecks all scripts.

Public deployment addresses and transaction hashes belong in
`deployments/testnet.json`; that file must not contain secrets.
