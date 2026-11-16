#!/bin/sh
# Applies the "do not store a key flash already holds" patch to an RMK checkout
# and runs RMK's storage tests. Usage: ./apply.sh /path/to/rmk
#
# Two versions of the same change, one per branch of colonelpanic8/rmk:
#   for-assembled-ce86673.patch  the `assembled` branch (what Rynkbench and the MoErgo builds use)
#   for-main-4bed409.patch       the default branch
# The script uses the one that applies to the checkout.
set -eu

here=$(cd "$(dirname "$0")" && pwd)
rmk=${1:?usage: ./apply.sh /path/to/rmk}

cd "$rmk"
[ -f rmk/src/storage/mod.rs ] || { echo "not an RMK checkout: $rmk" >&2; exit 1; }

if grep -q "fn put_unless_stored\|fn store_key_action" rmk/src/storage/mod.rs; then
  echo "already applied"
else
  chosen=""
  for patch in "$here/for-assembled-ce86673.patch" "$here/for-main-4bed409.patch"; do
    if git apply --check "$patch" 2>/dev/null; then chosen=$patch; break; fi
  done
  [ -n "$chosen" ] || { echo "neither version applies to this checkout; see README.md" >&2; exit 1; }
  git am --3way "$chosen"
  echo "applied $(basename "$chosen")"
fi

case "$(grep -c "fn put_unless_stored" rmk/src/storage/mod.rs)" in
  0) features="vial,storage" ;;          # the default branch
  *) features="rynk,storage,lighting" ;;  # the assembled branch
esac

if cargo nextest --version >/dev/null 2>&1; then
  (cd rmk && cargo nextest run --no-default-features --features="$features" storage)
else
  echo "cargo-nextest is missing: cargo install cargo-nextest --locked, then"
  echo "  cd rmk && cargo nextest run --no-default-features --features=$features storage"
fi
