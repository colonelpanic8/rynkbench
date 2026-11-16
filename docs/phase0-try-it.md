# Trying the Phase 0 to 2 changes

This tree is your original `rynkbench-master` plus the foundation work described in `docs/adr/`. Apart from the Usage tab's clickable key references the clearer message when deleting a layer that is still in use, the theme toggle, and the wording toggle, nothing here changes what the app does; it moves code, adds a capability layer and a reference graph, and adds tests that guard the structure.

## Run it

```sh
nix develop
just setup
just check          # lint, tests, production build
just dev-mocks      # the app with simulated boards, no keyboard needed
```

## What to look at

- **Tests that guard the structure:** `npx vitest run src/architecture` (import boundaries and capability probing, both ratcheted).
- **The new layers:** `src/capabilities/` (what the firmware offers) and `src/domain/` (who refers to what).
- **The Usage tab** (Advanced mode, Usage) now runs on the reference graph; `src/workbench/usage.golden.test.ts` holds 90 golden cases from the previous implementation. Key references in it are links: click one to open the keymap on that key.
- **Light theme:** a Dark or Light button in the top bar switches themes (dark is the default and the choice is remembered). The light colors are a first proposal checked for contrast by `src/ui/theme/themes.test.ts`, not yet reviewed by eye; the connect screen has no toggle yet.
- **Wording:** a Technical or Friendly button in the top bar switches the names of the seven modes and the Advanced tabs (Morse becomes Tap patterns, Forks becomes Conditional keys, and so on). Technical is today's wording and the default. The friendly names are proposals in `src/ui/terms.ts`.
- **Deleting a layer** (keymap, trash button) now says up front which keys and combos still use the layer, instead of reading the keyboard and reporting only the first.
- **Screens that asked "does the firmware have X"** now ask `useCapability` (lighting tabs, layer lighting, status presets, pointing).
- **Decisions and progress:** `docs/adr/` and `docs/glossary.md`.

## If something fails

These changes were checked without the project's real toolchain (no Nix build, no wasm, no vitest run). If `just check` reports a failure, the likely places are the files below; each is small and described in its ADR.

- Type errors involving wire types in `src/model/workbench-state.ts` or `src/domain/sources.ts`.
- A component test in `src/ui` that renders lighting screens (they now read `useCapabilities`, which needs the workbench context's `bundle`).
- Lint findings in the new files (oxlint was not available).

To go back, unzip your original `rynkbench-master.zip` over this tree.

## Getting it onto GitHub

Two workflows are involved (`.github/workflows/`):

- `pages.yml` typechecks, lints, tests, builds and deploys the site to GitHub Pages. It used to run only for pushes to a branch called `master`; this repository's default branch is `main`, so pushes to `main` never deployed. It now runs for `main` and `master`.
- `checks.yml` (new) runs the same checks, without deploying, for every other branch and every pull request.

So the safe order is: push these changes on a branch, wait for `checks.yml` to go green (it is the first run of the full toolchain on this work), then merge to `main` so `pages.yml` deploys it. GitHub Pages must be enabled once under Settings, Pages, with Source set to GitHub Actions.

```sh
git clone https://github.com/moosylog/rync && cd rync
git checkout -b foundation
git am --3way ../rynkbench-foundation.patch
git push -u origin foundation
```

If `git am` stops on a conflict, `git am --abort` and tell me which file.

