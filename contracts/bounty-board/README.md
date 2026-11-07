# BountyBoard contract

Rust (near-sdk v5) contract for the BountyBoard platform. See the repository
root `README.md`, `PLATFORM.md`, and `docs/platform-implementation.md`.

## Build

```bash
cd contracts/bounty-board
cargo near build non-reproducible-wasm
```

The Wasm artifact is written to `target/near/bounty_board.wasm`. Use
`cargo near build reproducible-wasm` only from a clean, committed tree when a
reproducible artifact is required.

## Test

```bash
cd contracts/bounty-board
cargo fmt --check
cargo clippy --all-targets -- -D warnings
cargo test
cargo near build non-reproducible-wasm
```

These four commands are the required checks for every contract change.

## Deploy

The platform launch adapter deploys one board per repository. For a manual testnet
deployment, never deploy to mainnet without explicit human approval.

```bash
near contract deploy <CONTRACT_ACCOUNT_ID> use-file target/near/bounty_board.wasm \
  with-init-call new json-args '{"dao":"<DAO_ACCOUNT_ID>"}' \
  prepaid-gas '30 Tgas' attached-deposit '0 NEAR'
```

Then verify initialization:

```bash
near contract call-function as-read-only <CONTRACT_ACCOUNT_ID> get_dao json-args '{}' \
  network-config testnet now
```

Re-deploying changes state layout requires an explicit migration. v1 exposes no
self-upgrade method.

## Keys

Do not commit keys, seed phrases, `.env` files, or `.near-credentials/`. Use the
deployer account from a local key store or environment variables that are never
checked in.
