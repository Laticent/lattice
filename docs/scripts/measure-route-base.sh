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
# Locally, the gate finds explanation files by diffing two COMMITS, so commit the
# docs/route-budget.d/ file first, and rebase on origin/main so a file a reset has since
# deleted on main does not read as one this branch added.
#
# node_modules are HARD-LINKED from this checkout when the lockfile (and, for docs, the
# patch-package patches) match the base: seconds, no network. The workspace links in
# node_modules/@laticent/ are relative, so they resolve inside the worktree. Tools write
# their caches by temp file + rename, so nothing writes through a shared inode (checked
# 2026-09-29: 85,490 files, identical inode/mtime/size before and after a run). Anything
# else gets a real `npm ci`; the root one skips `prepare`, which would install git hooks
# into the shared .git and rebuild bundles the next step builds anyway.
#
# A base that fails to build is not this PR's fault, and a PR cannot fix it. So a failure
# here writes no output and exits 0 with a warning: the gate then reports the allowance as
# NOT checked, in the log, rather than failing every open PR for a problem on main.
set -uo pipefail

BASE="${1:?usage: measure-route-base.sh <base-ref-or-sha> <out.json>}"
OUT="${2:?usage: measure-route-base.sh <base-ref-or-sha> <out.json>}"
ROOT="$(git rev-parse --show-toplevel)"
TMP="$(mktemp -d)"
WT="$TMP/base"
rm -f "$OUT"

warn() { echo "::warning::measure-route-base: $*"; echo "measure-route-base: $*" >&2; }
cleanup() { git -C "$ROOT" worktree remove --force "$WT" >/dev/null 2>&1 || true; rm -rf "$TMP"; }
trap cleanup EXIT

if ! git -C "$ROOT" rev-parse --verify --quiet "$BASE^{commit}" >/dev/null; then
	git -C "$ROOT" fetch --no-tags --depth=1 origin "$BASE" || { warn "could not fetch $BASE"; exit 0; }
fi
git -C "$ROOT" worktree add --quiet --detach "$WT" "$BASE" 2>/dev/null || { warn "could not check out $BASE"; exit 0; }

for d in . docs; do
	same=( "$d/package-lock.json" )
	[ "$d" = docs ] && same+=( docs/patches )
	if git -C "$ROOT" diff --quiet "$BASE" HEAD -- "${same[@]}" && [ -d "$ROOT/$d/node_modules" ]; then
		cp -al "$ROOT/$d/node_modules" "$WT/$d/node_modules"
	else
		flags=(--no-audit --no-fund)
		[ "$d" = . ] && flags+=(--ignore-scripts)
		(cd "$WT/$d" && npm ci "${flags[@]}" >/dev/null) || { warn "npm ci failed in $d on $BASE"; exit 0; }
	fi
done

start=$SECONDS
(cd "$WT" && npm run build >/dev/null 2>&1) || { warn "root build failed on $BASE"; exit 0; }
# The base's own chain, so inject-modulepreload writes the hints the gate counts. Its own
# route-budget check, the last link, may fail without harm, so the exit code is ignored.
# But an EARLIER link failing leaves a dist with no preload hints, which measures far
# smaller and would fail the PR for main's problem: so require the hints, or skip.
(cd "$WT/docs" && GITHUB_STEP_SUMMARY= npm run build >/dev/null 2>&1) || true
grep -q 'rel="modulepreload"' "$WT/docs/dist/studio/index.html" 2>/dev/null || { warn "docs build on $BASE stopped before inject-modulepreload; allowance not checked"; exit 0; }

node "$ROOT/docs/scripts/check-route-budget.mjs" --measure "$WT/docs/dist" > "$OUT" || { warn "measuring $BASE failed"; rm -f "$OUT"; exit 0; }
echo "measure-route-base: built and measured $BASE in $((SECONDS - start))s -> $OUT"
