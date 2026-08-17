---
status: proposed
summary: P4 retire marp-cli — pivoted from a flaky pixel-regression gate to per-component semantic invariant testing
---

# P4 — retire marp-cli: parity → ~~regression~~ → component-invariant testing

**Status:** ~~design (pre-code), de-risked. The 2026-06-13 spike resolved the one
real technical risk (golden env-stability — §7.1) positively; only the §7.3
test-migration audit remains, and that's done during implementation. Ready to
build.~~ **PIVOTED 2026-06-13 — see §0.**

> **⚠️ PIVOT (2026-06-13) — this supersedes the pixel-regression thesis below.**
> Wiring the pixel-regression gate into CI surfaced *flaky cross-runner
> rasterization drift* (Skia's CPU-dispatched raster differs by GitHub runner CPU
> on fine vector + image content, ~0.4–2%, a *different* gallery each run — §A).
> That exposed the deeper problem: **post-marp, a self-golden pixel gate detects
> _change_, not _correctness_** — a golden blessed with a bug passes forever — and
> it fights machine physics to do even that. **We're pivoting from the pixel gate
> to per-component SEMANTIC INVARIANTS.** See **§0 — Pivot**. Everything from §2
> onward is preserved as the historical design + the still-valid env findings,
> but the "pixel regression is the CI gate" conclusion is retired.

## 0. Pivot (2026-06-13): pixel-regression gate → per-component semantic invariants

**Why.** `engine-parity` was an A/B test against an *external* truth (marp): marp
*defined* correct, and we proved the owned engine matched it — real value during
the migration. The pixel **regression** gate this doc proposed is a different,
weaker thing: it compares each gallery to *a previously-blessed render of itself*.
That detects *change*, not *correctness* — a golden blessed with a bug passes
forever — and it turned out to fight machine physics: across GitHub's
heterogeneous runners, Skia's CPU-dispatched rasterization is not bit-identical,
so the same code drifts ~0.4–2% on a *different* gallery each CI run (§A). Every
mitigation we tried (per-bucket tolerance, advisory mode, deterministic-raster
flags, inline montages) was tax to make a low-value signal not-flaky. When you
spend that much defending a gate, the gate is wrong.

**The model.** Each component carries its own idea of correctness as **semantic
invariants** — render the component's example through `lib/engine::render()` into
a real headless-Chrome DOM (the exact seam `test/integration/parity/color-parity.test.js`
already uses) and assert on *meaning*, not pixels. Three layers:

| Layer | Source | Coverage | Authoring |
|---|---|---|---|
| **1 · Contract** | manifest `slots` (CSS selector + `required`), `_class` | every component, **auto-derived** | none — a new component is covered free |
| **2 · Universal** | every rendered slide | heading WCAG contrast + no overflow (built); computed colours resolve to palette tokens (*phase-2*) | none — runs on all |
| **3 · Semantic** | hand-authored, high-value few | funnel widths ∝ values, radar N series → N polygons, big-number is the largest type | opt-in, where a component has a distinctive truth |

These assert *logical* values (selectors, ratios, contrast) — **deterministic and
machine-independent**, so the cross-runner flakiness simply doesn't exist — and
need no PDF/poppler (HTML + `getComputedStyle` only), so they're *cheaper* than
today's page-count tier.

**Plumbing.** One new `test/helpers/semantic-render.js` (wraps `lib/engine::render`
+ Puppeteer, mirroring `render.js`). No render-pipeline changes; no new deps.

**What changes.**
- **Retired:** the pixel-regression **CI gate**. `npm run regress` survives only
  as a **local** spot-check tool (handy for a manual visual diff), never wired
  into CI. `engine-parity` still dies with marp (Step 3) as planned.
- **Kept:** committed gallery goldens (as human-review artifacts) and **`golden-diff`**
  — the before/after reviewer comment, now with **inline images** (#239). It
  diffs two *committed* PDFs on *one* runner, so it is **not** subject to the
  cross-runner flakiness; it's a review aid, not a gate.
- **New CI visual-correctness gate:** the semantic-invariant suite (layers 1–2
  across all ~54 components, plus layer-3 where it earns it).

**Phasing.** (1) `semantic-render.js` + layers 1–2 across the corpus, wired as the
CI gate. (2) layer-3 semantic invariants for the components that have a
distinctive truth (charts especially). (3) Step 3: delete marp + `engine-parity`;
the invariant suite is the sole visual-correctness gate.

### 0a. The cross-machine band is far wider than "0.4–2%" on the DECK scope (2026-08-16)

The ~0.4–2% above was measured on the **gallery** scope. The deck scope (added
later, #1379) behaves much worse, and anyone triaging a red local run needs the
real numbers before deciding what to re-bless. A full `--scope decks` run on the
cloud sandbox — a machine that blessed none of these goldens — against a tree
whose only change was a PDF-timestamp pin (no pixel could move):

| worst-page drift | decks | |
|---|---:|---|
| clean | 14 | |
| < 2% | 124 | the documented band |
| 2–5% | 24 | |
| **> 5%** | **29** | **up to 64.1%**, and one **page-count flip** |

`examples/portrait-roadmap` renders **5 pages here against the golden's 8** —
auto-split is height-driven, so once font metrics differ by a hair the split
decisions flip and the whole deck re-paginates. A percentage cannot distinguish
that from a real regression.

**Three controls establish that every bit of this is environmental**, run in a
worktree at `94d043d` (before that day's merges) — the drift is *identical to two
decimals*, which also rules out the random hand-drawn diagram seed #1677 pinned,
since randomness would vary run to run:

| deck | on the branch | at `94d043d` |
|---|---:|---:|
| `test/integration/baseline-decks/gallery` | 18.13% | **18.13%** |
| `exemplars/government-public/rfp-response` | 13.13% | **13.13%** |
| `examples/state-chart` | 13.22% | **13.22%** |

And the confirming case: `examples/sketch`, the one golden re-blessed *in this
environment* (#1679), is the deck that comes back **clean**.

**So "worst > 5% ⇒ probably a real change" is wrong here** — following it would
have re-blessed 29 decks and baked one sandbox's rasterization and pagination
into goldens the whole team renders against. **A drift number is evidence of
nothing until it is reproduced at a commit that predates the suspected cause.**
Run that control first; open the montage second; re-bless only what survives
both.

**PR #239** is repurposed to land this pivot: it drops the `regression` CI job,
keeps `golden-diff` (inline) + the shared montage helpers, records this pivot, and
seeds the invariant suite. The sections below are retained as the historical
design and the still-valid environment findings (§7.1, §A).

**Build status (2026-06-13, branch `claude/p4-component-invariants`).** Phase 1+2
landed and GREEN across all **53 components / 197 assertions**:
`test/helpers/semantic-render.js` renders each component's manifest `sample`
through the cached emulator (its `.html` sidecar = production CSS+DOM, no cascade
duplication) and `test/integration/invariants/component-invariants.test.js`
asserts layer 1 (required slots resolve) + layer 2 (no overflow; heading contrast
≥ WCAG AA) + layer 3 (`component-invariants.layer3.js`). It runs in the
integration tier, so it already gates via the required `ci` check. Two findings
the corpus pass forced, worth remembering:
- **Manifest slot selectors are the AUTHORING contract, written against the slide
  `<section>` root** — normalise a leading `section` → `:scope` (and bare
  selectors → descendant) per comma-group, or a `section > p, section > ul` clause
  leaks unscoped and false-fails.
- **TRANSFORM components consume their authored markup** (a chart's `ul > li` →
  `.chart-body` svg/HTML frame; glossary → `<table>`; compare-code → code panels;
  featured → `.feat-card`). Layer-1's slot check is skipped for them (the `TRANSFORM`
  set) and layer-3 asserts the rendered contract instead. (Long-term, making those
  manifests' slot selectors rendered-accurate — as roadmap/state-chart/diagram
  already are — would let layer-1 cover them automatically; deferred since the
  manifests also drive the docs site's authoring guidance.)

**Phase-2 — NOT yet built (the §0 model table lists these as the target; today's
suite does not implement them):**
- The layer-2 **palette-token-resolution** check (every computed colour must
  resolve to a theme token — HARD RULE 3). Layer 2 today is **overflow + heading
  contrast only**; body-text contrast and the token check are unbuilt.
- **Richer layer-3** — current layer-3 is the "the transform produced its frame"
  *floor* (`.chart-body`/`table`/`pre`/`.feat-card` exists). The valuable per-
  component truths are TODO: funnel stage count == authored items + monotonic
  widths; kpi/big-number rendered count == source count + big-number is the
  largest type; piechart/radar legend entries == series; state-chart node/edge
  counts == authored; roadmap cell-states == authored markers.
- **Manifest-slot accuracy:** the `TRANSFORM` set is a *test-side bridge*. Some
  chart manifests' slot selectors describe consumed **authoring input**, others
  (`roadmap`, `state-chart`, `diagram`) describe **rendered output** — and
  `roadmap`'s `table` slot passes only because the sample is `status` mode (the
  `horizons` modifier transposes the table into `.horizon-card`s and would
  false-fail). The durable fix is rendered-accurate slot selectors everywhere
  (what `diagram` does), shrinking `TRANSFORM` toward zero and improving the docs
  site — deferred since manifests also drive authoring guidance.

Then Step 3 (delete marp + `engine-parity`, making this the sole gate).

## 1. Goal

Retire `@marp-team/marp-cli` — the last marp dependency in our tree (Scope 1 of
`2026-06-10-marp-replacement-proposal.md`). The shipped package becomes
marp-free: `npm install @slidewright/lattice` stops pulling marp.

**Out of scope:** marp-vscode (the editor *extension*, Scope 2). The VS Code
preview rides on marp-vscode + `markdown.marp.themes` + `lattice-runtime.js` +
`lattice.css` — **none of which is the `marp-cli` npm package** — so retiring
marp-cli leaves VS Code authoring/preview untouched. Lattice stays a **superset
of marp authoring** (marp warns on unknown front-matter keys but renders), which
is exactly what keeps the marp-vscode "passenger" model working.

## 2. The core shift: parity → regression

Today the gate renders every deck **twice** (lattice-engine + marp) and asserts
they pixel-match. marp is the *external oracle* — "correct" = "matches an
independent renderer." That gate's job was to catch engine↔marp drift **during
the migration** (e.g. the `<h2 id>` compare-code bug). Once marp is gone, the
engine **is** canonical; "diverges from marp" stops being a meaningful concept.

So the gate's nature changes from **parity** (do two renderers agree?) to
**regression** (did our render change from the blessed version?). For a
single-renderer world that is the correct model, not a downgrade.

## 3. The two "…-then-retire" sequences (how we keep the floor objective)

Both exploit that **today the parity gate is green**, so our committed renders
already equal what marp produces — i.e. they're marp-validated *right now*.

1. **Bless-then-retire (goldens).** Freeze today's renders as the golden set
   *while marp still exists*. The baseline is marp-correct by construction. Then
   drop marp. Future re-blesses start from a marp-verified floor.
2. **Benchmark-then-retire (metrics).** The `npm run bench` engine-vs-marp
   numbers need marp-core; Option A removes it. So **record the final
   engine-vs-marp benchmark + the footprint delta as a dated measurement** in
   §A *before* retiring, then repoint the ongoing benchmark to
   **engine-over-time** (a speed-regression signal, not a vs-marp claim — that
   claim is already made and recorded).

## 4. The gate + the bless flow (GitHub-native, local-bless)

The flow is deliberately simple — **no bot writes to the branch, no custom
approval trigger.** It maps to mechanics that already exist.

**Goldens — reuse the committed gallery PDFs.** We already commit
`*.gallery.{light,dark}.pdf` for every component + bucket (65 each). **Those are
the goldens.** No new image tree to bloat the repo. The gate compares them by
**rasterizing to pixels and diffing with tolerance — never by PDF bytes** (PDFs
aren't byte-reproducible; pixels are — see the §7.1 spike).

**`bless` is LOCAL — and is already how Lattice works.** When you change a
layout you run `npm run bless [-- <deck>]` (re-render the affected galleries =
new golden PDFs) and commit them *in the same PR*. The pre-commit hook already
auto-rebuilds staged decks, so this is mostly today's flow, named for intent.

**The PR flow:**

1. Author changes a layout, blesses locally, commits the updated golden PDFs in
   the PR branch.
2. **CI regression gate** (`tools/engine-parity.mjs` repurposed): renders fresh,
   asserts `render == the committed golden`. Green = the author blessed
   correctly; **Red = unblessed drift** — they changed CSS/source but a deck's
   committed PDF is stale. This is the safety net: nothing reaches main with a
   render that doesn't match its committed golden.
3. **CI before/after job:** diffs the PR's golden PDFs against main's, posts the
   result on the PR — **inline PNG previews** of the changed slides in a comment
   + the full **diff-montage PDF (changed slides only, before │ after │ overlay)
   as a downloadable artifact** (extends the existing `engine-parity-diffs`
   upload). The diff count == changed-slide count — a handful for a targeted
   change, dozens-to-hundreds for a shared-CSS change — so a montage beats N
   loose images. The author/reviewer flips through one doc.
4. Human looks at the before/after, then merges.

**Who "blesses" / approves, by shop size:**

- **Solo (today):** committing the goldens + reading the CI before/after PDF
  **is** the sign-off. (GitHub blocks self-approval, so a *required*-review rule
  would only block a solo author — don't enable it yet.) The gate (render ==
  golden) still enforces no unblessed drift.
- **Team (later):** flip on branch-protection "require 1 approving review" — a
  **one-line GitHub setting, no code change.** An intended visual change then
  needs a second contributor to read the before/after PDF and approve. The CI
  comment is already the review surface.

**Automated vs human:** the *re-render* is automated (`bless`); the *"is the new
look correct?"* judgment stays human (reading the before/after). No tool can
answer "is it good," only "did it change" — that split is the point.

## 5. What changes in the tree (migration inventory)

- `package.json`: remove `@marp-team/marp-cli` from `dependencies`. (Option A:
  nothing added back — no marp anywhere.)
- `tools/engine-parity.mjs` → the regression gate (diff a fresh render vs the
  committed golden PDF; add `--bless` to overwrite goldens). Rename to reflect
  "regression," not "parity."
- The marp render path retires: `test/helpers/render.js` + the ~6
  `test/integration/parity/*.test.js` + `test/integration/galleries/marp.gallery.test.js`
  drop their `npx marp` spawns. The *engine* assertions stay (now golden-backed);
  the *marp comparison* assertions are removed.
- `test/benchmark/engine-bench.mjs`: record the final marp comparison (§3.2 /
  §A), then strip the `@marp-team/marp-core` import; the ongoing bench tracks
  engine-over-time.
- 2 unit tests import marp-core (`test/unit/engine/engine.test.js`,
  `test/unit/parsing/marp-plugins.test.js`) — re-point to golden/engine-only
  assertions or delete the marp-comparison cases.
- `.github/workflows/ci.yml`: the `engine-parity` job → the regression gate +
  the before/after-PDF comment job. **No bless-on-approval / bot-commit job** —
  bless is local.
- `marp.config.js` **stays** (shipped for marp-vscode + BYO-marp-cli authors).
  The marp-vscode compatibility shims in CSS (`scaffold.css`, the
  `:is(pre, marp-pre)` carve-outs, twemoji `:not(.emoji)`) **stay** — the
  documented Scope-1 tax.

## 6. Metrics (capture before retiring; recorded in §A)

- **Footprint delta — the P4 win.** A clean `npm install` *with* vs *without*
  marp-cli: MB removed from `node_modules`, packages removed, install-time delta.
  Honest delta (puppeteer + markdown-it are shared and stay), not the raw 42 MB.
- **Final engine-vs-marp benchmark** (`npm run bench`) — dated, the last word on
  "we were faster than marp."
- **Ongoing:** engine self-speed (the bench, marp stripped) as a perf-regression
  signal.

## 7. Open questions

### Resolved by the 2026-06-13 spike

1. **Golden env-stability — RESOLVED (positive).** Measured directly: rendered
   `featured`, `kpi`, `compare-code`, `big-number` galleries fresh in a *new*
   sandbox session and diffed against the goldens committed in a *prior* session.
   Result: **0 pixels differ beyond tolerance** (ImageMagick `-fuzz 3%`, ≈ the
   gate's channel-delta-8) on the worst page of all four. Cross-session pixel
   output is deterministic, so locally-blessed goldens are stable enough for the
   gate. The "bless in CI" fallback is **not needed**. (Embedded fonts + pinned
   Chromium + the 0.05% tolerance carry it, as predicted.)

   **→ Design rule this forces: the gate compares rasterized *pixels* with
   tolerance, NEVER PDF *bytes*.** The same spike showed the PDFs are *not*
   byte-reproducible (md5 differs every render — timestamps, object/font-subset
   ordering), so a byte-diff would false-fail 100% of the time. Pixels are
   deterministic; bytes are not. `engine-parity.mjs` already rasterizes, so this
   is the natural path — but it's the trap a naive "diff the committed PDF" gate
   would fall into.

2. **PDF vs PNG goldens — DECIDED: reuse the committed PDFs.** Since pixels are
   deterministic but PDF bytes aren't, the gate rasterizes the committed PDF
   on-the-fly and pixel-diffs (tolerance). PDFs are already committed for human
   review; their byte-churn on rebuild is the pre-existing status quo; a separate
   PNG tree would only buy byte-stable goldens we don't gate on anyway (we need
   AA tolerance regardless). No new image tree.

### Still open

3. **Test-migration audit.** ~10 files lose their marp comparison. Confirm none
   asserts something *only* a second renderer can before deleting.

*(The earlier "bless-trigger security" question is gone — bless is local, so CI
never writes to the branch and there's nothing to gate.)*


## 8. Recommendation

Option A (full excision, regression gate) with **bless-then-retire** +
**benchmark-then-retire**, and the **local-bless / CI-posts-before-after-PDF**
flow above. It delivers the marp-free shipped package, keeps a strict CI gate
(render == committed golden), makes intended changes a commit-the-goldens flow
the repo already half-runs, and scales from solo (bless = sign-off) to team
(add required-review, a setting). Validate §7.1 first; it's the only real risk.

## A. Recorded measurements (filled at implementation, pre-retirement)

- **Footprint delta (2026-06-14).** `@marp-team/*` in `node_modules` measured
  **42M** before removal: `marp-cli` 40M, `marp-core` 736K, `marpit` 348K (+
  `marpit-svg-polyfill`) — **4 packages**. After dropping `@marp-team/marp-cli`
  from `dependencies`, a clean `npm ci` from the lockfile installs **zero**
  `@marp-team` packages — confirmed `ls node_modules/@marp-team` → absent. The
  honest install delta is ~42M off a consumer's `npm install @slidewright/lattice`
  (puppeteer + markdown-it are shared and stay). marp-core was transitive-only via
  marp-cli, so it left with it; the docs playground (which had used marp-core for
  the now-removed `?engine=marp` A/B) renders solely through the owned engine, and
  its bundle dropped 4.2M → 1.8M (−2.4M).
- **Final `npm run bench` engine-vs-marp table (2026-06-14, while marp-core was
  still installed — the last word on "we were faster than marp"):**

  | dataset | slides | marp ms | lattice ms | ratio | marp sl/s | lattice sl/s |
  |---|---:|---:|---:|---:|---:|---:|
  | normal (jargon) | 79 | 207.7 | 39.3 | **0.19×** | 380 | 2010 |
  | charts | 14 | 192.3 | 34.7 | **0.18×** | 73 | 404 |
  | stress (jargon ×6) | 469 | 407.8 | 129.1 | **0.32×** | 1150 | 3634 |

  The owned engine ran **3–5× faster** than marp-core across the corpus. The bench
  is now repointed to engine-over-time (marp stripped) as a perf-regression signal.
- **Date / commit of the marp-validated golden freeze — 2026-06-13, on
  `claude/p4-regression-gate-retire-marp-grqv14` (rebased onto `main`
  `860c086`).** All 65 galleries × {light,dark} were re-blessed with the
  current self-hosted font set (post-#226, which added `outfit-300/500/600` +
  `shantell-500`) — the prior goldens (#213) predated it and read as ~5.8% drift
  on text. `npm run parity` was green (engine == marp) at the freeze, so the
  frozen goldens are marp-validated. The regression gate (`npm run regress`) is
  green across the full corpus against this freeze.

### Step 1 — done (2026-06-13)

The regression gate ships: `tools/regression-gate.mjs` (`npm run regress`,
`npm run bless`), reusing `pixel-check.js`'s comparator (now `pixelDiff` +
a `fuzz` tolerance), `build-galleries.js` `injectDark`, and the builders as the
bless primitive. Verified: (a) full corpus GREEN vs the re-blessed goldens;
(b) a CSS tweak without bless goes RED, GREEN after revert/bless; (c) `npm run
parity` agrees (both all-green) — the gate is as strict as the marp gate.
**Gotcha worth keeping:** the emulator resolves a deck's relative asset paths
(`![bg](sample.svg)`, logos) against the OUTPUT pdf's directory, so the gate
must render the fresh candidate INTO the gallery's own dir or every image slide
false-fails blank. **Steps 2 (CI) and 3 (retire marp) remain.**

### Step 2 — done (2026-06-13)

The gate is wired into CI as a **required check**, plus the reviewer's
before/after surface. The gate runs **full-corpus per-PR** (not
affected-scoped). This is a deliberate maintainer decision that **overrides §D
of `2026-06-13-gate-strategy-change-detection.md`**, which had recommended a
scoped-per-PR + full-corpus-nightly hybrid: in practice the maintainer's
sessions are opportunistic and cross-cutting, so almost every PR carries an L3
change that a scoped run would escalate to full anyway — scoping would buy
little while risking the bucket-vs-component gallery-name collision that doc's
checker addendum flagged. Scoping (and the merge-queue + render caching that
would serialize the parallel-session cost) is deferred until that cost is
measured pain.

- **`.github/workflows/ci.yml`** — two jobs. `regression` (gating, in the `ci`
  required aggregator, `code`-tier): Chromium + poppler + emoji font, runs
  `npm run regress`, uploads the drift montage on RED. `golden-diff`
  (**non-gating**, PR-only, `code`-tier): no Chromium — rasterizes the committed
  goldens, diffs THIS PR's against `base.sha`, and posts/updates a sticky PR
  comment via `actions/github-script` (`pull-requests: write`, `continue-on-error`
  so a read-only fork token can't fail the run) with the before│after│overlay
  montages embedded **inline** (fulfilling §4's "inline PNG previews"). Inline
  comment images need a GitHub-served URL, so a `publish` step (`contents: write`,
  same-repo only) pushes the PNGs to the orphan **`ci-drift-images`** branch (a
  never-merged image store, `pr-<num>/<sha>/…`) and the comment links
  `raw.githubusercontent.com` URLs; the full set also uploads as the
  `golden-diff-changes` artifact (and is the fork-PR fallback). `engine-parity`
  keeps running in parallel — removed in Step 3.
- **`tools/golden-diff.mjs` (new)** — the before/after computer. `git diff` is
  only the cheap candidate filter; the pixel-diff (gate tolerance: fuzz 3% /
  0.05%) is the truth, so PDF byte-churn from a rebuild reads as "no visual
  change". Emits `summary.md` (comment body) + `report.json` (incl. `inlineMontages`,
  capped at 8, most-changed gallery first) + per-slide `montages/*.png` + `changes.pdf`.
- **`tools/pixel-check.js`** — extracted `montageTriptych` + `pngsToPdf`
  (HARD RULE 15); `regression-gate.mjs`'s `buildMontage` now calls them, and the
  gate's per-page montages gained a `deck · mood · slide N` caption.
- **CI gotcha encoded:** IM6's default `policy.xml` blocks the PDF coder, which
  would break `convert montages… .pdf`; both jobs relax it
  (`rights="none" pattern="PDF"` → `read|write`).
- No `package.json` script for `golden-diff` (it's CI-only) — avoids re-staling
  the emulator bundle (which inlines `package.json`); `capabilities.md` indexes
  it from the tool header.

**Cross-machine golden stability — the §7.1 gap, found on the gate's CI runs (the
key Step-2 finding).** The gate ran green on every sandbox machine but RED in CI
— and the drift was **flaky across runners**: run 1 drifted the `diagram` bucket
(0.45% / 4pg); run 2 had `diagram` green but `imagery` — a *flat* bucket — drift
**2.01%** on 1 page. Excluded every boring cause: goldens not stale (green across
sandbox machines), fonts correctly embedded (Playfair/Outfit/JetBrainsMono, no
fallback), Chromium identical (both bless + CI use Chrome-for-Testing
`131.0.6778.204`). The residue is **Skia's CPU-dispatched rasterization differing
by runner CPU** — sub-pixel AA on fine vector *and* image content, intermittently
(a different gallery each run, on GitHub's heterogeneous runners). The §7.1 spike
measured "0px cross-*session*" but only same-machine-class; it never tested
across runner CPUs. **This is not bucket-localized, so per-bucket tolerance is
whack-a-mole with an unknown, flaky ceiling** (the `FAIL_FRACTION_MERMAID = 1%`
floor for chart+diagram fixed `diagram` but `imagery` then surfaced at 2%).

**Resolution (maintainer decision): the regression gate is ADVISORY in Step 2 —
it runs and uploads its drift montage on every code PR, but is NOT in the
required `ci` gate.** No coverage is lost: **`engine-parity` is still the hard
visual gate throughout Step 2**, so this gate only needs to *prove itself* in
advisory mode. **Step 3 owns the cross-runner determinism fix** — pin Skia off
its CPU-feature path with deterministic raster flags (`--disable-skia-runtime-opts`
+ `--font-render-hinting=none` + `--disable-lcd-text` + `--force-color-profile=srgb`;
spot-tested a no-op on the sandbox, so likely no re-bless), validated across
several CI runs — and only then promotes `regression` into the required `ci`
gate, as `engine-parity` is removed. The `FAIL_FRACTION_MERMAID` floor stays as a
partial mitigation that keeps the advisory signal cleaner meanwhile. Considered
and rejected for Step 2: a high global tolerance (~3–4%) — loosens the gate
broadly against a flaky ceiling; and baking the raster flags in *now* — it
changes the *product's* render path and needs multi-run CI validation, which
belongs in the focused Step-3 effort, not bolted onto Step 2. **Step 3 (retire
marp + harden + promote the gate) remains.**

## 9. Build handoff — START HERE (for the implementing session)

**State on arrival (2026-06-13):** P1 (lib/engine), P2 (emulator on lib/engine,
parseSlide deleted), P5 (owned CSS emitter, iOS-validated) are all merged on
`main`. This note's design + the §7.1 spike are merged. **Nothing in this build
has started.** `@marp-team/marp-cli` is still a runtime `dependency`; the
marp-parity gate (`npm run parity` → `tools/engine-parity.mjs`, CI job
`engine-parity`) is still live and green.

**Goal:** ship the regression gate, then retire `@marp-team/marp-cli` so the
installed package is marp-free. **marp-vscode stays** (Scope 2 — the VS Code
preview; untouched).

**Sandbox:** read CLAUDE.md § "Cloud sandbox" first. Renders need `CHROME_PATH`
(SessionStart hook exports it; re-export if you see "no suitable browser").

**Decisions already locked — do NOT relitigate (see §2–§8):**
- Gate is **regression** (fresh render vs committed golden), not parity.
- Compare **rasterized pixels with tolerance, NEVER PDF bytes** (PDFs byte-churn
  from timestamps; pixels are deterministic — §7.1 proved 0 px drift cross-session).
- Goldens = the **committed gallery PDFs** (reuse; no PNG tree).
- **bless is LOCAL** (rebuild + commit the PDF); CI never writes goldens.
- Review = **CI posts before/after** (diff-montage PDF artifact + summary comment);
  a human looks before merge (solo: bless = sign-off; team: turn on
  branch-protection required-review — a setting, no code).
- **bless-then-retire** + **benchmark-then-retire**: freeze marp-validated goldens
  and record the final `npm run bench` + footprint numbers WHILE marp still
  exists, then remove marp.

**Reuse — HARD RULE 15, do not reinvent:**
- `tools/pixel-check.js` — its two-stage comparator (byte → pdftoppm + ImageMagick
  `compare` per page; "0 changed pixels = OK, byte drift is timestamp noise"). The
  comparator to lift/share.
- `tools/engine-parity.mjs` — `galleryDecks()` (the corpus), `FAIL_FRACTION`
  (0.05%), the rasterize/diff patterns.
- `tools/build-galleries.js --only <name>` — rebuild one gallery (light+dark) =
  the bless primitive. (`injectDark` lives here for the dark variant.)
- `tools/rasterize-for-review.sh --overview` — contact sheet for the montage.

**Build order (one PR per step):**

*Step 1 — regression gate (marp stays as the safety net).*
- `tools/regression-gate.mjs` (or extend build-galleries): per gallery (light +
  dark) render fresh to a tmp path, `pixelDiff` vs the committed golden PDF, fail
  on any page over tolerance. Flags: `--only`, `--bless` (→ build-galleries).
- **Verify three things:** (a) full corpus is GREEN (committed goldens already ==
  fresh renders; §7.1 confirmed 4 — do all 65×2); (b) it goes RED when you tweak a
  layout's CSS without blessing (proves it catches drift), then green after
  `--bless`; (c) it AGREES with `npm run parity` across the corpus (same pass/fail
  set) — this proves the regression gate is as strict as the marp gate before we
  drop marp.
- If the full corpus is NOT all green on arrival, the stale goldens must be
  re-blessed first (that's the "freeze marp-validated goldens" step).

*Step 2 — CI.* Add the gate to `.github/workflows/ci.yml` (model on the existing
`engine-parity` job). On drift: build the before/after diff-montage PDF, upload as
an artifact, post a summary comment ("N slides drifted in {decks}"). Keep the marp
`engine-parity` job running in parallel for now.

*Step 3 — retire marp (LAST, only once 1+2 are trusted).*
- First **record §A metrics:** `npm run bench` engine-vs-marp table + a clean
  `npm install` footprint delta (with vs without marp-cli). And §7.3 audit:
  confirm no marp-using test asserts something only a second renderer can.
- Remove `@marp-team/marp-cli` from `package.json` `dependencies`. Strip marp from:
  `test/helpers/render.js`, `test/integration/parity/*.test.js`,
  `test/integration/galleries/marp.gallery.test.js`,
  `test/benchmark/engine-bench.mjs` (record-then-strip),
  `test/unit/engine/engine.test.js`, `test/unit/parsing/marp-plugins.test.js`.
  Remove the marp `engine-parity` CI job.
- **KEEP:** `marp.config.js` (shipped for marp-vscode + BYO-marp-cli authors) and
  the marp-vscode CSS shims (`scaffold.css`, `:is(pre, marp-pre)`, twemoji
  `:not(.emoji)`) — the documented Scope-1 tax.
- Update CHANGELOG (lead `**Breaking:**` — consumers rendering via our marp.config
  now bring their own marp-cli), `engineering/capabilities.md`, and §A here.

**Done when:** the regression gate is the CI visual gate, `@marp-team/marp-cli` is
out of `dependencies`, `npm install @slidewright/lattice` is marp-free, every gate
is green, and §A is filled.
