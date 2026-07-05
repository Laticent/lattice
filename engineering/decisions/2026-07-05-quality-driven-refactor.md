---
status: shipped
summary: The follow-through on the 2026-07-05 quality baseline — every finding actioned in one refactor pass. One canonical home for the depth-aware HTML list walkers (lib/core/html-lists.js) and the <section> walker (lib/core/section-walk.js, replacing five pasted copies); the quadrant↔radar 71-line clone extracted to _chart-family/transform-utils.js; the core→component boundary violation fixed by inverting the import direction; validate() (cyclomatic complexity 209) decomposed into 18 single-concern checkers with differential-tested identical behavior; d3-geo declared; a README in every structural folder for junior engineers. Verified by the full unit suite, a 1,381-input differential harness, a same-machine A/B render (branch vs main — byte-identical HTML, 0 differing PDF pixels), and docs-site screenshots at three widths.
---

# The quality-driven refactor — acting on the baseline's findings

**Ask (2026-07-05):** "complexity is the mother of all killers of future
productivity" — take the quality assessment's first-run findings and
actually fix them; make the codebase easier for a junior engineer to
reason about and contribute to; add per-folder READMEs; verify visually
that nothing broke in the rendered output or the website.

## What changed, by finding

### 1. Boundary violation (1 → 0): the walkers move to core

`lib/core/split-panels.js` imported `parseTopLevelLis` / `extractFirstList`
from the chart-family component kernel — a core primitive depending on a
component, inverting the documented direction. Root cause: those two
functions are generic HTML-walking primitives that merely happened to be
BORN in chart-family; three other files ("kept local to keep the kernel
self-contained") carried byte-identical copies.

Fix: `lib/core/html-lists.js` is now the one home. chart-family re-exports
them (test/API compatibility), and funnel, map, and mark-detail drop their
local copies. mark-detail's copies existed to avoid a require-cycle with
chart-family — importing from core dissolves that reason, not just the
symptom.

### 2. Duplication (3.56% → 2.6%): two more one-home extractions

- `lib/core/section-walk.js` — `mapSections(html, rewrite)`, the
  depth-aware `<section>` walker that chart-family, roadmap, journey,
  split-panels, and masthead each pasted (~30 lines × 5; the masthead
  copy literally said "Mirrors the walker in lib/core/split-panels.js").
  Each `applyToRenderedHtml` is now a small match-and-transform callback.
- `lib/components/chart/_chart-family/transform-utils.js` — the
  quadrant↔radar 71-line exact clone (escHtml, escAttr, stripTags,
  fmtNum, findOuterUL, splitTopLevelLI), now imported by both.

Deliberately NOT merged: funnel/map's local `esc`/`stripTags` (different
escape/entity behavior from the quadrant flavor — byte-compatible output
beats a forced abstraction), and journey's walker variants (they diverged
long ago; consolidating means behavior review, logged as follow-up).

### 3. Complexity (worst 209 → 51): validate() decomposed

`lib/components/index.js`'s `validate()` — 507 lines, cyclomatic
complexity 209, the single worst function in the codebase by 4× — is now
a `MANIFEST_CHECKS` pipeline of 18 named single-concern checkers
(`checkIdentity`, `checkTags`, `checkCapacity`, …) run in the original
order. Adding a manifest rule is now "write one checker, slot it in."

**Second pass — the count goes DOWN, not sideways:** the first
decomposition left "functions ≥ 15" at 72 (up from 69: one 209 function
became 18 checkers, several individually above threshold). Review pushback
("things going higher doesn't feel right") drove a second pass:
`transformChartSection` (51) became a per-layout `SECTION_BUILDERS` table
plus named frame-wrap helpers; `probeSectionOverflow` (51) folded its two
pasted rect-scan loops into one nested helper (nested on purpose — the
function is `.toString()`-injected into page.evaluate, so module-level
helpers can't travel with it); `checkCapacity`/`checkDensity` split into
focused sub-checkers sharing one measurability guard; and the complexity
tool's own walkers restructured onto lookup tables (verified to produce
byte-identical measurements for all 1,442 functions). Final: **67
functions ≥ 15 (below the original 69), worst 45** — and that 45 is an
on-demand tool script (`buildWorld`); the worst engine function is 36.

### 4. Dead/undeclared deps (unlisted 1 → 0)

`d3-geo` — dynamic-imported by `tools/build-basemap.world.js`, never
declared, working only via hoisting luck — is now an explicit
devDependency.

### 5. READMEs — a map in every structural folder

29 folder READMEs (lib/ + its 20 subdirectories, tools/, test/, spec/,
assets/, design/, engineering/, examples/, exemplars/) aimed at a junior
engineer: what the folder is, key files, who consumes it, the canonical
doc it defers to, and the gotcha most likely to bite (browser-bundle
purity, generated files, the `node --test` glob form, …). Skipped where a
good README already exists (themes/, lib/theme/), where it's generated
(dist/), and per-component folders (each has `<name>.docs.md`).

## Verification (surfaces + artifacts)

- **Behavior:** full unit suite 2941/2941 before and after each slice;
  differential harness ran old-vs-new `validate()` over all 80 real
  manifests + per-key-deletion fuzz + 31 broken-manifest cases (1,381
  inputs, 0 output mismatches).
- **Rendered PDFs (the real artifact):** same-machine A/B — four
  representative galleries (quadrant, chart, statement, progression)
  rendered through the branch engine AND through unmodified origin/main:
  emulator HTML byte-identical, and every PDF page **0 differing pixels**
  (pdftoppm + ImageMagick compare). The committed-golden gate
  (`npm run regress`) reports 21 drifted galleries, but unmodified
  origin/main drifts on the SAME galleries with the IDENTICAL numbers
  (e.g. statement 7.06%/7.09%) — that drift is environmental (this
  sandbox's Chromium vs the machine that blessed the goldens),
  pre-existing, and deliberately NOT re-blessed here (42 golden PDFs
  from a foreign render environment would be churn, not signal —
  logged below instead).
- **Website (the real site):** docs site built and screenshotted at
  1440/820/390 (landing, components index, quadrant + radar live
  previews — which render through the rebuilt playground bundle
  containing the refactored transforms — and the Studio).
- **Structure:** dependency-cruiser 0 violations / 0 cycles;
  quality baseline re-blessed (boundary 1→0, duplication 3.56%→2.6%,
  clones 107→95, worst complexity 209→51, unlisted deps 1→0).
- **Independent checks:** a red-team agent attacked the diff (verbatim-
  move verification, walker edge cases, checker-order equivalence) and a
  separate fit/risk agent reviewed it against CLAUDE.md's rules; findings
  folded back before the PR.

## Pass 3 (follow-on PR): the frontier itself, plus real change-coupling

The "continue" pass took the logged frontier apart with the same playbook:
`checkIntegrity` (36) → four named referential sub-checks; `validateSlicing`
(28) → a per-placement validator; `scoreDeck` (30) → five per-category
scorers matching its own banner comments; `carouselize` (33) → a
`CAROUSEL_STRATEGIES` table (the same shape transformChartSection got);
`renderDocs` (32) → six per-section emitters. Result: **64 functions ≥ 15**
(69 → 72 → 67 → 64 across the passes); the worst engine function is now 27.
Deliberately skipped: `buildWorld` (45, network-dependent on-demand tool)
and `transformSlotLabels` (27, browser-runtime DOM path — the verification
cost outweighs a 27).

Verification: 2959/2959 unit; forms differential (loadCatalog identity +
integrity mutations, 0 mismatches); scoreDeck differential over 135 real
decks × 3 input shapes (405 comparisons, 0 mismatches); all 76
baseline/example decks byte-identical through old vs new engine; 53 direct
carousel tests; renderDocs proven by its own byte-diff gate (56 docs
unchanged).

**Change coupling got real:** the sandbox clone was unshallowed (1,382
commits; 616 non-merge commits with ≥2 source files). First full-history
run exposed a tool defect — committed gallery PDFs (generated artifacts)
dominated the pair list — fixed by excluding `*.pdf` / `*.generated.js`
from the default scope. The cleaned signal's one standout: 
`lib/components/index.js` ↔ `lib/components/manifest.schema.json`
co-change 21 times (37% confidence) — the validator and the JSON schema
encode the manifest contract twice and are hand-synced. Logged as the
next structural question (generate one from the other, or gate their
agreement).

## Pass 4: the manifest schema becomes the source of truth

The change-coupling finding (validator ↔ schema co-change 21×, hand-synced)
got its decision: **manifest.schema.json is canonical; code derives.**
Investigation showed the drift was worse than logged — nothing consumed the
schema (every reference was a "kept in sync by hand" comment); a THIRD copy
in `lib/layout/gate.js` had already drifted (missing the `connect` bucket);
the schema was missing three fields real manifests use (`split` — the Fit
Ladder carousel recipe, 13 manifests, validated by NOTHING — plus
`dataCompletion` and `families`); and the schema's
`additionalProperties: false` promise was never enforced.

What shipped: the schema trued up (+`split`/`families`/`dataCompletion`
definitions); `lib/components/index.js` and `lib/layout/gate.js` now derive
FUNCTIONS/BUCKETS/FORMS/SUBSTANCES/axes/name-pattern/allowed-key-sets from
the schema (a JSON require — fs-free, esbuild-inlined for the browser);
two new checkers enforce what the schema declares (`checkSplit` — closing
the unvalidated-strategy footgun at the data boundary — and
`checkUnknownKeys` for additionalProperties:false); and
`test/unit/components/schema-source-of-truth.test.js` sync-gates the three
mirrors that stay hand-written for browser-purity (focus.js axes, lint-core
FOCUS_AXES, CAROUSEL_STRATEGIES keys). Verified by a 1,276-input
differential vs origin/main: 0 unexpected diffs (112 differ only by the
intended new enforcement); the independent checker proved the strict
prefix property over a 23-case adversarial corpus, verified the browser
bundle inlines the schema (the `connect` fix reaches the Studio), and
demonstrated live schema-object corruption via the require cache — fixed
by deep-freezing the schema on load. Two pre-existing residuals it
surfaced, logged not fixed: `lattice-emulator.js` hand-lists
WIDTH_REDUCING_STRATEGIES (a subset classifier a strategy rename would
silently miss), and `lint-core.js` hard-codes the axis list in one
message string the sync gate doesn't cover.

### Pass 4 hardening — red team + inversion + fit/risk (three parallel lenses)

Review asked for the full trio on the schema PR. Zero must-fix across all
three; the folded-back findings: the first two sync tests were TAUTOLOGIES
(derived-vs-schema — can never fail), so the schema's load-bearing content
is now FIXTURE-PINNED (widen/delete/reorder/un-anchor all fail a literal
fixture, making schema edits as loud in review as validator edits were); a
disk↔enum gate (deleting a bucket from the enum silently orphaned that
whole component family — loadAll only walks listed buckets); an
intra-schema agreement test (the axis enum exists in FIVE copies inside the
schema itself); gate.js now deep-freezes its browser copy too; the
emulator's WIDTH_REDUCING_STRATEGIES subset is gated against the strategy
enum; a stale comment checkSplit falsified is fixed; and the CHANGELOG
warns own-manifest npm consumers about the stricter loader.

Tracked residuals surfaced by the lenses (pre-existing, off-path, logged):

- **Packaged-CLI autosplit is a silent no-op** (inversion, path 6): the
  npm-shipped `dist/lattice-emulator.js` resolves `loadAll()` against
  `<pkg>/dist/`, which holds no manifests, so `SPLIT_CAP` is empty and
  `autosplit: on` does nothing for `npx lattice` users — on main today.
  Fix candidate: resolve the manifests dir from PKG_ROOT (resolver already
  in the bundle) or bake a manifest registry into the bundle.
- **`validate()` throws (not errors) on a truthy non-string `sample` for a
  card-style/ledger layout name** — TypeError via lint-core's
  findInlineTitleBodyLine; predates every pass.
- **`docs/src/components/studio/manifest-complete.ts`** uses a bare bracket
  lookup over MANIFEST_ENUMS, so typing `"constructor": "` in the manifest
  editor resolves Object.prototype.constructor and crashes the completion
  source.
- **`ADAPT_MODES` is hand-mirrored** in `lib/layout/ai.js` and
  `tools/check-ownership.js` (not yet schema-derived or sync-gated);
  `orientation`/`adapt`/`showcase` values pass checkUnknownKeys but get no
  structural validation from validate() (repo-side, check-ownership's
  checkAdaptDeclarations covers adapt.mode).

## Follow-ups (logged, not in this PR)

- **The committed gallery goldens drift ~7-13% on this sandbox's
  Chromium even for unmodified main** — the regression gate's goldens
  encode the blessing machine's renderer. Worth either re-blessing from
  the canonical environment or recording the blessing Chrome version in
  the baseline so the gate can warn on mismatch instead of crying drift.
- The emulator's PDF output embeds a nondeterministic font-subset blob
  (two same-code renders of the same deck differ in ~5 KB of embedded
  font bytes; the HTML sidecar is deterministic). Harmless today, but a
  deterministic embed would make PDF byte-diffs usable as a gate.

- The complexity frontier after the second pass is all pre-existing,
  untouched code: `buildWorld` (45, an on-demand network tool),
  `checkIntegrity` (36) / `validateSlicing` (28) in `lib/forms/index.js`
  (the same decomposition validate() got would fit), `carouselize` (33),
  `renderDocs` (32), `scoreDeck` (30).
- journey's walker/escape variants could consolidate onto the shared
  helpers after a behavior review.
- funnel/map's `esc`/`stripTags` twins (identical to each other) could
  move to transform-utils under distinct names if a third consumer ever
  appears.
