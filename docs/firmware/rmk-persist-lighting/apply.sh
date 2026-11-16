#!/bin/sh
# Applies "keep the lights as they were left" to RMK (and, given its path, to
# the MoErgo board firmware) and runs RMK's tests.
# Usage: ./apply.sh /path/to/rmk [/path/to/moergo-rmk]
#
#   rmk-for-assembled-ce86673.patch  colonelpanic8/rmk, branch `assembled` (what Rynkbench pins)
#   moergo-rmk-for-d5a44ba.patch     colonelpanic8/moergo-rmk; its dependencies/rmk must be the patched RMK
set -eu

here=$(cd "$(dirname "$0")" && pwd)
rmk=${1:?usage: ./apply.sh /path/to/rmk [/path/to/moergo-rmk]}
moergo=${2:-}

apply() { # dir patch marker-file marker
  if grep -q "$4" "$1/$3"; then
    echo "$(basename "$2"): already applied"
  else
    (cd "$1" && git apply --check "$2") || { echo "$(basename "$2") does not apply to $1; see README.md" >&2; exit 1; }
    (cd "$1" && git am --3way "$2")
  fi
}

[ -f "$rmk/rmk/src/storage/mod.rs" ] || { echo "not an RMK checkout: $rmk" >&2; exit 1; }
apply "$rmk" "$here/rmk-for-assembled-ce86673.patch" rmk/src/storage/mod.rs "LightingOutputStateRecord"

if [ -n "$moergo" ]; then
  [ -f "$moergo/crates/moergo-rmk/src/lighting.rs" ] || { echo "not a moergo-rmk checkout: $moergo" >&2; exit 1; }
  apply "$moergo" "$here/moergo-rmk-for-d5a44ba.patch" crates/moergo-rmk/src/lighting.rs "read_lighting_output_state"
  echo "moergo-rmk: point dependencies/rmk at the patched RMK before building"
fi

if cargo nextest --version >/dev/null 2>&1; then
  (cd "$rmk/rmk" && cargo nextest run --no-default-features --features=rynk,storage,lighting)
else
  echo "cargo-nextest is missing: cargo install cargo-nextest --locked, then"
  echo "  cd $rmk/rmk && cargo nextest run --no-default-features --features=rynk,storage,lighting"
fi
