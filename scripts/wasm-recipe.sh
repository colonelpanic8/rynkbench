#!/bin/sh
# A fingerprint of everything that decides what `npm run wasm` builds: the flake,
# its lock file and the pinned Cargo.lock. Two checkouts with the same
# fingerprint build the same WASM clients.
set -eu
cd "$(dirname "$0")/.."
cat flake.nix flake.lock nix/rynk-wasm-Cargo.lock | sha256sum | cut -d' ' -f1
