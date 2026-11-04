#!/usr/bin/env bash
set -euo pipefail

: "${BOUNTYBOARD_CONTRACT_ID:?set BOUNTYBOARD_CONTRACT_ID}"
: "${NEAR_ORACLE_ACCOUNT:?set NEAR_ORACLE_ACCOUNT}"
: "${ORACLE_PUBLIC_KEY:?set ORACLE_PUBLIC_KEY to the scoped key public key}"

NETWORK="${NEAR_NETWORK:-testnet}"
ALLOWANCE="${ORACLE_KEY_ALLOWANCE_NEAR:-1} NEAR"

cat <<CMD
# Run this yourself after reviewing the scope. The key can only call these two
# methods on BountyBoard and cannot link GitHub identities.
near account add-key ${NEAR_ORACLE_ACCOUNT} grant-function-call-access \\
  --allowance '${ALLOWANCE}' \\
  --contract-account-id ${BOUNTYBOARD_CONTRACT_ID} \\
  --function-names 'mark_merged, mark_security_fixed' \\
  use-manually-provided-public-key ${ORACLE_PUBLIC_KEY} \\
  network-config ${NETWORK} \\
  sign-with-keychain send
CMD

cat <<'NOTE'

The identity backend must use a separate key because link_identity and
unlink_identity are intentionally outside this Action key's scope. The security
advisory workflow reuses this same mark_merged / mark_security_fixed key.
NOTE
