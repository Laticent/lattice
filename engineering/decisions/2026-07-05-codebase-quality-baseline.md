---
status: shipped
summary: Stood up automated codebase quality assessment (structural coupling, architectural boundaries, circular deps, git change coupling, complexity, duplication, dead exports/files — dependency-cruiser + jscpd + knip + two bespoke scripts, orchestrated by `tools/quality-assessment.js`, on-demand not a blocking gate). Captures the first-run baseline and its findings: one real architectural-boundary hit (`lib/core/split-panels.js` → a component), one massive complexity outlier (`lib/components/index.js`'s `validate()`, cyclomatic complexity 209), 3.56% duplication, near-zero dead code, and one undeclared dependency (`d3-geo`). Logs (does not fix) two off-path items found along the way — a stale "12 component buckets" doc claim and new devDependency transitive audit findings.
---

# Codebase quality assessment — tooling + first-run baseline

**Ask (2026-07-05):** "we have tests but complexity is the mother of all
killers of future productivity" — assess seven structural-health dimensions
automatically and capture the results: structural coupling, architectural
boundary violations, circular dependencies, git change coupling, complexity,
duplication, dead exports/files.

## What shipped

Tooling — see `engineering/quality-assessment.md` for the full design and
usage. In one line: `dependency-cruiser` (coupling + boundaries + cycles),
`jscpd` (duplication), `knip` (dead code), two new bespoke scripts
(`tools/change-coupling.js`, `tools/complexity-report.js`), orchestrated by
`tools/quality-assessment.js` → `npm run quality` / `quality:bless` /
`quality:check`. On-demand, not a blocking CI gate, mirroring the
`bench`/`scorecard` baseline-ratchet pattern (HARD RULE #19). None of the
seven dimensions were covered by any existing tool (`engineering/
capabilities.md` had nothing for any of them before this).

## First-run baseline (this environment, 2026-07-05)

```
Structural coupling   modules analyzed: 193
Circular dependencies: 0
Boundary violations:   1
Duplication:           3.56% (107 clones, 180 files scanned)
Dead files (knip):     0
Dead exports (knip):   0
Unlisted deps (knip):  1
Complexity:            69 functions ≥ 15 (worst: 209)
Change coupling:       184 pairs ≥ 3 co-changes over 37 commits (SHALLOW CLONE)
```

Committed to `test/quality/baseline.json` via `npm run quality:bless`. (The
count moved 68→69 between the first run and blessing: a Biome
`useIterableCallbackReturn` lint fix in `complexity-report.js` itself turned
a `.forEach()` into a `for...of`, which is one more McCabe decision point —
the tool correctly caught its own tiny complexity increase mid-PR, exactly
the workflow it's built for.)

### The findings worth reading (not all 68/107/etc. are — most are the
### expected long tail; these are the ones that stand out)

1. **Complexity outlier — `lib/components/index.js`'s `validate()`,
   cyclomatic complexity 209 across 507 lines.** By a wide margin the single
   worst hit in the whole codebase (#2 is 51). This is the manifest
   validator that HARD RULE #6-adjacent tooling (component authoring)
   depends on; its size is plausible for "one function checks every
   manifest field," but 209 branches in one function is exactly the kind of
   thing that makes the NEXT manifest-schema change slow and risky to
   review. **Not fixed here** — this PR is the assessment tooling, not a
   `lib/components/index.js` refactor; flagging it as the top candidate for
   a follow-up split (e.g. one checker function per manifest concern).

2. **One real architectural-boundary hit — `lib/core/split-panels.js`
   imports `lib/components/chart/_chart-family/chart-family.js`.**
   `lib/core` is meant to be component-agnostic ("a structural primitive —
   nothing; any component opts in," `engineering/architecture.md`); a core
   primitive reaching into ANY component code — even a bucket's
   underscore-prefixed shared kernel — inverts that direction. This reads
   as real, minor architectural debt rather than noise: the
   `component-no-cross-bucket-reach` rule DOES exempt underscore-prefixed
   targets (since that's the sanctioned lateral shared-kernel pattern
   between sibling components), but `core-no-component-imports` does not,
   because `lib/core` importing FROM components is a layering inversion no
   matter what it targets. Worth a look next time `split-panels.js` or
   `chart-family.js` changes.

3. **One undeclared dependency — `tools/build-basemap.world.js` imports
   `d3-geo`, which isn't in `package.json`.** Pre-existing, found by `knip`.
   Works today only because something else in the install tree happens to
   hoist a compatible `d3-geo` — a `npm ci` on a lockfile that stops hoisting
   it would break this script silently. Logged, not fixed (off-path per
   HARD RULE #18 — this PR doesn't touch basemap generation).

4. **Duplication (3.56%, 107 clones) is mostly the repo's own accepted
   convention**, not a refactor backlog: dozens of `tools/build-*.js`
   scripts intentionally repeat a small `--check`/`--silent` CLI scaffold
   rather than share an abstraction (consistent with this repo's "no
   premature abstraction" stance) — including, a little ironically, the two
   new scripts this PR adds (`change-coupling.js` and `complexity-report.js`
   share a similar arg-parsing/print shape). Worth re-reading the full
   `.scratch/quality-report/duplication.json` output for a real outlier
   before assuming any of it needs fixing.

5. **Dead code is close to zero** — `knip` found no unused files and no
   unused exports (after excluding `mermaid-v11.min.js`, a vendored asset
   that isn't source). Read this as a genuinely clean result, not a
   configuration gap: entries were deliberately set up for every
   synthetic-string-entry bundle (`lib/theme`, `lib/layout`,
   `lib/authoring`, `lib/exemplars`, `lib/components/chart/_chart-family`,
   `lib/core`) so those directories' real reachability (through
   `tools/build-*-core.js`'s template-literal entry point, which static
   analysis can't trace) wouldn't false-flag as dead — see
   `engineering/quality-assessment.md` for why.

6. **Change coupling is informational only here — the sandbox has a
   shallow git clone** (`git rev-parse --is-shallow-repository` → true, ~37
   commits with ≥2 in-scope files reachable). The top pairs found (e.g.
   `docs/src/playground/authoring-core.generated.js` co-changing with
   `lib/authoring/lint-core.js`) are exactly what SHOULD co-change — a
   generated bundle tracking its source — not a smell. A trustworthy change-
   coupling read needs a full clone (`git fetch --unshallow`); this baseline
   deliberately excludes it from `quality:check`'s regression gate for
   exactly this reason.

## Two off-path items logged, not fixed (HARD RULE #18)

- **CLAUDE.md's "12 component buckets" line has drifted.** The live
  filesystem has 13 (`lib/components/connect/` — `contact`, `wifi`,
  `_qr-card` — declaring `"bucket": "connect"` in its manifests) but
  CLAUDE.md and `design/design-system.md`'s hand-written bucket table both
  still say 12 and don't list `connect`. `design/design-system.md` itself
  already concedes this drift risk ("the live count is `dist/docs/
  components.json` `.count`"). Not fixed here — this PR's tooling
  deliberately derives its own bucket list from the filesystem at
  config-load time (`.dependency-cruiser.cjs`) rather than trusting the doc,
  precisely so it can't rot the same way; the doc itself is untouched,
  off-path for this change.
- **New devDependencies (`dependency-cruiser`, `jscpd`, `knip`) pull in a
  few transitively-vulnerable packages** (`uuid`, `ws`, `undici` — moderate/
  high severity per `npm audit`, all devDependency-only, not shipped in the
  published package). The existing dependency tree already carried several
  (`dompurify`, `esbuild`, `js-yaml`, `linkify-it`, `markdown-it`, `mermaid`)
  before this change. Not run `npm audit fix` here — that's a version-bump
  decision independent of this PR's scope, logged for a maintainer to
  triage separately.

## Next steps (not this PR)

- Consider `lib/components/index.js`'s `validate()` (finding #1) for a
  deliberate split — a separate change, reviewed on its own.
- Decide whether `lib/core/split-panels.js` → `chart-family.js` (finding #2)
  is intentional debt to allowlist or a real fix.
- Re-run `npm run quality` somewhere with full git history for a
  trustworthy change-coupling read before acting on it.
