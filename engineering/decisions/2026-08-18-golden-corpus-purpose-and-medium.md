---
status: proposed
summary: >
  Re-blessing hurts because 356 committed PDFs serve four different jobs with one
  artifact, and the job that drives the churn — regression detection — is the one a
  PDF serves worst. Measured: the corpus is 100% stale against current main and the
  freshness gate reports GREEN (it compares inputs against HEAD, so staleness committed
  INTO HEAD is invisible); one rebuilt gallery moved 17,044 pixels across 7 of 9 slides
  undetected. 82% of per-deck render cost is a `waitUntil: networkidle0` that changes no
  pixels. 150 separate gallery renders cost 5.7x the same slides rendered as one atlas.
  29 mermaid decks are not byte-reproducible, so they churn a full blob every re-bless
  regardless of change. Coverage is lopsided: `content` is rendered 330 times and `title`
  208 while 16 of 32 themes have no golden at all. Proposal: split the jobs — regression
  detection moves to a committed TEXT snapshot (geometry + computed style: 117 KB gzipped
  for 219 slides, deterministic, host-stable, and it NAMES what changed), browsing
  artifacts become on-demand atlases, and committed PDFs shrink to the HARD RULE #9
  feature decks.
---

# Why we have 356 golden PDFs, and why that is the wrong question

**2026-08-18 · measurement record + design model. Nothing here has shipped.**

**Question asked:** re-blessing PDFs is painful — is there a better and faster way?
Do we need this many? Could one comprehensive PDF replace them?

**Short answer:** the count is a symptom. The cause is that one artifact type is
being asked to do four unrelated jobs, and the job that generates nearly all the
churn — *did my change move something I did not intend?* — is the job a committed
PDF does worst. Fix the medium and the count collapses on its own.

> **Every number below was measured on this sandbox** (4-core Xeon, Chrome for
> Testing 131, Node 22.22.2) during this investigation. Where a claim is inherited
> rather than measured, it says so. Two of my own hypotheses were refuted along the
> way and are recorded in §7 rather than quietly dropped.

---

## 1. What is actually in the tree

| Class | Files | Job it was created for |
|---|---:|---|
| `examples/**` | 155 | HARD RULE #9 demo decks — documentation |
| `lib/components/**/*.gallery.{light,dark}.pdf` | 150 | the deliberate regression corpus |
| `exemplars/**` | 45 | sector showcases — documentation |
| `design/`, `themes/`, `test/`, `dist/marp-kit`, `engineering/` | 6 | mixed |
| **Total** | **356** | **~146 MB, 4,009 pages** |

The 150 galleries were *designed* as goldens. The other 206 are documentation
artifacts that were **conscripted** into regression duty by `regression-gate.mjs`'s
second scope (#1379 — "185 artifacts that had no watcher reading their bytes at
all"). That conscription is where most of the pain comes from: a token change now
forces a re-bless of 200 documentation PDFs whose job was never regression
detection.

---

## 2. The four jobs, and which artifact each one actually needs

| # | Job | Needs | Does a committed PDF serve it? |
|---|---|---|---|
| J1 | **Regression detection** — did my change move something unintended? | a *comparison* | **No.** It stores one side of a comparison as 4,009 pages of pixels, then needs a rasterize-and-montage pipeline to say what moved. |
| J2 | **Review evidence** — what does this PR's visual change look like? | a comparison, at review time | Partly — but it can be generated, not stored. |
| J3 | **Demo / documentation** — the shareable deck, the browsable gallery | a current artifact | Yes, for a handful. Not for 356, and **only if current** — see §3. |
| J4 | **Boardroom proof** — a human actually looking | a human act | Not a file at all. |

**J1 is the only job that forces a re-bless of everything, and it is the one job
that does not need a stored artifact.** That is the whole finding.

---

## 3. Three defects, measured

### D1 — Staleness is structurally undetectable

`build:galleries:check` reports:

```
✓ 122 gallery PDFs: no render input changed since HEAD (golden-diff is the pixel gate)
```

It compares render inputs against **HEAD**. A change committed *without* rebuilding
is therefore invisible to it — the tool's own source says so ("a change COMMITTED
without rebuilding still looks sound here"). Rebuilding three galleries while the
gate reported green:

| Golden | Result |
|---|---|
| `timeline-list.gallery.light.pdf` | 298,162 → 309,503 bytes |
| `cycle.gallery.light.pdf` | 210,877 → 220,925 bytes |
| `quote.gallery.light.pdf` | 184,496 → 197,994 bytes |

Pixel-diffing `quote.gallery.light` (72 dpi, exact): **17,044 changed pixels across
7 of its 9 slides**. Not sub-pixel noise — real, visible drift, sitting in `main`,
with a green gate.

Same check on the `examples/` scope: **40 of 40** sampled decks differ in content
from a fresh render, by up to +70 KB.

This is issue **#1730** — logged independently against #1724's ramp change — and it
is broader than the two components that issue names.

### D2 — Stale goldens leak into unrelated PRs

#1730 states the consequence precisely: *"any PR that happens to touch a component
absorbs that component's share of the drift into its own diff, where it reads as a
visual change the PR made."* Its `golden-diff` showed 5 changed slides, only 2 of
which were its own.

So the cost is not only time. It is **review integrity**: authors are asked to
explain pixels they did not move.

### D3 — Mermaid decks are not byte-reproducible

`examples/diagram-narration.md` (7 fences), two renders, identical settings, one
machine: **294,379 vs 294,403 bytes**, differing inside a Flate-compressed content
stream. Pixel-identical, byte-different.

This contradicts the standing claim in `regression-gate.mjs` and in
`2026-08-16-render-format-cost-assessment.md` §9 row 13 that same-machine renders
are byte-identical. That claim was tested on a **mermaid-free** deck (`sketch.md`)
and does not generalize. **29 committed-PDF decks contain mermaid**, so those churn
a full new blob on every re-bless whether or not anything changed.

---

## 4. Three wastes, measured

### W1 — 82% of per-deck render cost buys nothing

A 1-slide deck costs **1,949 ms**; a 13-slide deck costs **2,181 ms**. Cost is
almost entirely *fixed per deck*, ~20 ms per slide. Decomposed:

| Phase | Cost |
|---|---:|
| browser launch | 207 ms |
| `goto` **networkidle0** | 851–2,200 ms |
| `goto` `load` | 133 ms |
| PDF encode | 41 ms |

A controlled 4-way run (same 4 decks, one warm browser, 4 samples each):

| Variant | Per deck |
|---|---:|
| A — fresh page + `networkidle0` (today) | 2,223 ms |
| C — warm page + `networkidle0` | 2,151 ms |
| D — fresh page + **`load`** | **408 ms** |
| B — warm page + `load` | 345 ms |

**`waitUntil` is worth 82%; page reuse is worth 3%.** My own hypothesis — that
re-parsing the 1.5 MB inlined CSS bundle per deck was the cost — was **wrong**
(§7).

Swapping the emulator's three `page.goto` calls to `load` and re-rendering:

- 40 `examples/` decks: **36 byte-identical**, 4 differ with **0 changed pixels** each
- 8 component galleries: **8 of 8 byte-identical**
- wall: examples 49 s → 38 s; galleries 9 s → 5 s

This is lever **L2** in the 2026-08-16 assessment, where it was written up as "a
cheap thing to try." Nobody had tried it.

### W2 — Coverage is lopsided

Across the 198 deck sources that carry a committed PDF:

| Axis | Reality |
|---|---|
| `content` renders | **330×** |
| `title` renders | **208×** |
| `closing` renders | **165×** |
| Themes on disk | **32** |
| Themes exercised by any golden | **16** |
| Decks using `indaco` | **166 of 198 (84%)** |

We spend 4,009 pages re-rendering a handful of components under one theme, and
**half the themes have no golden coverage at all**. The corpus is simultaneously
massively redundant and thin.

### W3 — Granularity: 150 renders to draw slides that fit in one

Twenty gallery sources, same slides, two ways:

| | Wall | Pages |
|---|---:|---:|
| 20 separate renders (today) | **50,834 ms** | 219 |
| one concatenated atlas | **8,822 ms** | 219 |
| | **5.7× faster** | |

Because cost is per *deck*, not per *slide* (W1), splitting the same content across
150 files multiplies the fixed cost 150 times.

---

## 5. The medium: what a regression golden should be

If J1 needs a comparison rather than an artifact, the question becomes: **what is
the cheapest signal that catches a real regression and tells a human what it was?**

Spiked and measured: a per-slide **geometry + computed-style snapshot** — every
laid-out element's box plus a curated property set, one text line each.

```
s001 code [488.25,288,303.5,19] color(srgb 1 1 1 / 0.76)|…|14.976px|600|"JetBrains Mono"…
```

| Property | Committed PDF | Text snapshot |
|---|---|---|
| Size (219 slides) | 4.88 MB | 2.34 MB raw, **117 KB gzipped** |
| Size (one gallery) | 197,994 B | 19,978 B |
| Extraction time | ~2.2 s/deck | **1.76 s for all 219 slides** |
| Deterministic same-host | no for mermaid (D3) | **yes** (verified) |
| Stable across hosts | **no** — Skia is CPU-dispatched | **yes** — layout math, not rasterization |
| Diffable in git | no (new binary blob) | **yes** (text, delta-compresses) |
| Says *what* changed | no — pixel counts + a montage | **yes** |

Sensitivity check — a `padding-left: 120px` injected into `quote`:

```
- s002 p [271,992.75,738,84]  …|0px|0px|normal|1
+ s002 p [271,992.75,738,84]  …|0px|120px|normal|1
- s004 blockquote [222,2298.5,836,352.5] …
+ s004 blockquote [222,2277.5,836,394.5] …
```

It catches the cause *and* the knock-on layout shift, as a git-readable diff. For
#1730's question — *did the ramp change move the inline-code pills?* — that is a
one-line answer instead of a rasterized montage.

**What it does not catch, honestly:** anything painted but not in the property
list — `box-shadow`, `background-image`, `border-radius`, gradients, z-order
overlap, glyph rasterization. So this **complements** pixels; it does not abolish
them. A small, deliberately chosen pixel set stays as the paint backstop, which is
also where the 16 uncovered themes should go.

**Known weakness:** boxes are currently document-relative, so inserting a slide
shifts every following `y` and produces a huge diff. Make coordinates
slide-relative before this is real work.

---

## 6. The design model

Three axes, chosen independently:

| Axis | Options |
|---|---|
| **Medium** for J1 | committed PDF pixels · **text snapshot** · rendered-both-refs, nothing stored |
| **Granularity** | one file per component (today, 150) · **a few atlases** · one |
| **Storage** | committed in git (today) · content-addressed cache · generated on demand |

### The moves, independently shippable, cheapest first

**M1 — `waitUntil: 'load'`.** Three lines. Verified byte- or pixel-identical on 48
artifacts. −22% to −44% wall on everything that renders, forever. *Touches the
export path, so it needs export sign-off per the QUALITY BAR.*

**M2 — make the staleness gate able to fail.** D1 is a gate that cannot detect the
thing it exists to detect. Comparing against HEAD is the bug; it must compare
against a *rebuild*, on a schedule if it is too slow per-PR. Without this, every
other improvement decays back to stale.

**M3 — fix mermaid reproducibility (D3),** or accept that 29 decks churn forever.

**M4 — move J1 to snapshots.** Commit snapshots instead of the 150 gallery PDFs.
Re-blessing becomes a text diff a human can read. Storage drops ~99%. Cross-host
variance stops mattering, which also removes the fuzz tolerance that currently
hides small real regressions.

**M5 — collapse J3 to atlases, generated not committed.** Galleries become a few
on-demand atlas PDFs (5.7× cheaper) for browsing.

**How far M5 can go is capped by HARD RULE #9, and that cap is the real fork.**
An earlier draft of this note claimed committed PDFs could shrink "356 → ~20."
That was wrong. Measured: **109 of the 148 `examples/` decks carrying a committed
PDF are the 6–10 slide HARD RULE #9 shape**, and 107 files across `changelog.d/`
and `engineering/` reference them. `examples/` *is* HARD RULE #9 territory.

So there are two different ceilings:

| | Committed PDFs after | Requires |
|---|---:|---|
| Stop committing the **150 galleries** | 356 → **~206** | no rule change |
| Also generate HARD RULE #9 feature decks at PR/release time instead of committing them | 356 → **~20** | **amending HARD RULE #9** |

The second is a genuine trade, not a free win: HARD RULE #9's committed `.pdf` is
what makes the `raw.githubusercontent.com` review link work for an external
reviewer with no checkout. Generating on demand buys ~57 MB and the end of
documentation re-blessing, and costs that link unless CI publishes the artifact
somewhere durable.

### Answering the three questions directly

- **Why do we need them?** For J3/J4 we need *a few, current*. For J1 — the job
  driving the churn — we do not need them at all.
- **Too many?** Yes, and mis-aimed: 330 renders of `content`, zero of 16 themes.
  But the count is only reducible to ~206 without amending HARD RULE #9 — see M5.
- **One comprehensive PDF?** Directionally right and measurably cheaper (5.7×), and
  it is the right answer for *browsing*. But as a **regression** golden it inherits
  every flaw of the medium: still binary, still host-unstable, still silent about
  what moved, and it makes the leak worse — one file that every PR touches. Atlas
  for J3; snapshots for J1.

---

## 7. Corrections — hypotheses this investigation refuted

| # | I claimed | Measurement said |
|---|---|---|
| 1 | The per-deck fixed cost is browser launch + re-parsing the 1.5 MB inlined CSS; a persistent browser pool is the big win | **Refuted.** Browser launch is 207 ms and page reuse is worth 3%. `waitUntil` is 82%. The warm-page result that suggested otherwise had changed two variables at once |
| 2 | A component CSS edit leaves unrelated decks byte-identical, so incremental re-bless is the answer | **Half right, and not the answer.** The scoping holds under a controlled test (potent `quote` edit → quote gallery moves, `cycle` deck byte-identical). But history says it barely helps: of 17 PDF-rewriting commits in the last 50, **10 were cross-cutting base/theme** and only 2 component-scoped |
| 3 | My first negative control proved CSS scoping | **Invalid** — the probe selector (`.quote-spike-probe`) matched no element, so it proved nothing. Re-run with real selectors after the positive control failed and exposed it |
| 4 | Committed PDFs could shrink 356 → ~20 by keeping only HARD RULE #9 feature decks | **Wrong by an order of magnitude.** 109 of 148 `examples/` decks *are* HARD RULE #9 decks. Without amending that rule the floor is ~206, not ~20 (M5) |

---

## 8. Not measured here

- Whether `load` is safe on the **overflow corpus** and the auto-split path — 48
  artifacts is not the whole corpus.
- The **cross-host** Skia claim itself. It is asserted in `regression-gate.mjs` and
  `golden-diff.mjs` and is load-bearing for "pixels need a fuzz tolerance," but I
  found no measurement behind it. Snapshots make it moot; if pixels stay, it is
  worth one real two-host test.
- Snapshot behavior under auto-split and reflow, where element counts change.
- Whether atlas concatenation preserves per-deck front matter faithfully — the
  20-gallery spike produced 219 pages from 221 slide markers and emitted an
  overflow warning. A real atlas would be generated, not concatenated.
