#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VERSION="2.14.0"
BIN="$ROOT/node_modules/near-sandbox/bin/near-sandbox"
URL="https://s3-us-west-1.amazonaws.com/build.nearprotocol.com/nearcore/Linux-x86_64/${VERSION}/near-sandbox.tar.gz"

current="$("$BIN" --version 2>/dev/null | head -n 1 || true)"
if [[ "$current" == *"release ${VERSION}"* ]]; then
  exit 0
fi

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

curl -fsSL "$URL" -o "$tmp/near-sandbox.tar.gz"
tar -xzf "$tmp/near-sandbox.tar.gz" -C "$tmp"
mkdir -p "$(dirname "$BIN")"
install -m 0755 "$tmp/Linux-x86_64/near-sandbox" "$BIN"
"$BIN" --version | head -n 2
