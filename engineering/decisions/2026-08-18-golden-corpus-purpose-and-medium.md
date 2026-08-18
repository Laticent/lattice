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

---

## 9. Scoring the options

Added 2026-08-18 in response to "evaluate and score each option."

**The options are nested, not exclusive:** Option 1 ⊂ Option 2 ⊂ Option 3. The real
question is how far along one path to walk, and the walk can stop anywhere.

### 9.1 The measurement that decides it — git growth per re-bless

One gallery, one real CSS change, committed twice into a scratch repo and `gc`'d:

| Medium | `.git` after v1 | after re-bless | **growth** |
|---|---:|---:|---:|
| PDF | 192,990 B | 206,958 B | **13,968 B** |
| Text snapshot | 31,391 B | 32,153 B | **762 B** |

**18.3× less history growth per re-bless.** Note this also *corrects* the 2026-08-16
assessment's claim that a re-render "writes a full new blob": git delta-compresses
PDFs better than that (13,968 B, not 197,994 B). The 18× ratio is the robust
finding; the absolute per-commit total scales with how much the change actually
moved.

Corpus split, for scaling: **150 gallery PDFs = 1,334 pages / 48 MB**;
**examples + exemplars = 2,095 pages / 73 MB**.

### 9.2 Criteria and weights

| Criterion | Weight | Why this weight |
|---|---:|---|
| Re-bless burden removed | 30% | the stated pain |
| Detection quality | 20% | D1 — the gate currently cannot fail; a fast wrong gate is worth nothing |
| Review-diff integrity | 15% | #1730 — authors explaining pixels they did not move |
| Speed of the loop | 15% | paid on every PR |
| Storage / history | 10% | 67% of the tree, 65% of recent growth |
| Build cost & risk (inverse) | 10% | effort, blast radius, reversibility |

### 9.3 Scores

| | Burden .30 | Detect .20 | Review .15 | Speed .15 | Storage .10 | Risk .10 | **Total** |
|---|---:|---:|---:|---:|---:|---:|---:|
| **Today** (baseline) | 0 | 0 | 0 | 3 | 0 | 10 | **1.45** |
| **1 — quick wins** | 2 | 9 | 4 | 7 | 1 | 9 | **5.05** |
| **2 — snapshots for galleries** | 6 | 9 | 8 | 8 | 6 | 5 | **7.10** |
| **3 — + amend HARD RULE #9** | 9 | 9 | 9 | 8.5 | 9 | 2 | **8.23** |

Detection is 0 today because `build:galleries:check` is structurally incapable of
failing on staleness committed into HEAD — verified: it reported 122 green while
`quote.gallery.light` carried 17,044 drifted pixels.

### 9.4 Marginal value, and why the ranking is not the recommendation

| Step | Total | **Marginal gain** | Marginal risk |
|---|---:|---:|---|
| → 1 | 5.05 | **+3.60** | negligible, reversible |
| → 2 | 7.10 | **+2.05** | contained (one tool), reversible |
| → 3 | 8.23 | **+1.13** | rule amendment, 107 referencing files, breaks the raw-URL review link |

**Value falls while risk rises.** Option 3 wins on total and loses on marginal
economics.

**Sensitivity.** Re-weighting risk 10% → 25% (from burden and storage):

| | Total (risk-averse) |
|---|---:|
| 1 | 5.90 |
| 2 | 6.85 |
| 3 | **7.20** |

Option 3 still leads, but the gap over 2 narrows from 1.13 to 0.35 — inside the
noise of a judged scoring exercise. **The 2-vs-3 ranking is weight-sensitive; the
1-vs-2 ranking is not.** That asymmetry is the finding: walking to 2 is robustly
right, walking on to 3 is a genuine judgment call about how much the
`raw.githubusercontent.com` review link is worth.

### 9.5 The design competition, scored honestly

It does not belong in the table — it produces a *decision*, not an outcome, and
would score ~1 on axes it does not act on. Judge it as expected value instead: it
pays only if there is a real chance the architecture is wrong. The measurements
have already settled the load-bearing facts (cost is per-deck not per-slide; the
medium is the lever; the gate cannot fail), so the residual uncertainty is
implementation detail — coordinate scheme, property set, where the pixel backstop
sits — which is cheaper to resolve by building than by deliberating. **Estimated
EV: negative against its fan-out cost.** The adversarial budget is better spent on
maker-checker review of the actual snapshot tool, which is where a mistake would
really hurt.

### 9.6 Recommendation

**Walk to 2, stop, and re-evaluate 3 with evidence.** Sequence: M2 first (it is the
only thing that stops the bleeding and is a precondition for everything), then M1
(free speed, never wasted), then M3, then snapshots for the galleries. Hold the
HARD RULE #9 amendment until snapshots have earned trust on the corpus that was
designed for them.

---

## 10. The reframe that supersedes §6 — let each owner bless what it owns

Added 2026-08-18, from the observation that the codebase is *already* layered by
ownership: engine and `lattice.css` own positioning, themes own color and contrast,
components own their own look and their token choices.

**The finding: the codebase is layered and machine-gated. The verification is
monolithic.** A committed PDF is a fully composed artifact — it mixes every owner's
contribution into one blob of pixels. So a change by *any* owner invalidates *every*
blob, and nothing can be inferred without re-rendering. The goldens flatten a
well-factored architecture back into an undifferentiated one, then pay to re-derive
the factoring on every change.

### 10.1 This is not hypothetical — one layer already does it

Setting `--brand-canvas` to a bad value in `themes/indaco.css`:

```
✗ 30 `--hljs-*` syntax color(s) fall below the 4.5:1 AA floor on their own --code-bg:
  --hljs-comment #92a8a8 on --code-bg indaco-dark/light #663d00 = 3.76:1;
  --hljs-keyword #c792ea … = 3.91:1; … +22 more.
  Lift the value in OKLCH holding hue and chroma rather than picking a new colour by eye.
build aborted: ownership guard failed.
```

**4.6 seconds. Named tokens, measured ratios, a prescribed fix. Zero PDFs
rendered.** The same defect reaching the PDF corpus costs a full re-render
(~7 min at P=4) and reports "N pixels changed" with no attribution.

The palette owner already blesses its own contract — `palette:bless` writes
`KNOWN_SUB_THRESHOLD` and `CVD_FROZEN`, keyed and **ratchet-only**, as text. That is
exactly the per-owner blessing this section argues for, already load-bearing.

### 10.2 The ownership map — who already blesses, and the one gap

| Owner | Owns | Already has its own bless/gate? |
|---|---|---|
| Palette / theme | color, contrast, CVD separation | **yes** — `palette:bless`, `composed-contrast.js`, `cvd-trio-floor` |
| Tokens | names, typography scale, crosswalk | **yes** — `checkTypographyTokens`, `checkRetiredTokenNames`, `css-token-resolution` |
| Layout CSS | no hex, no margin, no partial layers | **yes** — `checkHexLiterals`, `checkMarginDiscipline`, `checkCascadeLayers` |
| Fit / overflow | split, overflow envelope | **yes** — `overflow:bless` |
| Geometry | scaled positioning parity | partial — `check-geometry-parity.js` |
| **Composition** | does a component, under a theme, in the engine's layout, actually paint the right token in the right box? | **NO — this is what the 356 PDFs are really covering** |

**Almost every layer already blesses itself cheaply and in text.** The PDFs are
genuinely covering exactly one uncovered thing: *composition*. And the §5 snapshot
is precisely a composition golden — per element, per slide, geometry plus resolved
style. The two ideas converge: **the snapshot is the composition owner's missing
bless.**

### 10.3 Is it transitive? Yes — and here is exactly why, and where it leaks

Transitivity holds when a layer's golden is a **complete** description of what
downstream can observe about it. Here it is, because **HARD RULE #3 is gated at
budget 0** (`checkHexLiterals`, 5 sanctioned entries): layout CSS reaches color
*only* through `var(--token)`. So an unchanged token table means no deck can have
changed for theme reasons — provable without rendering anything.

Measured, the two channels separate cleanly:

| Change | Geometry rows moved | Style rows moved |
|---|---:|---:|
| color token (`--brand-canvas`) | — | style only |
| **length token (`--sp-lg`)** | **36** | **0 beyond those 36** |

So tokens do exactly two things, and the snapshot's two channels correspond to
them one-for-one. That yields a free defect check: **a color-only PR whose geometry
channel moved is a bug**, flagged automatically.

**Where transitivity leaks — do not oversell it:**

1. **Themes are not purely color.** A theme that touches a length token moves
   layout (36 rows above). "Theme changed ⇒ only color changed" is false.
2. **Emergent composition.** Overflow, auto-split and slide-count changes are
   properties of a whole deck, not of any one owner. `overflow:bless` covers part.
3. **An owned gate can verify a contract the render does not honor.** The contrast
   gate's own note says it: *"these values may not be rendering today — the export
   loads the base AFTER the theme, so a theme's syntax colors are dead on the export
   path until #1527's concat flip lands."* A layer can be green while the composed
   artifact is wrong. **This is the strongest argument against going fully
   compositional**, and it comes from this repo's own code.

### 10.4 What this changes about the recommendation

§6's options were framed as *"which medium for the golden."* The better frame is
*"which owner blesses which contract, and what does the composition owner need."*
That reorders the work:

- Most owners **already** bless themselves — the win is not building that, it is
  **stopping the PDFs from re-verifying it** at 1000× the cost.
- The composition layer is the only real gap, and the §5 snapshot fills it.
- A **thin** end-to-end pixel set must survive, precisely because of leak (3) — but
  it can be small and deliberately chosen, not 356 artifacts and 4,009 pages.

**Revised shape:** per-owner blessing where an owner exists (mostly already true) ·
snapshots for composition · a thin pixel backstop for the end-to-end claim · PDFs
kept only as human artifacts under HARD RULE #9.

This does not change the §9 scores — it changes what Option 2 *is*. "Snapshots for
galleries" is better understood as "give the composition layer the owned bless every
other layer already has."

---

## 11. The completed ownership map, and what is actually left for a render to prove

§10 argued each owner should bless what it owns. Counting them, **the repo already
has 70 owned gates** (`function check*` in `tools/check-ownership.js`), and they all
run in **6.6 seconds**. The 356 PDFs take ~7 minutes at P=4 and are currently 100%
stale.

**Nobody ever went back to subtract.** The owned gates grew over time; the PDF
corpus grew alongside them; no one asked what was left for the PDFs to prove.

### 11.1 The owners

Beyond engine / themes / components, the gate names reveal owners worth naming
explicitly — several have no obvious home in a "CSS, themes, components" model:

| Owner | Owns | Example owned gates |
|---|---|---|
| Engine / layout | positioning, section box, stage inset, size registry, z-planes, container anchoring | `checkLayoutOwnership`, `checkSectionBoxOwnership`, `checkStageInsetOwnership`, `checkZPlanes`, `checkSectionCqAnchoring`, `checkMarginDiscipline` |
| Themes | color, modes, roles, token parity, identity | `checkThemeRoles`, `checkThemeModes`, `checkThemeTokenParity`, `checkThemeIdentity` |
| Tokens | names, typography scale, fallbacks, phantom/dangling reads | `checkTypographyTokens`, `checkRetiredTokenNames`, `checkPhantomTokenReads`, `checkNoSafeDefaultTokens` |
| Components | CSS shape, names, variants, adapt + density declarations | `checkComponentCss`, `checkVariantDeclaration`, `checkAdaptDeclarations`, `checkDensityCoverage` |
| **Transformers** | DOM shaping — moves the render with **no CSS diff at all** | `checkTransformerNames`, `checkRenderNature` |
| **Forms** | the composition vocabulary (`lib/forms`) | `checkSolverIntentDeclared` |
| **Treatments / finishes** | tint, mark, background layers | `checkBackgroundLayerVars`, `checkAnimaColorVocabulary` |
| **Textures** | the categorical texture channel | `checkCatInkDeclared`, `checkCatInkFallback`, `checkCatContrast` |
| **Syntax highlighting** | `--hljs-*` on its own backgrounds | `checkHljsContrast`, `checkSyntaxInkContrast`, `checkHljsSeparation` |
| **Diagrams / math** | mermaid scoping, renderer parity | `checkDiagramScopeSelectors`, `checkMathRendererParity` |
| **Typography / fonts** | metric pinning, voice fonts | `checkFontMetricsPin`, `checkLabelVoiceFont` |
| **Export / runtime** | document + markup sinks, style guards | `checkDocumentStyleSinks`, `checkRuntimeMarkupSinks`, `checkPreviewHtmlSinks` |
| **Satellite libraries** | Anima · Cadenza · Lente · Suono · Vetrina boundaries | `check*Boundary` (five of them) |

Two of these are the ones easiest to forget and matter most here: **transformers**
(a transform change reshapes the DOM with no CSS diff, so no CSS gate can see it)
and **forms** (composition is a vocabulary with its own rules).

### 11.2 The residual — precisely what a render still has to prove

All 70 gates are **static**. Verified: `tools/check-ownership.js` contains no
`puppeteer`, no `page.goto`, no `getBoundingClientRect`, no `getComputedStyle` — the
only four textual matches are comments. They read source and check *declarations*.

Four things they therefore cannot see, by construction:

1. **The cascade's resolved value in context.** `checkPhantomTokenReads` finds a read
   with no declaration; it cannot say what the cascade actually resolved to for a real
   element on a real slide.
2. **Real geometry.** No static gate measures a box. HARD RULE #20 exists *because*
   measurement matters — and nothing static can measure.
3. **Emergent deck behavior.** Overflow, auto-split, slide count are properties of a
   composed deck, owned by nobody.
4. **Composition order.** The contrast gate says it itself: *"the export loads the base
   AFTER the theme, so a theme's syntax colors are dead on the export path."* Declared
   contract ≠ rendered result.

**That residual is the entire remaining job of a render** — and items 1–3 are exactly
the three channels one snapshot pass emits (resolved style · geometry · row and slide
counts). Item 4 is the one that genuinely needs pixels, and it needs a *thin*,
deliberately chosen set — not 356 artifacts and 4,009 pages.

### 11.3 So, answering the question directly

> *Why are we having PDFs do the re-blessing instead of the owners?*

We aren't, mostly — **70 owners already bless themselves in 6.6 seconds.** The PDFs
are a second, monolithic pass that re-derives what those gates already proved, plus
the four-item residual above. The re-blessing pain is the cost of never having
subtracted the first from the second.

> *Would owner-blessing be faster, cheaper, transitive?*

Faster and cheaper: **6.6 s against ~7 min**, already demonstrated in-tree. Transitive:
yes, and soundly, because HARD RULE #3 is gated at budget 0 (§10.3) — with the three
leaks recorded there, of which composition order is the one that keeps a thin pixel
set alive.

### 11.4 Next step

The work is not "build per-owner blessing." It is:

1. **Give composition its owned bless** — the §5 snapshot, covering residual 1–3.
2. **Subtract.** Retire the PDF checks that duplicate a static gate, and say per PDF
   class what it is still for.
3. **Keep a thin pixel set** for residual 4, sized deliberately.
4. **Make staleness detectable** (§6 M2) — otherwise all of the above rots the same
   way the current corpus did.
