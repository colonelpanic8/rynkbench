#!/bin/sh
# Ships the current branch the way the owner's rules ask (CLAUDE.md): push it,
# wait for its Checks run, and only when that is green fast-forward master,
# which deploys; then wait for the deploy. A deploy that fails only in GitHub
# Pages' own steps (it happens) is run once more.
#   npm run ship            push, check, merge, deploy
#   npm run ship -- --check push and check only
set -eu
cd "$(dirname "$0")/.."

branch=$(git rev-parse --abbrev-ref HEAD)
[ "$branch" != master ] && [ "$branch" != main ] || { echo "ship from a branch, not $branch" >&2; exit 1; }
[ -z "$(git status --porcelain)" ] || { echo "commit your changes first" >&2; exit 1; }
sha=$(git rev-parse HEAD)

# The run a workflow made for this commit, waiting for GitHub to start it.
run_for() {
  for _ in $(seq 1 30); do
    id=$(gh run list --workflow "$1" --commit "$sha" --limit 1 --json databaseId -q '.[0].databaseId')
    [ -n "$id" ] && { echo "$id"; return 0; }
    sleep 5
  done
  return 1
}

# Waits for a run; prints its failing lines when it does not succeed.
await() {
  gh run watch "$1" --interval 15 --exit-status >/dev/null 2>&1 && return 0
  gh run view "$1" --log-failed 2>/dev/null | grep -E "##\[error\]|FAIL|×|error TS" | head -20 >&2
  return 1
}

git push -q origin "$branch"
checks=$(run_for checks.yml) || { echo "no Checks run started for $sha" >&2; exit 1; }
echo "Checks: run $checks"
await "$checks" || { echo "Checks failed: nothing merged" >&2; exit 1; }
echo "Checks: green"
[ "${1:-}" = "--check" ] && exit 0

git push -q origin "$branch:master"
deploy=$(run_for pages.yml) || { echo "no deploy started for $sha" >&2; exit 1; }
echo "Deploy: run $deploy"
if ! await "$deploy"; then
  echo "Deploy failed; running it once more" >&2
  gh run rerun "$deploy" >/dev/null
  sleep 20
  await "$deploy" || { echo "Deploy failed twice: see gh run view $deploy" >&2; exit 1; }
fi
echo "Deployed $sha: https://moosylog.github.io/rynkbench/"
