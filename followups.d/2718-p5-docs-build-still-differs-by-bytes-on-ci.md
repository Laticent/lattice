---
origin: 2718
priority: P5
recorded: 2026-10-16
area: infra
severity: low
swimlane: engineering/decisions/2026-09-29-route-budget-soft-hard.md
source: https://github.com/Laticent/lattice/pull/2718
---

# The docs build still differs by a few bytes on CI, so bundle-free PRs owe a declaration

why now   — #2718 bundles nothing, yet CI's route-budget allowance charged it studio +4 and
            playground +1 bytes of eager JS, and it had to add docs/route-budget.d/2718-*.md
            to pass. #2708 hit the same noise. Locally, a build of main 68d9eac and a build of
            the merge with 3f85abb, each in its own worktree, measured identical on every route
            metric. So whatever still varies is specific to CI (#2709 fixed the
            checkout-folder dependence). Every docs-only or test-only PR can pay this tax.
where     — docs/scripts/measure-route-base.sh (the base build) against the PR build in ci.yml's
            docs-build job. Diff the two builds' eager chunks on a runner, not locally: upload
            both dist/ trees as artifacts from one docs-build run and compare file by file.
done when — two CI builds of the same tree measure 0 bytes apart, or the allowance ignores a
            diff smaller than the measured noise and the PR that sets it records the noise.
evidence  — the per-chunk byte diff from one CI run, before and after.
verify    — tier 1 checker: it changes how a merge gate measures.

## What 2026-10-16 measured (the session that shipped 2718-p3 and -p4)

The mechanism is now known; the CI trigger is not.

- **The mechanism.** Every eager chunk that names the engine carries the playground asset version
  (`__LATTICE_ASSET_BASE__`, `/playground/v/<12 hex>/`, from `docs/astro.config.mjs` `define`). That
  version hashes every staged asset (`docs/scripts/sync-playground-assets.mjs`, the
  `createHash('sha256')` block). Any byte change in any synced asset (the runtime, an `esm/` chunk, a
  newcomer frame) gives a new 12-character string, and a different string gzips 1-11 bytes
  differently. One build at a stale root `dist/` against a fresh base reproduced CI's exact symptom:
  `studio eagerJsGz +11 bytes … 11 to declare`, `playground +2`. The `authoring-door` chunk was
  byte-identical but for `/playground/v/2736199c949d/` against `/playground/v/43ae87835282/`.
- **What does NOT move it, locally.** With a fresh root build, the CI order (root build, docs
  `typecheck`, docs `npm test`, `measure-route-base.sh` on the same commit, docs build in the main
  checkout) measured **0 bytes** on every route against the worktree base. The hash stayed
  `2736199c949d` across two rebuilds, after appending to `engineering/workflow.md` and adding files
  under `followups.d/` and `test/benchmark/fixtures/` (#2718's shape), and after the docs suite ran.
- **So on CI, some synced asset differs between the base worktree and the PR checkout** for a reason
  this sandbox does not have. Finding it needs the two `public/playground/v/<hash>/` trees from ONE
  runner. That is a CI-step change (an artifact upload in `docs-build`, or a `diff -rq` of the two
  trees printed to the log), so it is the owner's call (CLAUDE.md SECOND FILTER row 2).

**Options for the owner:**

1. A temporary diagnostic step in `docs-build` that prints `diff -rq` of the base and PR
   `playground/v/*` trees, on one bundle-free PR, then comes out. It is cheap (seconds), it finds the
   asset, and the fix then goes at the cause.
2. Have `check-route-budget.mjs` measure eager JS with `/playground/v/<hex>/` normalized to a fixed
   placeholder. It ends this whole class of noise with no CI change, but it also hides a real move in
   that string. That is harmless for the budget, since the string's length is fixed, and it changes
   how a merge gate measures.
3. Both: 2 now, and 1 to find the cause.
