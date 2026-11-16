# Firmware patches

Changes Rynkbench would like in the RMK firmware it talks to (built from `colonelpanic8/rmk`, and for the Glove80 and Go60 `colonelpanic8/moergo-rmk`). Rynkbench works without them; each one makes the keyboard protect itself, or keep what you set. Every patch is a folder with the patch as a commit (`git am`), one per branch of the fork when they differ, a README (problem, change, test, results, how to apply and try it) and an `apply.sh` that applies it and runs RMK's tests.

| Patch | What it does | Status |
|---|---|---|
| [rmk-skip-unchanged-keys](rmk-skip-unchanged-keys/README.md) | Does not store a key or encoder action that flash already holds, as RMK's lighting tables already do. Saves flash wear and storage pauses for every host. | For both branches of the fork. On `assembled` (what Rynkbench uses) all 876 RMK tests pass, with a new one that fails without the change; not yet tried on a keyboard |
| [rmk-persist-lighting](rmk-persist-lighting/README.md) | Keeps the lights as they were left across a restart: brightness, background, lights off, and the effects' brightness while they are off. RMK stores them; the MoErgo firmware starts with them. | RMK: all 877 tests pass, with a new one that fails without the change. moergo-rmk part written but not compiled here (nRF52 only); not yet tried on a keyboard |

## Later: keymap transactions

Lighting tables have begin, put and commit; the keymap does not, so a link dropped half-way leaves a keymap half-written (Rynkbench resumes it by planning again, `docs/sync.md`). A keymap transaction, or ZMK Studio-style changes held in RAM until Save, would make a large change all-or-nothing on the keyboard itself. It needs new protocol commands; see ADR 0012.
