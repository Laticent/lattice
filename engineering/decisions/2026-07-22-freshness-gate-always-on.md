---
status: shipped
summary: The artifact-freshness gate (build:check) moved out of the paths-filtered `unit` tier into the always-on `lint` job, so a stale generated file (e.g. the decision index after a new decision doc) is caught on EVERY PR instead of slipping past a docs/prose-only PR's green checks and silently ejecting it from the merge queue.
last-updated: 2026-07-22
companion:
  - ../workflow.md
  - 2026-06-17-workflow-efficiency-review.md
---

# 2026-07-22 — The freshness gate runs on every PR (no more silent merge-queue ejects)

**Symptom → root cause → fix**, the convention of this folder.

## Symptom

A docs-only PR (#1154, the storage overlay) went **green on all its PR checks**, then
**entered the merge queue and was ejected — three times — with no visible failure on the
PR itself.** Classic "enter the queue but exit it." A silent failure: the PR looked
mergeable, but never merged.

## Root cause

Two facts combine into the trap:

1. **The merge queue runs the FULL suite.** `ci.yml`'s `changes` classifier forces
   `code=true` and `docs=true` on a `merge_group` event (it's the final pre-merge gate,
   and paths-filter has no PR base to diff there). So the queue runs `unit` +
   `integration` + `docs-build`, regardless of what the PR touched.

2. **The freshness gate lived behind the paths filter.** `build:check`
   (`tools/build.js --check` — regenerate every committed generated artifact and
   byte-diff) ran only inside the `unit` job, gated on `code == 'true'`. A **docs/prose
   -only PR** sets `code=false` → `unit` skipped → **build:check never ran on the PR.**

The gap: some of build:check's inputs match **neither** the `code` **nor** the `docs`
path filter. The trigger here was a new **`engineering/decisions/*.md`**, which feeds the
generated **`engineering/decisions/README.md`** index — and `engineering/**` is in no
filter. So the new decision doc staled the index, the PR's checks skipped build:check and
went green, and the queue's full-suite run caught the staleness and ejected the PR. The
PR author sees only "removed from the merge queue," never a red check.

(Contributing factor on the tooling side: pushing with `--no-verify` skipped the local
pre-push hook that also runs the freshness gate — so it wasn't caught locally either.)

## Fix

**Move `build:check` into the always-on `lint` job** (removed from `unit`). `lint` has no
`needs: changes` and no path gate, so build:check now runs on **every** PR — prose, docs,
or code alike. A stale generated artifact fails the PR **visibly and immediately**, before
the queue ever sees it. It can no longer be silent.

Why always-on is the right shape (vs. widening the paths filter to include
`engineering/**`): the filter approach requires enumerating *every* input of *every*
generated artifact and keeping that list correct forever — a future artifact with a new
input source silently re-opens the gap. Always-running build:check is robust to that:
whatever the input, staleness is caught. The gate is render-free and deterministic (a pure
byte-diff), so it's cheap to always run and never false-positives. Root-only `npm ci`
suffices (it built fine in its old `unit` home with the same deps).

The heavier tiers (`unit` full suite, `integration` render) stay paths-filtered: a
docs/prose-only PR genuinely cannot break the engine unit or render tiers, so running them
on such a PR would be pure cost with nothing to catch. Only the **cross-cutting freshness
gate** — whose inputs span the whole repo — needs to be unconditional.

## Consequences

- Every PR now runs `build:check` (~1–2 min render-free — 4 `tsc --emitDeclarationOnly`
  passes + several esbuild bundles + the byte-diff) in `lint`. Prose-only PRs pay this
  small, deterministic cost in exchange for the guarantee.
- The merge queue can no longer eject a PR for a stale artifact the PR's own checks passed
  — that class of silent failure is closed.
- **Bonus tightening:** `build:check` also runs `check-ownership.js` (the hex/margin/
  US-English/typography/cascade gates, rules #3/#20/#21/#4/#11/#26) and `check-fonts.js`.
  Those now fire on prose/docs-only PRs too — a British spelling or stray hex added in a
  doc is caught on the PR, not only in the queue.
- `.github/workflows/ci.yml` is in both path filters, so a change to it still runs the full
  suite on its own PR; this change validates itself.
