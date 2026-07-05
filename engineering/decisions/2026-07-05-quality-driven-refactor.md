---
status: shipped
summary: The follow-through on the 2026-07-05 quality baseline — every finding actioned in one refactor pass. One canonical home for the depth-aware HTML list walkers (lib/core/html-lists.js) and the <section> walker (lib/core/section-walk.js, replacing five pasted copies); the quadrant↔radar 71-line clone extracted to _chart-family/transform-utils.js; the core→component boundary violation fixed by inverting the import direction; validate() (cyclomatic complexity 209) decomposed into 18 single-concern checkers with differential-tested identical behavior; d3-geo declared; a README in every structural folder for junior engineers. Verified by the full unit suite, a 1,381-input differential harness, the pixel-regression gate over the committed gallery goldens, and docs-site screenshots at three widths.
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

**Honest metric note:** the "functions ≥ 15" count ROSE 69 → 72, because
one 209-complexity function became 18 checkers of which a few (e.g.
`checkCapacity` at 34) individually clear the threshold. The worst-case
dropped 4×; total logic is unchanged; the per-function count is simply a
metric that penalizes decomposition. The re-blessed baseline records
72 with this note as its justification.

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
- **Rendered PDFs (the real artifact):** `npm run regress` — every
  gallery re-rendered fresh through the refactored engine and pixel-
  diffed against the committed golden PDFs.
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

## Follow-ups (logged, not in this PR)

- `transformChartSection` (51) and `probeSectionOverflow` (51) are the
  new complexity frontier — each is one function doing dispatch + several
  chart builds; a split would mirror what validate() got.
- journey's walker/escape variants could consolidate onto the shared
  helpers after a behavior review.
- funnel/map's `esc`/`stripTags` twins (identical to each other) could
  move to transform-utils under distinct names if a third consumer ever
  appears.
