---
status: in-progress
summary: Make the live Playground filmstrip's per-keystroke render cost sub-linear in deck size. A per-stage trace (instrumented on the real render path, 6x CPU) corrected the initial premise: the markdown TRANSFORM is NOT the bottleneck (~26ms on 50 slides, flat, under the 50ms heavy backstop) and the __latticeFit reflow is minor (~8ms). The two real costs are the transform (~26ms) and the whole-deck DOMPurify SANITIZE (~28ms), both whole-deck and growing with slide count; together they push a big-deck render past the frame scheduler's 50ms heavy backstop into the 120ms-coalesce regime. STEP 1 (SHIPPED): incremental sanitize — sanitize only changed sections, reuse cached output for the rest (byte-identical, locked by deck-preview.sanitize-cache.test.ts). Measured 50-slide/6x keystroke->paint 236ms -> 161ms (-32%), scaling with deck size; small docs-layer change. STEP 2 (DEFERRED): an incremental TRANSFORM cache in the engine kernel would cut the remaining ~26ms but is a large blast-radius change (property test + adversarial trio) — not justified by the residual at current deck sizes; revisit for 100+ slide decks / slower devices. Scoped fit DROPPED (fit is ~8ms). Pagination decision (single-owner engine, NO dual engine+CSS reconciliation) retained from the adversarial trio below. Targets the Playground filmstrip only — the Studio is already single-slide/incremental.
---

# Incremental per-slide render cache (live preview) — design

**Status:** step 1 shipped; step 2 deferred. **Date:** 2026-07-15.
**Follows:** `2026-07-15-frame-aligned-preview-render.md`,
`2026-07-15-playground-frame-loop-decouple.md` (the frame-loop work that fixed
*when* we render; this fixes *how much each render costs*).

## Problem — and a measurement correction

The frame-loop work removed the 220 ms typing debounce, but big-deck
keystroke→paint stayed high (50-slide/6× ≈ 236 ms). The **initial premise was
wrong** and is corrected here so the record doesn't mislead. The first pass
attributed the cost to the markdown transform ("~227 ms, 75%") — but that number
was keystroke→paint *latency* mislabeled as compute. A per-stage trace,
instrumented on the **real** render path at 6× CPU, gives the truth:

| stage (50-slide keystroke, 6×) | ms |
|---|---|
| transform (`PG.render`, whole deck) | **26** |
| **sanitize (DOMPurify, whole deck)** | **28** |
| fit (`__latticeFit`) | 8 |
| section split + DOM patch | ~1 |
| **render sum** | **63** |

Findings: the transform is ~26 ms and **flat** across deck sizes (13 ms at 10
slides → 26 ms at 50) — it never crosses the scheduler's 50 ms "heavy" backstop
by itself. `__latticeFit` is minor (8 ms) — **scoped fit is a non-issue.** The
two real costs are the **transform** and the **whole-deck DOMPurify sanitize**,
roughly equal, *both* whole-deck, *both* growing with slide count. Their sum
(63 ms) crosses the 50 ms backstop → the render is classified heavy → coalesced
behind a 120 ms timer. That regime jump is the big-deck latency.

## Goal

Get the per-keystroke render under the 50 ms heavy backstop so a big-deck edit
stays in the cheap next-frame regime — by making the whole-deck work incremental
(process only the edited section, reuse cached output for the rest).

## What shipped (step 1) and what's deferred (step 2)

- **Step 1 — incremental sanitize (SHIPPED).** `renderDeck` splits the raw engine
  HTML per section and runs DOMPurify only on sections whose raw HTML changed,
  reusing the prior render's sanitized output for the rest (cache in `state`).
  Byte-identical to whole-deck sanitize (sections are independent; verified over
  40 real decks and locked by `deck-preview.sanitize-cache.test.ts`). This alone
  drops sanitize 28 → ~1 ms, taking the render to ~36 ms (< 50 ms → cheap regime).
  **Measured 50-slide/6× keystroke→paint 236 → 161 ms (−32%)**, scaling with deck
  size; small decks unchanged. A docs-layer change, no kernel/export impact.
- **Step 2 — incremental transform cache (DEFERRED).** The transform (~26 ms) is
  the remaining deck-size-dependent term. Caching it per slide (the deck-AST design
  below) would cut it to ~5 ms — but it's a large kernel change (byte-identical
  property test + the full adversarial trio) and the residual it buys at 50 slides
  is ~34 ms, on top of a render already in the cheap regime after step 1. Not
  justified at current deck sizes; revisit if 100+ slide decks or slower devices
  push the transform alone over the backstop. The design is retained below as the
  blueprint for when it's warranted.
- **Scoped fit — DROPPED** (fit is ~8 ms).

## [Deferred — step 2 blueprint] Make the per-render cost sub-linear in deck size

Re-transform only the edited slide(s), reuse cached HTML for the rest.

## What the render pipeline actually couples across slides (investigated)

Three parallel source audits established the correctness map:

- **Auto-split never runs live** — it is export-only (`auto-split.js`, called
  only from `lattice-emulator.js`). So `1 source-slide → 1 rendered-section`
  holds in the preview; the measured density-resplit that would break the
  mapping is not a preview concern.
- **Boundaries are already solved by the kernel's own source-of-truth:**
  `lib/core/section-source-split.js` `splitSourceToSections` recovers per-slide
  source aligned 1:1 with the engine's real top-level `hr` tokens — via
  `bakeSplits`, so it handles every thematic-break form, the setext `Foo\n---`
  → H2 trap, fenced code, AND `split: headings` mode (h1/h2 separators). We
  REUSE this; we do not write a new segmenter (HARD RULE #1).
- **Pagination is baked per-section** (`data-lattice-pagination` number +
  `data-lattice-pagination-total`, `slides.js:189,197`) — but `auto-split.js`
  already re-derives both with a cheap regex re-stamp on assembled HTML. So
  pagination is fixed up on assembly, never by re-rendering.
- **The genuinely cross-slide couplings are all cheap to detect from raw
  source** and become bail-to-whole-deck triggers:
  1. link reference definitions (`^[ \t]{0,3}\[[^\]^]+\]:[ \t]+\S`) — resolved
     against the whole-doc markdown-it env; a def on slide 9 can feed slide 1.
  2. a mid-deck *global* (non-`_`) comment directive — cascades to all following
     slides (`slides.js:135-137`).
  3. front-matter `glossary: auto` — appends a derived tail slide
     (`glossary-auto.mjs`).
  4. `focusSteps` (`<!-- _focusSteps: … -->`) — clones one slide into N.
- **Carryable, not bails:** front-matter deck-globals (theme/size/meta/class…)
  — prepend the front-matter block to each per-slide render, invalidate all on
  FM change; the section `id` = absolute index — re-stamped on assembly; the
  `divider` progress-rail — invalidate form slides only when the divider set
  changes.

## Design — a deck AST of slide nodes

Ordered list of nodes `{ sourceHash, cachedSectionHTML }`. Per render:

1. **Segment** `splitSourceToSections(source)` → per-slide sources (kernel
   boundary truth).
2. **Deck context** `ctx = hash(frontMatter)`. Changed → invalidate all nodes.
3. **Bail predicate** (cheap regex, the four cross-slide triggers above) → this
   render falls back to today's whole-deck `PG.render`. Correct by construction
   for exotic decks; the fast path owns the common case.
4. **Diff** nodes by `sourceHash` → dirty set (normally one). Render each dirty
   node by calling the existing kernel on `frontMatter + thatSlide` in
   isolation; extract its `<section>`; cache.
5. **Assemble** sections in order; re-stamp `id` + pagination (reuse
   `auto-split.js`'s regex). Emit the same `html` string the whole-deck render
   would produce, then hand it to the UNCHANGED `renderDeck` / `patchSections`.

The kernel remains the single source of truth for *how* a slide renders
(HARD RULE #1); the cache only decides *which* slides re-render.

### Correctness invariant (the north-star test)

`incrementalRender(src)` MUST equal `wholeRender(src).html` byte-for-byte for
any edit. This is a cheap property test (random edits over a corpus of real
gallery decks) and the thing the adversarial trio hammers. Any divergence is a
bug or a missing bail trigger — it fails loud in dev, and a dev-mode assertion
periodically diffs incremental-vs-whole and falls back on mismatch.

## Scoped fit (the other 25%)

After a patch that changed only section K, re-fit only section K instead of all
N (`__latticeFit` in `deck-preview.js`'s injected agent). A text edit changes
only the edited section's height. Proposed as the immediate follow-up so each
change is independently reviewable/verifiable (HARD RULE #17).

## Metrics (HARD RULE #19)

- Real-surface before/after on `pg-perf.mjs` (same seeded decks + throttle
  tiers); the before column above is already captured.
- An engine bench scenario exercising the incremental path (edit one slide in a
  50-slide deck); `bench:bless` ratchets `baseline.json` as the durable record;
  `## Performance` in the PR.

## Surfaces (investigated) — the cache is a Playground-filmstrip concern

| Surface | Renders | Has the O(deck) cost? |
|---|---|---|
| **Playground** | whole deck → all sections in one iframe (content-visibility virtualization; nodes stay mounted) | **Yes** — the 227 ms case; the cache target |
| **Studio** | `frontMatter + current slide` — one section per iframe (`StudioShell.tsx:1923`) | **No** — already single-slide/incremental |
| **Print/export** | all pages in one doc | n/a — renders once |

The Studio is already incremental by construction, so this work targets the
Playground filmstrip only.

## Pagination — decided by adversarial trio (verdict: single owner, no CSS counter)

Owner's instinct was "engine and CSS both own pagination; disagreement = a
maker/checker drift canary." The full trio (red team + Munger inversion +
independent checker) **unanimously rejected** dual ownership:

- It re-introduces a **retired anti-pattern** — `design/design-principles.md:224`
  records that the old `<span class="marp-slide-pagination">` + `::after` dual
  path was deliberately removed; "pagination lives on `section::after` only." A
  second derivation is a **HARD RULE #1 violation**.
- The two derivations are **not independent**: the engine already re-derives its
  number from *rendered* document order after auto-split (`auto-split.js:251`).
- In the cache the engine number is a **stale cached guess**, so "who to believe"
  collapses to a trivial "always the rendered position" — a canary that fires on
  every insert/delete/reorder (alarm fatigue; cf. the retired drift-watch,
  `2026-06-15-retire-drift-watch.md`).
- It is a **strict, noisier subset of the property test** and *blind* to the
  likeliest cache bug (stale body at unchanged position → numbers agree, render
  wrong).
- A CSS counter would also **double-render** on masthead slides, which lift the
  number into a real `<span class="lat-pagination">` (`masthead-lift.js:104`).

**Resolution (candidate B — no engine/CSS/export change):** pagination stays
**single-owner in the engine**, re-stamped after auto-split (existing, test-locked
kernel `auto-split.js:249-252`). The **cache keys on slide content, excluding the
pagination attribute**, and applies the number at *assembly* via that same
re-stamp. Inserting a slide leaves siblings' cache entries valid; only the cheap
assembly renumber runs. No CSS `counter(page)`, no export-artifact change, no
sign-off gate. The `incrementalRender === wholeRender` property test is the sole
drift guard (this IS maker/checker applied correctly: an independent invariant
validates the maker at test time; one artifact ships).

**Salvaged from the instinct (optional, separate):** "authored count vs rendered
count" (e.g. *"50 authored → 55 rendered; 3 overflowed"*) is genuine author
feedback — but it reads two numbers the *engine already computes*, surfaced in
Studio chrome. Not a counter, not dual authority. Log as an independent UX item.

## Decisions

- **Placement:** shared engine kernel (owner's call) — a first-class incremental
  render path the Playground filmstrip consumes; kernel stays the single source
  of truth for *how* a slide renders.
- **Coverage:** front-matter globals via FM-prefix + divider-signature
  invalidation; bail to whole-deck on the exotic four (cross-slide refs /
  mid-deck global directive / `glossary:auto` / `focusSteps`). Pagination handled
  by the assembly re-stamp above.
- **Scope:** bundle the transform cache + scoped fit together (owner's call) —
  full mobile win (288 → ~65 ms) in one change.

## Verification ladder (HARD RULE #25)

High-blast-radius + novel → full adversarial trio on what ships. The trio has
ALREADY run once (on the pagination sub-design, verdict above) and will run again
on the shipping cache implementation. The byte-for-byte `incrementalRender ===
wholeRender` property test is the machine gate.
