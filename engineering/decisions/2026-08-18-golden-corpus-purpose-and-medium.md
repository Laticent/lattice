---
status: proposed
summary: >
  Re-blessing 359 committed PDFs hurts, and the cause is NOT the artifact format —
  it is that the one tool capable of catching a stale golden runs on no cadence.
  `tools/regression-gate.mjs` renders fresh and pixel-diffs; `ci.yml:278` retired it
  from CI and nothing schedules it, and `2026-08-04-committed-pdf-freshness.md:153`
  prescribed the fix two weeks before this note and it was never executed. Meanwhile
  `build:galleries:check` — a pre-commit input-hash guard that documents its own
  inability — reports 122 galleries green while `quote.gallery.light` alone carries
  17,044 drifted pixels across 7 of 9 slides. Measured cost findings that hold:
  `waitUntil: networkidle0` is 82% of a render's fixed per-deck cost and swapping it
  to `load` changes no pixels (SHIPPED; end-to-end saving 0.66-0.80s per navigation,
  0 page-count/clipped/split change across all 277 decks); cost is per-DECK (~2s) not
  per-slide (~5-20ms); 4 decks of 30 are byte-irreproducible — **corrected: at least 11
  of 277, the set is not stable, and the driver is not `classDiagram` but Chrome's
  tagged-PDF accessibility node IDs**. A text
  snapshot of composition is a genuinely useful ADDITION with five measured blind
  spots, but it cannot replace the pixel goldens — deleting those would make
  `golden-diff` post a permanent false green and break 61 component doc links.
  Recommendation: wire the cadence, take the free speed, add the snapshot alongside,
  delete nothing. §9 is the audit trail: this note's first draft argued the opposite
  and the adversarial trio refuted it.
---

# Why re-blessing hurts — and why the medium was the wrong suspect

**2026-08-18 · measurement record. Nothing here has shipped.**

**Question asked:** re-blessing PDFs is painful — is there a better and faster way?
Do we need this many? Could one comprehensive PDF replace them?

**Answer, and it is not the one this note originally reached:** the pain is real and
the corpus really is stale, but **the artifact format is not the cause.** The cause
is that the only tool that can detect a stale golden is wired to nothing. Fix the
cadence and most of the pain goes with it — no new artifact class, no deletions.

> **This note was rewritten.** Its first draft diagnosed the medium and proposed
> replacing the goldens with text snapshots. HARD RULE #25's adversarial trio
> refuted that diagnosis, the transitivity argument under it, and three of its
> "measured" numbers. Rather than bury that, **§9 keeps the full audit trail** — what
> was claimed, what was refuted, and what survived. The measurements below are the
> ones that were independently re-verified.

---

## 1. What is in the tree

| Class | Files | Pages | Bytes |
|---|---:|---:|---:|
| `examples/` | 158 | — | — |
| `lib/components/**/*.gallery.{light,dark}.pdf` | 150 | 1,602 | 58.3 MiB |
| `exemplars/` | 45 | — | — |
| `examples` + `exemplars` combined | 203 | 2,095 | 73 MB |
| misc (`design/`, `themes/`, `test/`, `dist/marp-kit`, `engineering/`) | 6 | — | — |
| **Total** | **359** | **4,033** | **~146 MB — 75.9% of the tracked tree** |

198 deck sources carry a committed PDF (201 today). Note the gate covers **122**
galleries, not 150 — an easy number to mis-attach, and the first draft did.

---

## 2. The actual defect: a capable detector with no cadence

### 2.1 The gate that reports green is not the freshness gate

```
$ npm run build:galleries:check
✓ 122 gallery PDFs: no render input changed since HEAD (golden-diff is the pixel gate)
```

It is a **cheap pre-commit input-hash guard**, and it says so itself —
`tools/lib/render-inputs.js:40`:

> *"It cannot see a change that was committed WITHOUT rebuilding the PDFs — once
> both sides are at HEAD, the pairing looks sound whether or not anyone
> re-rendered."*

### 2.2 The tool that can is retired from CI

`tools/regression-gate.mjs` (`npm run regress`) renders every committed deck fresh
through the emulator and pixel-diffs it against its golden. It is **structurally
capable** of catching everything in §2.3. Why it never runs —
`.github/workflows/ci.yml:278`:

> `── (Visual regression gate REMOVED — pivoted to component invariants) ──`

It is wired to **no workflow and no hook**. And the fix was already written down —
`2026-08-04-committed-pdf-freshness.md:153` prescribes adding `regress` to
`integration-nightly.yml` at ~3% tolerance (above cross-runner rasterization noise).
It was never executed.

**So the corpus is stale because a two-week-old recommendation went undone.** That
is a scheduling defect, not an argument about file formats.

### 2.3 What the staleness actually looks like

Rebuilding three galleries while the gate reported green — reproduced byte-for-byte
by an independent checker:

| Golden | Before | After |
|---|---:|---:|
| `quote.gallery.light.pdf` | 184,496 | 197,994 |
| `timeline-list.gallery.light.pdf` | 298,162 | 309,503 |
| `cycle.gallery.light.pdf` | 210,877 | 220,925 |

Pixel-diffing `quote.gallery.light` at 72 dpi: **17,044 changed pixels across 7 of
its 9 slides** (per slide: 0, 1185, 2624, 2378, 1657, 1886, 1772, 5542, 0). Visible
drift, sitting in `main`, with a green gate.

**Byte delta is a bad proxy for drift.** `exemplars/nonprofit/program-overview`
differs by **7 bytes** and **153,432 pixels across 15 of 17 pages** — the most
visually drifted deck measured, and nearly invisible by size.

### 2.4 Why it leaks into unrelated PRs — issue #1730

> *"any PR that happens to touch a component absorbs that component's share of the
> drift into its own diff, where it reads as a visual change the PR made."*

Its `golden-diff` showed 5 changed slides, only 2 its own. **A green nightly
`regress` fixes this directly**: if every golden in `main` is fresh, a PR's
`golden-diff` shows only that PR's pixels. No medium change required.

### 2.5 A second, independent defect: `classDiagram` is not reproducible

Four decks of 30 with committed PDFs are byte-irreproducible across two identical
renders. The cause is the **`classDiagram`** renderer, not mermaid:

| Probe | Result |
|---|---|
| `examples/sketch.md` (carries a mermaid fence) | **byte-identical** |
| bare `classDiagram` fence | **differs** — 15,200 vs 15,201 B |
| bare `flowchart` fence | **identical** |
| committed-PDF decks containing `classDiagram` | **4 of 30** |

The differences are pixel-identical, so these four churn a new blob on every
re-bless while changing nothing a reader sees.

---

## 3. Cost: where a render's time actually goes

Cost is **per deck**, not per slide. A 1-slide deck costs 1,949 ms; a 13-slide deck
2,181 ms — roughly 5–20 ms per additional slide against ~1.95 s of fixed overhead.

| Phase | Cost |
|---|---:|
| browser launch | 207 ms cold, 81–120 ms warm |
| `goto` **networkidle0** | 851–2,200 ms |
| `goto` `load` | 133 ms |
| PDF encode | 41 ms |

Controlled comparison, one warm browser:

| Variant | Per deck |
|---|---:|
| fresh page + `networkidle0` (today) | 2,223 ms |
| fresh page + **`load`** | **408 ms** |

**`waitUntil` is ~82% of the fixed cost** (independently re-measured at 85%: 2,003 ms
→ 301 ms). This is lever **L2** in `2026-08-16-render-format-cost-assessment.md`,
written up there as "a cheap thing to try."

**Swapping it changes no pixels.** 40 `examples/` decks: 36 byte-identical, the other
4 with **0 changed pixels**. 8 of 8 galleries byte-identical. Attacked directly, it
held on every case built against it — KaTeX, mermaid, 10 real `<img>`, `state-chart`
(the case an in-code comment claims `networkidle0` covers), the async overflow
marker, and a deliberately delayed remote image. **There is no network in a Lattice
render for `networkidle0` to wait on**: no engine CSS references an external `url()`,
theme `@import`s are inlined at build, and nothing emits `loading="lazy"`. Font
correctness rests on the explicit force-load after each navigation, not on the wait.

The pattern is already in-tree — `test/integration/invariants/component-invariants.test.js:194`
runs `waitUntil: 'load'` with the settle-fonts pairing. It simply never reached the
emulator.

**Granularity.** Twenty gallery sources rendered separately cost 50,834 ms against
8,822 ms as one concatenated atlas (5.7×; independently 7.2×) — because the ~1.95 s
fixed cost is paid 20 times instead of once. **But this and the `waitUntil` win are
substitutes, not additive**: post-`load` the same comparison is ~8.2 s vs ~4.8 s,
i.e. **~1.7×**. Fix the fixed cost and granularity mostly stops mattering.

---

## 4. Coverage is lopsided — the one place "too many" is fair

| Axis | Reality |
|---|---|
| `content` renders | 326× |
| `title` renders | 208× |
| `closing` renders | 165× |
| Themes on disk | 32 |
| Themes exercised by any golden | **16** |
| Decks using `indaco` | 166 of 198 (84%) |

4,033 pages re-render a handful of components under one theme while **half the
themes have no golden at all**. That is a coverage-allocation problem, and it is
orthogonal to both cadence and medium.

---

## 5. The snapshot: a real addition, not a replacement

A per-slide text snapshot of composition — every laid-out element's box plus a
curated property set, one line each, two channels split by `::`:

```
s001 code [488.25,288,303.5,19] :: color(srgb 1 1 1 / 0.76)|…|14.976px|600|"JetBrains Mono"…
```

Harness: `tools/spike-composition-snapshot.mjs` (committed, so these numbers are
auditable).

**What it does well.** Deterministic — 0 differing rows across fresh browsers,
device scale factors and viewports; the geometry channel is not noisy. Small — one
gallery is ~20 KB against a 198 KB PDF; 219 slides are 117 KB gzipped. Diffable, and
it *names* the change: an injected `padding-left: 120px` shows as
`0px → 120px` plus the knock-on `blockquote` height. It also fixes §2.5 — the
`classDiagram` decks that churn bytes produce **0 differing snapshot rows**. And the
two channels map one-to-one onto what tokens do (color tokens move style, length
tokens move geometry — `--sp-lg` moved 36 geometry rows and nothing else), so a
color-only PR whose geometry channel moved is a bug, flagged for free.

**Five measured blind spots.** All demonstrated, not assumed:

1. **Paint-only properties** — `box-shadow`, `background-image`, `border-radius`,
   gradients, z-order overlap, glyph rasterization.
2. **Text content.** `"stating"` → `"statign"` (same glyphs, same width): **0 rows
   differ** while the PDF bytes move. A transformer that reorders or truncates text
   at constant width is invisible — and transformers are precisely the owner that
   reshapes the DOM with no CSS diff.
3. **Screen vs print.** `getComputedStyle` returns screen values; `page.pdf()`
   renders under print emulation, where `lib/base/base.finish.css` flips the whole
   finish system to its `-opaque` mirrors. 11 rows differ on `finish-backdrops` —
   and they land entirely in `background-image` / `clip-path` / `box-shadow`, i.e.
   blind spot 1. **Blind twice over.**
4. **SVG paint servers.** The a11y/print texture `<pattern>` defs live in a zero-size
   `<svg>` outside every `<section>`; a per-slide walk never enumerates them.
5. **Slide insertion.** Slide-relative coordinates do **not** fix it — the noise
   source is the slide-index key. Inserting one slide into a 9-slide gallery churns
   ~60% of rows for 11 rows of real content.

**Cost, stated honestly.** Extraction is ~2.06 s per deck regardless of element
count — the same fixed cost a PDF pays, minus the 41 ms encode. The "1.76 s for 219
slides" figure is an *atlas* number and belongs to granularity, not to the medium.
Committing 150 per-component snapshots would cost ~5.2 min, not seconds.

**Cross-host stability is UNVERIFIED.** The first draft asserted "yes — layout math,
not rasterization" in a table of measurements without measuring it. The font stack
resolves through three host-defined families. One CI run settles it, and it should
gate any per-PR use.

---

## 6. What deleting the committed goldens would break

- **`golden-diff` would post a permanent false green.** Its candidate set is derived
  from committed gallery blobs (`tools/golden-diff.mjs:85`, filtered by
  `GOLDEN_RE`). Remove them and `changedGoldens()` returns empty on every PR,
  emitting *"✅ No visual changes to committed goldens on this branch"* forever — on
  the surface reviewers actually read. Same vacuous-gate class as #1750.
- **61 component `.docs.md` files** link `<name>.gallery.light.pdf`
  (`tools/build-component-docs.js:383`), which HARD RULE #6 sends agents to. An
  atlas offers no per-component link.
- `2026-08-16` L4 permitted dropping the goldens **"only if L0 is impossible."** L0
  shipped (timestamps pinned). That precondition is already falsified.
- **HARD RULE #9 caps the count anyway.** 109 of the 150 `examples/` decks are the
  6–10 slide feature-deck shape, and ~110 files reference them. Without amending
  that rule the floor is ~206 committed PDFs, not ~20.

---

## 7. Who owns what — corrected

Almost every layer already blesses its own contract, cheaply and in text. A bad
`--brand-canvas` in `themes/indaco.css` is rejected in **4.6 s**, naming 30 failing
token pairs with measured ratios and a prescribed OKLCH fix, with zero PDFs
rendered. `palette:bless` writes keyed, ratchet-only baselines. `tools/check-ownership.js`
holds **70** such gates and runs in **6.6 s**.

But two corrections matter:

- **Those 70 are static; the repo's dynamic tier is not empty.** Ten further owned
  gates in `tools/` drive a real browser (`check-geometry-parity`,
  `check-slide-contrast`, `check-css-values`, `check-viz-render`, …), so "6.6 s vs
  ~7 min" is not a like-for-like comparison.
- **Composition is partly owned already.** `test/integration/invariants/` is 16 files
  / ~3,990 lines, 10 driving real Chromium for computed style and geometry, running
  on the **PR path** via `test:integration:pr` — and `ci.yml:278` says the pixel gate
  was retired *in favor of it*. `component-invariants.test.js` renders every
  component in one batched deck: the snapshot's medium and the atlas's granularity,
  already shipped.

**The honest gap is narrow:** that tier asserts *hand-written invariants*, not a
*full baseline*. That is coverage breadth, not ownership — and it makes the snapshot
an **extension of an existing tier**, which is what HARD RULE #15 wants.

**Transitivity does not hold.** The first draft argued that because HARD RULE #3 is
gated at budget 0, an unchanged token table proves nothing downstream changed.
Color reaches pixels without `var(--token)` at least three ways the gate cannot
see:

- `lib/core/accessibility-textures.js:71-78` declares literal hex ramps **in
  JavaScript** — *"LITERAL hex (no var, no CSS)"* — injected into every export via
  `lattice-emulator.js:761`. A hand-maintained duplicate of the token table, painting
  the `a11y-*` themes, `onyx`, `concrete` and print mode.
- `checkHexLiterals` matches **hex only**. `image.styles.css:404-405,417` paints
  scrim gradients and caption ink as `rgba()` literals; `video.styles.css` the same
  for shadows.
- 18 files under `lib/**/*.js|mjs` carry hex the gate never scans.

Those `rgba()` sites are gradients, ink-over-photo and shadows — **exactly §5's blind
spot 1**. That content is invisible to both the gate and the proposed medium.

---

## 8. Recommendation

**Decouple the addition from the subtraction.** Medium, granularity and storage are
independent choices; the first draft coupled them.

1. **Wire `regress` to a cadence.** Nightly, ~3% tolerance, rolling issue — the shape
   `2026-08-04-committed-pdf-freshness.md:153` already specified and `perf-nightly.yml`
   already models. **This is the whole fix for §2**, it fixes #1730's leak, and it
   needs no new artifact class. If exactly one thing ships from this note, it is this.
2. **Re-bless the corpus once**, on that cadence's first red, so `main` is clean.
3. ~~**`waitUntil: 'load'`.**~~ **SHIPPED.** All three items in this line were
   carried out: the two in-code comments were corrected (and a third, which
   claimed `measureOverflow()` force-loads fonts via `lib/core/font-settle.js` —
   it does not; the force-load is in its callers and deliberately off the shared
   helper), and `check-geometry-parity.js` was moved in step. One thing this note did
   NOT anticipate: `load` does not wait for `loading="lazy"` media, which Chromium
   defers past the load event, so a deck carrying raw `<img loading="lazy">` exported
   without the image entirely — found by the adversarial trio, fixed in the same change
   by promoting deferred media to eager and awaiting decode. Sized end to end
   at **0.66-0.80 s per navigation**,
   not the ~1.7s the cost assessment first recorded — see its §9 rows 15-16 for
   why the earlier probe read high. Verified across all **277** shipped decks:
   0 page-count, 0 clipped-page and 0 auto-split differences.
4. **Fix byte-irreproducibility** — and the `classDiagram` diagnosis is **the wrong
   target**. Measured across all 277 shipped decks rather than 30, **at least 11**
   render to different bytes on two same-code runs (the set is not stable — a third
   run differs on 9, and `cover-paginate.md`, outside the 11, reproduces it too).
   Only 5 of the 11 contain `classDiagram`; four contain no mermaid at all. The
   actual mechanism is **Chrome's tagged-PDF accessibility node IDs** — 26 bytes,
   all inside `/ID (node…)` and its `/Headers` references, rasterizing
   pixel-identical. See `2026-08-16-render-format-cost-assessment.md` §9 row 17.
5. **Build the snapshot as an ADDITION**, extending `test/integration/invariants/` —
   after fixing print media, and after running the cross-host experiment §5 flags.
6. **Delete nothing** until both have run side by side long enough to answer: did the
   snapshot catch anything the pixel gate missed, and miss anything it caught?
7. **Separately, fix coverage allocation** (§4) — 16 uncovered themes is a real hole
   that neither cadence nor medium addresses.

**Every measurement in this note measures COST. None measures COVERAGE.** That is why
step 6 exists, and it is the single most important sentence here.

---

## 9. Audit trail — what was claimed, refuted, and survived

This note's first draft argued the medium was the problem. HARD RULE #25's trio (red
team · Munger inversion · independent checker) was run against it before merge, and
every finding below was re-verified by hand before being recorded.

### 9.1 Refuted

| # | Claimed | Refuted by |
|---|---|---|
| 1 | "The staleness gate is structurally incapable of failing" ⇒ the medium is at fault | Scored the wrong tool. `regression-gate.mjs` is fully capable; `ci.yml:278` retired it and nothing schedules it (§2) |
| 2 | Transitivity is sound because `checkHexLiterals` is budget 0 | False — three bypasses (§7) |
| 3 | "Composition has no owned bless" | Circular survey of one file that is static by construction. `test/integration/invariants/` already owns much of it (§7) |
| 4 | "29 mermaid decks are not byte-reproducible"; the prior claim was tested on a mermaid-free deck | `classDiagram`, **4 of 30**. `sketch.md` *is* a mermaid deck and *is* stable (§2.5) |
| 5 | "Page reuse is worth 3%; `waitUntil` is 82%" | The 3% does not reproduce — 23% interleaved, 31–40% independently. The block-run design was the defect. The 82% half holds |
| 6 | Snapshot "stable across hosts: yes" | Asserted in a measurements table without measurement (§5) |
| 7 | Snapshot extraction "1.76 s for 219 slides" vs "~2.2 s/deck" | Atlas figure against a per-deck figure; per-deck extraction is ~2.06 s (§5) |
| 8 | The moves are independently additive | `waitUntil` and atlas granularity are **substitutes**; 5.7× → ~1.7× post-swap (§3) |
| 9 | Committed PDFs could drop 356 → ~20 | HARD RULE #9 puts the floor at ~206 (§6) |
| 10 | A scoring table giving today `Detect = 0` | Scored against the wrong tool (#1), which inflated every option above the do-the-cadence one |
| 11 | Counts: 356 PDFs, 4,009 pages, 67% of tree, `content` 330×, "150 galleries = 1,334 pages" | 359 / 4,033 / 75.9% / 326× / those are the **122** gate-covered galleries |

Earlier self-corrections, kept: a persistent-browser-pool hypothesis (refuted by
measurement), an incremental-rebuild-by-component plan (scoping holds, but 10 of 17
recent PDF-rewriting commits were cross-cutting, so it barely helps), and an invalid
negative control whose probe selector matched no element.

### 9.2 Survived

- **§2.3's observation reproduced byte-for-byte**, including 17,044 pixels across 7
  of 9 slides, per-slide identical. The strongest section here.
- **`waitUntil: 'load'`** held against every attack built for it (§3) — better
  evidenced now than when first written.
- **Snapshot determinism** held more strongly than claimed (§5).
- Exact: 70 `check*`, 6.6 s, `SANCTIONED_HEX` = 5, 32 themes / 16 exercised,
  `indaco` 166 of 198, 198 deck sources, 4 of 30 `classDiagram`.
- Per-slide marginal cost is ~4.7 ms — *stronger* than the ~20 ms first stated.

### 9.3 Still not measured

- **Cross-host stability**, for pixels *and* snapshots. The Skia claim that
  `regression-gate.mjs` and `golden-diff.mjs` both rest on is asserted in-tree with
  no measurement behind it, and §5's counter-claim is equally unmeasured. One CI run
  settles both.
- **`waitUntil: 'load'` on the overflow corpus and the auto-split path** — 48
  artifacts plus a hostile pass is not the whole corpus. And **no artifact was
  retained** from that run, so §3's "verified" cannot be re-inspected: a HARD RULE
  #23 gap, disclosed rather than fixed.
- **Snapshot behavior under auto-split/reflow**, where element counts change.
- Whether an atlas is viable at all: it is **theme-locked** (`theme` and `size` are
  `GLOBAL_ONLY`, `lib/engine/directives.js:81`), so it can never address §4's theme
  gap, and the 5.7× spike concatenated sources — 221 slide markers produced 219 pages
  plus an overflow warning, so its numerator is not equivalent work.
- What the corpus actually **catches**. Every number here is a cost number.
