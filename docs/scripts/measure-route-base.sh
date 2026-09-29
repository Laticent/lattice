#!/usr/bin/env bash
# measure-route-base.sh <base-ref-or-sha> <out.json>
#
# Build `main` (or any base) in a throwaway git worktree and write its per-route byte
# numbers to <out.json>, so check-route-budget.mjs can hold a PR to the per-PR allowance:
# how much THIS PR adds, not how much the route weighs. CI runs it on pull_request before
# the docs build and passes the result in ROUTE_BUDGET_BASE_JSON. Locally:
#
#   bash docs/scripts/measure-route-base.sh origin/main /tmp/route-base.json
#   (cd docs && ROUTE_BUDGET_BASE_JSON=/tmp/route-base.json ROUTE_BUDGET_BASE_SHA=origin/main \
#     npm run check:route-budget)
#
# node_modules are HARD-LINKED from this checkout when the lockfile matches the base
# (seconds, no network); the workspace links in node_modules/@laticent/ are relative, so
# they resolve inside the worktree. A changed lockfile gets a real `npm ci`.
#
# A base that fails to build is not this PR's fault, and a PR cannot fix it. So a failure
# here writes no output and exits 0 with a warning: the gate then reports the allowance as
# NOT checked, in the log, rather than failing every open PR for a problem on main.
set -uo pipefail

BASE="${1:?usage: measure-route-base.sh <base-ref-or-sha> <out.json>}"
OUT="${2:?usage: measure-route-base.sh <base-ref-or-sha> <out.json>}"
ROOT="$(git rev-parse --show-toplevel)"
WT="$(mktemp -d)/base"
rm -f "$OUT"

warn() { echo "::warning::measure-route-base: $*"; echo "measure-route-base: $*" >&2; }
cleanup() { git -C "$ROOT" worktree remove --force "$WT" >/dev/null 2>&1 || true; }
trap cleanup EXIT

if ! git -C "$ROOT" rev-parse --verify --quiet "$BASE^{commit}" >/dev/null; then
	git -C "$ROOT" fetch --no-tags --depth=1 origin "$BASE" || { warn "could not fetch $BASE"; exit 0; }
fi
git -C "$ROOT" worktree add --quiet --detach "$WT" "$BASE" 2>/dev/null || { warn "could not check out $BASE"; exit 0; }

for d in . docs; do
	if git -C "$ROOT" diff --quiet "$BASE" HEAD -- "$d/package-lock.json" && [ -d "$ROOT/$d/node_modules" ]; then
		cp -al "$ROOT/$d/node_modules" "$WT/$d/node_modules"
	else
		(cd "$WT/$d" && npm ci --no-audit --no-fund >/dev/null) || { warn "npm ci failed in $d on $BASE"; exit 0; }
	fi
done

start=$SECONDS
(cd "$WT" && npm run build >/dev/null 2>&1) || { warn "root build failed on $BASE"; exit 0; }
# The base's own chain, so inject-modulepreload writes the hints the gate counts. Its own
# route-budget check may pass or fail; either way dist/ is complete by then.
(cd "$WT/docs" && npm run build >/dev/null 2>&1) || true
[ -f "$WT/docs/dist/studio/index.html" ] || { warn "docs build produced no dist on $BASE"; exit 0; }

node "$ROOT/docs/scripts/check-route-budget.mjs" --measure "$WT/docs/dist" > "$OUT" || { warn "measuring $BASE failed"; rm -f "$OUT"; exit 0; }
echo "measure-route-base: built and measured $BASE in $((SECONDS - start))s -> $OUT"
