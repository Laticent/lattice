---
status: proposed
summary: >
  Asked whether the build leans too hard on visual inspection and whether CSS-based
  checking could replace it. Cataloged every gate by the ORACLE it consults, and the
  premise inverts: nothing in the merge path is gated on pixels or on a human looking.
  6,103 unit tests (84s) and ~60 static ownership checks (13s) already carry the
  compliance layer the question asks for — color alone is 642 browser-free assertions
  across 32 files. What costs 11 minutes of wall clock and ~25 runner-minutes per PR is
  tier T3: real-browser COMPUTED-STYLE and GEOMETRY reads, which are CSS inspection that
  happens to need a layout engine, not visual inspection. No JS layout engine can replace
  them — jsdom returns zeros and a flexbox solver would be a second engine to drift from
  Chromium (HARD RULE #1) — so the lever is not the oracle but the RENDER COUNT feeding
  it. The largest single one, measured both ways: the component-invariant suite spawns
  the emulator 61 times (once per component, ~150s) to lay out 61 independent one-slide
  decks that are sections of one deck — one render of all 61 takes 8.7s. Second:
  `integration` waits on `unit` for no technical reason, adding ~2m to the critical
  path; third, `golden-diff` spends 1m23 on a full-history checkout for a job whose
  work took 1s. Also found: seven expensive gates (`overflow:check`, `geometry:check`,
  `css:values`, `check:chart-fit`, `check:render`, `build:galleries:check`,
  `build:bucket-galleries:check`) are wired to NO cadence at all — they run when
  somebody remembers, which is what a weekly tier is for — and `studio-e2e-nightly` has
  been red six nights running on one live-OpenRouter case while its 29-minute main job
  passes.
---

# Where inspection actually happens — the oracle catalog, and what CI costs

**2026-08-18 · measurement + catalog. Sequel to
`2026-08-16-render-format-cost-assessment.md`, which asked the same question about
FORMAT (PDF vs HTML vs image) and left CI wall clock explicitly unmeasured (its §8).
This note measures it.**

**Question asked:** are we too reliant on visual inspection in the builds? Why can't
CSS-based checking do it — color compliance from the token system, positioning
calculated from the HTML and CSS? Where do we rely on PDF inspection, where on CSS
inspection, and what can be moved between per-PR / daily / weekly?

**Short answer, and it inverts the premise twice.**

1. **Almost nothing in the merge path is visual.** Not one required check compares
   pixels or asks a human to look. The pixel comparator that exists
   (`golden-diff.mjs`) is explicitly non-gating — it posts a before/after montage
   for a reviewer and always exits 0. Human review (the QUALITY BAR, the
   `visual-review.md` fan-out, export sign-off) is a *discipline*, not a gate.
2. **The CSS-based checker being proposed already exists, at scale.** ~60 static
   checks in `tools/check-ownership.js` run in **13 seconds** on every PR;
   6,103 unit tests run in **84 seconds**. Color compliance alone is **642
   assertions across 32 files in `test/unit/palette/`**, all browser-free, resolving
   the token graph and doing WCAG/OKLab math in JS.

What actually costs the 11 minutes is a third thing, and naming it is most of the
answer: **T3 — reading computed styles and box geometry out of a real browser.**
That is CSS inspection. It is not visual inspection. And it cannot be moved down a
tier by writing a better CSS parser, because the thing it needs is not parsing — it
is *layout*.

---

## 1. The six oracles

Every gate in this repo consults exactly one of these. The tier is what the
assertion *reads*, not what it is about.

| Tier | Oracle — what is actually read | Needs | Deterministic |
|---|---|---|---|
| **T0** | Source text / AST / CSS declarations as written | nothing | yes |
| **T1** | The *resolved* token graph — `var()` chains flattened, color math in JS | nothing | yes |
| **T2** | An in-process DOM with **no layout** (jsdom, the markdown-it kernel) | nothing | yes |
| **T3** | A real browser: `getComputedStyle`, `getBoundingClientRect`, `scrollHeight` | Chromium | yes¹ |
| **T4** | PDF bytes — `/Annots`, `/PageMode`, page count, extracted text | Chromium + poppler/pdf-lib | yes |
| **T5** | Rasterized pixels — PNG diffs, montages | Chromium + poppler + ImageMagick | **no**² |
| **T6** | A human or an agent looking at the artifact | eyes | no |

¹ Deterministic *given the same Chromium and fonts* — which is the whole reason the
pixel gate was retired for semantic invariants in the P4 pivot
(`2026-06-12-p4-regression-gate-retire-marp.md`). Selector matches, computed colors
and the overflow flag are logical facts of the laid-out DOM; they carry no sub-pixel
antialiasing.

² Skia rasterizes differently across hosts, so a golden blessed on another machine
differs even with identical input. This is why T5 informs and never gates.

---

## 2. The catalog

### T0 — static source, no DOM · **every PR, 17s total**

| Gate | What it reads | Cadence | Cost |
|---|---|---|---|
| `check:ownership` — ~60 named checks, run via `build:check` | manifests, theme CSS, layout CSS, workflow YAML, agent cards | every PR (always-on, not path-gated) | **13s** |
| `npm run lint` (biome) | JS/TS/CSS source | every PR | 3s |
| `npm run lint:deck:all` | every committed deck's markdown | every PR | 1s |
| `build:check` byte-diff of every generated artifact | `dist/`, indexes, spec docs | every PR | (in the 13s) |

Color rules living here: `checkHexLiterals` (HARD RULE #3), `checkRetiredTokenNames`
(#11), `checkThemeTokenParity`, `checkNoSafeDefaultTokens`, `checkDanglingTokenReads`,
`checkCatInkDeclared` / `checkCatInkFallback`, `checkAnimaColorVocabulary`.
Layout rules: `checkMarginDiscipline` (#20), `checkZPlanes`, `checkSectionBoxOwnership`,
`checkSectionCqAnchoring`, `checkStageInsetOwnership`, `checkCascadeLayers` (#26).

**This tier is the answer to "why can't we write a CSS checker".** It is written, it
is 8,878 lines, and it is the cheapest thing in CI.

### T1 — resolved tokens + color math, no DOM · **every PR, inside the unit suite**

| Tool | Question it answers | Consumed by |
|---|---|---|
| `tools/contrast-audit.js` | does each theme's declared ink/surface matrix hit WCAG AA? | `test/unit/palette/theme-surface-aa.test.js` |
| `tools/composed-contrast.js` | does a surface a COMPONENT invents by stacking tints still pass? | `composed-surface-contrast.test.js` |
| `tools/cvd-audit.js` | do adjacent categoricals collapse under dichromacy? | `cvd-trio-floor.test.js` |
| `tools/derive-cat-ink.js`, `check-shadcn-bridge-contrast.js` | derived ink correctness | `theme-cat-ink.test.js`, `shadcn-bridge.test.js` |

**32 files, 642 tests, no browser.** This is exactly the "smart CSS checker for color
as compliance" the question proposes, already shipped and already gating.

### T2 — in-process DOM, no layout · **every PR, 84s**

The bulk of the 6,103-test unit suite: transformers, the markdown-it plugin kernel,
front-matter readers, the sanitizers, the split/fit *decision logic*.

The idiom worth naming, because it is the template for moving work down a tier:
`test/unit/core/overflow-probe.test.js` tests the overflow **decision** against a
hand-built fake section (`{ scrollHeight: 830, clientHeight: 700 }`). The *rule* is
unit-tested at T2 in milliseconds; only the *measurement* needs T3.

### T3 — real browser, computed style + geometry · **the expensive tier**

| Surface | Runs | Cost |
|---|---|---|
| `test:integration:pr` — 36 files under `parity/`, `export/`, `invariants/` | every PR | **7m43** (the long pole) |
| `docs` `check:overflow` — 4 viewports × converted routes × interaction states | every PR (docs-touching) | 1m41 |
| Studio Playwright `@smoke` | every PR (docs-touching) | 2m01 |
| `test:integration:nightly` — galleries, components, exemplars, mermaid, screenshot | nightly | 6.9m |
| `check:family-tiers` / `check:family-conformance` | nightly | (in the 6.9m job) |
| Studio Playwright full matrix + `@visual` | nightly | 29m |
| `preview-e2e` (playground gallery render) | nightly | 3.0m |
| `perf-nightly` (docs perf + engine bench + interaction ceilings) | nightly | 25m |
| `check-geometry-parity.js`, `check-css-values.js`, `check-overflow-corpus.js`, `check-chart-fit.js`, `check-viz-render.js` | **no cadence — on demand only** | — |
| `check-slide-contrast.js` as a FULL-corpus sweep (the per-PR test drives it over 3 surfaces of a 32-palette matrix) | **no cadence** | — |

### T4 — PDF bytes · **14 test cases**

Per `2026-08-16-render-format-cost-assessment.md` §4, genuinely PDF-only:
viewer semantics (`/PageMode`, `/Trans`), speaker notes as `/Annots`, selectable-text
and font-embedding round-trip, paper geometry, `/Lang`. Plus `pageCount()` as the
auto-split oracle in three gallery suites — which §3b showed is replaceable by counting
slide containers in the HTML sidecar.

Everything else that renders to `.pdf` asserts on the HTML sidecar and never opens the
PDF.

### T5 — pixels · **gates nothing**

| Tool | Role |
|---|---|
| `tools/golden-diff.mjs` | every PR; rasterizes only the goldens whose bytes moved, posts a before/after montage, **always exits 0** |
| `tools/pixel-check.js` | on-demand snapshot/diff harness |
| Playwright `@visual` snapshots | nightly only |

### Local hooks — the same tiers, before the remote

`lefthook.yml` runs T0 + T2 on every push (`lint`, `lint:deck:all`, `build:check`, the
full unit suite) and T3 only behind an opt-in flag (`LATTICE_FULL_PUSH=1`). One T4/T5
cost sits in **pre-commit**: `build-staged-pdfs.js` re-renders the PDF for every staged
deck markdown. That is a real browser render on the developer's critical path, traded
deliberately against a freshness gate that would have failed the commit instead.

### T6 — human / agent eyes

The QUALITY BAR, `engineering/visual-review.md`'s maker-checker fan-out, and the
export sign-off gate. No CI involvement, by design.

---

## 3. What a PR actually costs — measured

Never collected before (`2026-08-16` §8 lists it as the gap). Sampled from four
successful full-pipeline runs on `ci.yml`, 2026-08-17/18.

**Per full code PR: ~11 minutes wall, ~25 runner-minutes.**

| Job | Runner-min | On the critical path? |
|---|---:|---|
| `integration (node 22)` | **8.4** | **yes — 8m26, the long pole** |
| `docs-build` | 6.4 | no (parallel; vitest 2m47 + overflow guard 1m41 + astro 27s) |
| `golden-diff` | 3.5 | no (**1m23 of it is `fetch-depth: 0` checkout; the diff itself took 1s**) |
| `studio-smoke` | 3.2 | no |
| `unit (node 22)` | 1.8 | **yes — integration `needs: unit`** |
| `unit (node 24)` | 0.9 | no |
| `lint` (incl. `build:check`) | 0.85 | no |
| `changes` + `ci` gate | 0.4 | yes (20s + 4s) |

Critical path: `changes` 20s → `unit` 2m00 → `integration` 8m26 → gate 4s.

**A quarter of that is advisory by design.** The required merge gate is a single
context, `ci`, and its `needs` list is `[lint, unit, integration, docs-build]` — so
`golden-diff` (3.5) and `studio-smoke` (3.2) together, **6.7 runner-minutes or 27% of
the run**, report without blocking. Inside `docs-build`, `check:overflow` carries
`continue-on-error: true` for the same reason. That is deliberate and documented
(`2026-06-28-experience-gating-playwright.md` §3: a browser check becomes blocking only
after an observed nightly green streak, never on hope), and it is worth restating here
only because it means a quarter of per-PR CI spend buys information rather than
enforcement.

**Volume:** 81 `ci.yml` runs on 2026-08-17 (68 pull_request + 13 merge_group), 708
minutes of summed wall clock. At ~25 runner-minutes per full run that is on the order
of **1,900 runner-minutes a day for per-PR CI** against **~66 minutes a day for every
nightly combined**. Per-PR CI outweighs the whole nightly program by roughly 30×;
any optimization that does not touch the PR path is rounding error.

### 3a. Inside the integration tier — where the 8 minutes go

All 37 files in `test:integration:pr` timed **one at a time, serially, `CI=true`** (render
cache off, as CI runs it) on this sandbox. Serial totals, not wall clock.

| File | Serial |
|---|---:|
| `export/export-formats` | **257s** |
| `invariants/component-invariants` | **214s** |
| `export/html-player` | **197s** |
| `parity/content-clipped-pill` | 111s |
| `invariants/axe-a11y` | 62s |
| `invariants/slide-contrast` | 45s |
| `parity/chart-overflow-preserved` | 37s |
| `export/marp-kit-render` | 37s |
| `parity/chart-family` | 29s |
| … 28 more files | 283s combined |
| **Total serial** | **1,271s (21.2 min)** |

**Three files are 53% of the tier.** `export-formats` is expensive for a legitimate
reason — it renders `.pptx`, `.png` and `.zip`, the formats measured at 7–9× a PDF.

**The arithmetic that decides the job's wall clock.** `node --test` parallelizes across
FILES, not within one, at `availableParallelism` — 4 on this box and on a standard
GitHub runner. So the floor is `max(longest single file, total ÷ 4)`:

- today: `max(257, 1271/4 = 318)` = **318s** — the *sum* binds, not the longest file;
- the measured CI step is 7m43, i.e. ~1.5× that, which is the runner being slower plus
  per-file process boot.

This matters for which levers are real: **until the total serial work drops below 4×
the longest file, splitting a big file buys nothing.** Cutting total work is the lever.

### 3b. The scheduled tiers

| Scheduled workflow | Wall | Verdict |
|---|---:|---|
| `perf-nightly` | 25m | green |
| `studio-e2e-nightly` | 29–33m | **red 6 of 6 sampled nights** |
| `integration-nightly` | 6.9m | green |
| `preview-e2e-nightly` | 3.0m | green |
| `docs` (deploy on push to main) | 1.7m | green |
| `modulepreload-coverage-nightly` | 0.7m | green |

---

## 4. Why T3 cannot become T0/T1/T2

The proposal in the question is that positioning "can be calculated ... maybe there
are even libraries to do this". Three separate walls, in order of how quickly they
stop the idea:

1. **jsdom has no layout engine.** It parses HTML and implements the DOM API, but
   `getBoundingClientRect()` returns all zeros and `offsetHeight` is 0 — always, for
   every element. This repo already knows that and uses jsdom only for structure. So
   "read the HTML and CSS and compute the boxes" has no off-the-shelf implementation
   in the Node ecosystem; there is nothing to install.
2. **Flexbox/grid solvers (yoga-layout, taffy) are not CSS engines.** They solve a box
   tree from *already-resolved* style values. To feed one you would have to implement
   the cascade, custom-property substitution, container queries, and — the killer —
   **text shaping**: line breaking with the real font's metrics and features. Lattice's
   Fit Spine is a *text-measurement* system; a fit verdict without a shaper is a guess.
3. **Even if you built it, it would be a second source of truth.** HARD RULE #1 exists
   because two render paths drift. A layout engine that disagrees with Chromium by 2px
   would either fail honest slides or pass clipped ones, and the disagreement would be
   invisible until a human opened a PDF. The browser is not a testing convenience here
   — it *is* the specification of what the deck looks like.

The load-bearing evidence sits in the repo already: `docs/scripts/check-overflow.mjs`
says in its own header that "a pure static check would have MISSED" the CSS-grid
`minmax(auto,1fr)` overflow, because it only appeared after a pane switch. Geometry is
a runtime property of a laid-out tree, not a property of the stylesheet.

**So the honest framing:** the browser is the CSS checker. What can be cut is not the
oracle but **how many times we boot it and how much we ask it to do**.

---

## 5. Levers, ranked

Sizes are measured or arithmetic on measured figures; each says which.

| # | Lever | Size | Confidence |
|---|---|---|---|
| **A** | **Batch the component-invariant renders.** `component-invariants.test.js` spawns the emulator **61 times** — once per component — to lay out 61 independent one-slide decks that share identical front matter (`deckFromSample` differs only by palette). They are sections of one deck. **Measured:** one render of all 61 samples concatenated = **8.5s / 8.8s**; a single-component render averages **2.47s** over 6 samples, so the 61 individual renders cost **~150s**. The file itself measures 214s. **~141s of serial work removed, ~17× on the render step.** | **largest measured** | measured both arms |
| **B** | **Stop making `integration` wait on `unit`.** `needs: [changes, unit]` costs **~2m00 of critical path** (18% of the PR wall clock) and buys only "don't burn integration minutes when unit is broken". Runner-minutes are cheap relative to a human waiting. | ~2m wall/PR | measured |
| **C** | **Fix `golden-diff`'s checkout.** `fetch-depth: 0` costs **1m23** for a job whose work took **1s**. It needs one base commit, not all history: `fetch-depth: 1` plus an explicit `git fetch --depth=1 origin <base-sha>`, or a `blob:none` partial clone. | ~1.3 runner-min/PR | measured |
| **D** | **Converge the emulator's front-matter post-process into the shared kernel** (the prior note's L3). `deck-class-fm`, `deck-mode-fm` and `deck-logo` each boot a whole browser to assert a *string* — their headers say so — only because the emulator re-implements the reader (a HARD RULE #1 violation in place). Converging makes them T2 unit tests. | 3 full renders/PR | mechanism confirmed in the test headers |
| **E** | **`waitUntil: 'load'`** (the prior note's L2, still **UNVERIFIED**). ~1.7s per navigation, 1–3 navigations per render. | medium | measured size, unverified safety |
| **F** | **Give the unscheduled gates a cadence.** `overflow:check`, `geometry:check`, `css:values`, `check:chart-fit`, `check:render`, `build:galleries:check` and `build:bucket-galleries:check` are wired into **no workflow and no hook** — they run when someone remembers. `lefthook.yml`'s `pre-push-disabled` block already carries a correction saying so about the last two. A blessed baseline nothing evaluates is an assertion that rots (the same reasoning `integration-nightly.yml` already gives for the family gates). | correctness, not speed | verified by grepping every workflow + `lefthook.yml` |
| **G** | **`docs-build`'s vitest step is 2m47** across 236 test files — the second-largest single step in the pipeline and never profiled. | unknown | unmeasured |
| **H** | **Split `export-formats.test.js` (32 cases, 257s) by format.** Conditional on A: while total serial ÷ 4 (318s) exceeds the longest file (257s), the sum binds and splitting buys nothing. After A the sum is ~1,130s ÷ 4 = 283s, still above 257s — so H only pays once the total drops further. Listed so it is not mistaken for a free win. | conditional | arithmetic on measured figures |
| **I** | **Prefer the `setContent` T3 pattern where the claim is about the cascade.** `invariants/bookend-ink.test.js` runs its whole suite in **1.3s** — real Chromium, real computed colors — by injecting `dist/lattice.css` + the theme into synthetic markup with `page.setContent`, no emulator and no PDF. It is the cheapest T3 in the repo by two orders of magnitude. **Its limit is real and must be stated with it:** it bypasses the engine's transforms, so it can only carry claims about the CASCADE (does this token land on this surface), never about the PIPELINE (does the transform emit this markup). HARD RULE #23 — a claim names its surface — is what keeps the two apart. | pattern, not a one-off | measured |

Deliberately **not** proposed: switching tests or goldens to images, replacing the
browser render wholesale with the engine's in-process HTML, or rasterizing for review
at high DPI. All three were measured and rejected in `2026-08-16` §7.

---

## 6. Proposed cadence

The rule: **an assertion belongs at the cheapest tier that can make it, on the longest
cadence that still catches the change that would break it.**

**Every PR** — target: under 8 minutes wall.
- All of T0, T1, T2 (unchanged — they are 100s combined and catch the most).
- T3 only for claims a code change can actually break: split/fit triggers, overflow,
  contrast on the rendered slide, frame conformance, the export contracts — **with the
  render count cut by lever A**.
- T5's `golden-diff` stays (it is the reviewer's before/after and it gates nothing),
  with lever C.

**Nightly** — unchanged in scope; it is well-sized at ~65 minutes total.
- Fix the `studio-e2e-nightly` `e2e-ai` job (§7) so the workflow's color means
  something again.

**Weekly** — a tier that does not exist today, and is the right home for lever F:
`overflow:check` (185-render corpus sweep), `geometry:check`, `css:values`,
`check:chart-fit`, `check:render`, `cvd-audit --strict`, `quality:check`,
`bench:check`. Each is expensive, each guards a baseline that moves slowly, and each
today guards nothing on any schedule. Weekly with an auto-filed rolling issue matches
what the nightlies already do.

One more weekly candidate, and it is the strongest color answer available: run
`tools/check-slide-contrast.js` over the **whole corpus × every palette**. The per-PR
gate (`invariants/slide-contrast.test.js`) says in its own header what it does not
cover — "THREE surfaces, not the 32-palette matrix", four components on no gated
surface at all, one viewport. That is the right scope for a per-PR gate and the wrong
scope for the truth. The full sweep is exactly the kind of expensive, slow-moving,
high-value check a weekly tier exists for.

---

## 7. Found while measuring — not fixed here

- **`studio-e2e-nightly` has been red on 6 of 6 sampled nights.** The 29-minute `e2e`
  job passes; the 3-minute `e2e-ai` job fails on one case —
  `e2e/scenarios/ai-architect.spec.ts:56` "Architect per-finding AI fix edits the deck
  source and checkpoints the undo path", `expect(locator).toBeVisible()` /
  `element(s) not found`, failing identically on retry. A workflow that is red every
  night teaches everyone to ignore its color, which is the failure mode
  `2026-08-10-nightly-invalid-and-silent.md` already recorded once.

Pre-existing and off the path of this catalog, so logged rather than pulled into it
(HARD RULE #18).

---

## 8. What is not measured here

- **Lever A end-to-end.** The two render arms are measured (150s vs 8.7s); what is NOT
  measured is the suite after the change. Batching moves 61 slides into one document,
  so a slide that auto-splits adds sections and the suite must select its section by a
  marker rather than by "the only one", and one component that hangs now takes the
  batch down instead of itself. Both are tractable; neither is done.
- **Lever G.** The 2m47 vitest step was timed as a step and never profiled.
- **All per-file integration figures are this sandbox, run serially.** CI runs them
  4-way parallel on a slower box; the *ordering* should hold, the absolutes will not.
  The prior note's §7 warning applies unchanged: a serial saving of N removes roughly
  N ÷ parallelism of wall clock, and less on a saturated box.
- **Whether lever B is safe for the merge queue.** Un-gating `integration` means a
  broken `unit` no longer short-circuits it; the cost is runner-minutes on a run that
  was going to fail anyway, but the queue's behavior under it was not checked.
- **Fork PRs.** Every number here is same-repo; `golden-diff` already behaves
  differently on a fork (read-only token).
- **Anything about the SlideWright Tauri wrapper**, which shares the engine but not
  this CI.
