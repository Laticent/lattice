---
status: proposed
summary: >
  The engine now EMITS the slide's own 1% (`--_sec-1cqi` / `--_sec-1cqh`) as CSS from
  the resolved `@size`, on every render path, instead of leaving the export to fall back
  to a bare `cq*`. That closes the two faces of the ICB leak #1243 left open: the exported
  HTML sidecar no longer tracks the window it is opened in, and the export stops disagreeing
  with the preview about which slides overflow. It also settles the engine-wide call the
  previous note deferred — the export was the flattering path, and it is corrected UP to the
  design size the token coefficients are defined against. A third leak, in JS rather than CSS,
  is fixed alongside: state-chart derived its geometry scale from a transform-scaled rect.
  Correcting the size up revealed that the shipped deck corpus was over-subscribed at design
  size. Measured over the 247 decks that actually ship — worked examples INCLUDING their
  subdirectories, every component and design gallery, the 46 exemplars, the baseline deck —
  `main` clips 43 slides across 31 decks. Those slides were ALREADY clipping in the preview
  on `main`; the export was hiding them. Every slide this change newly exposed is fixed, and
  a new on-demand ratchet (`npm run overflow:check`) holds the floor.
---

# The slide's geometry is emitted, not measured

**Date:** 2026-07-30
**Status:** proposed — carries an export-bytes change, so it needs sign-off (§6 is settled)
**Follows:** `2026-07-29-section-cq-icb-leak.md` (§7 "Still open" — this closes both items)

---

## 1. What was still broken after #1243

#1243 anchored the section's own `cq*` units to a stamp the RUNTIME writes
(`patchSectionGeometry`). That fixed every surface a script runs on. It left two
gaps, both recorded at the time:

- **The exported HTML sidecar stamps nothing at all.** Opened at a window that is not
  the slide box, every anchored token fell back to `1cq*` and resolved against the
  window: the bloom deck's section padding read `88px 64px 104px` at a 1280 window and
  `26.8125px 19.5px 31.6875px` at 390. The PDF was fine (the emulator sets the viewport
  to the slide); the HTML a human opens was not.
- **The export and the preview still disagreed about overflow.** On the 117-slide
  gallery the preview flagged **7** slides the export flagged **0**. "0 verdict flips"
  in #1243 was a within-browser number, and the doc said so.

Both have the same root: the export never had the stamp, so it never resolved a token
at design size.

## 2. The call

The previous note deferred it: "whether the export should stamp `--_sec-1cqi` or the
preview should stop is an engine-wide call." It is not actually a free choice.

**Stopping the stamp is not available.** The stamp is what keeps a section-own `cq*`
from falling back to the ICB. Remove it and the host viewport leaks back into the
slide's own padding — the exact bug #1243 fixed, reintroduced. So the only coherent
direction is to make every path carry the value.

**And it should not be measured at all.** The runtime stamp measures a box that the
engine already knows: `@size` resolves to a pixel geometry before a byte of HTML
exists (`geometryFor` / `resolveSize`). Emitting it as CSS makes every path agree by
construction rather than by whether a script ran, and it removes the JS dependency
for something as basic as a slide's padding.

So: `lib/engine/css.js geometryVarsCss(geometry)` emits

```css
article.lattice > section, section { --_sec-1cqi: 12.800px; --_sec-1cqh: 7.200px; }
```

into the engine's composed sheet AND the emulator's page template — one helper, both
paths (HARD RULE #1). The runtime stamp stays, as an INLINE override, which is exactly
the right precedence: it now differs from the emitted value only when the box genuinely
is not the authored one — the `--fluid` viewer, which unpins the slide on purpose.

**Two limits, stated rather than discovered later:**

- **Pixels only.** `@size` takes any CSS length, and `parseFloat('210mm')` is `210` —
  emitting `2.100px` for an A4 slide collapses every anchored token to a quarter of its
  intended size (body type at 3.5px, measured). A unit we cannot convert without a
  layout gets no stamp at all; the `1cq*` fallback is wrong by 11%, a wrong stamp is
  wrong by 4×. No shipped theme is non-px, so this is a latent path, guarded.
- **Export-to-Marp does NOT get the stamp.** `lib/core/marp-bundle.js` ships the
  pre-built `dist/lattice.min.css`; a per-render helper cannot reach it. Before this
  change both paths were unstamped and therefore agreed; after it, the Lattice PDF is
  corrected and the Marp one is not, unless the runtime executes. That is a new
  asymmetry in a change whose purpose is path agreement, and it is not closed here.

## 3. What this changes in the export, and why it is a correction

The token coefficients are defined against the slide: "px / 1280 * 100 = coefficient"
(`base.tokens.css:688`), and `lib/typography/scale.js:37-71` says the same — "coefficients
are curated to target px on each category's reference width (landscape ≈ HD 1280 →
1cqi=12.8px)". With no stamp, a `cq*` on stage content resolved against the section's
CONTENT box — 1152px at HD — so the export rendered stage type and spacing **~11%
smaller than the design**. The preview never did, because the runtime stamped.

Measured on the bloom deck, export path, at a 1280×720 window:

| | before | after |
|---|---|---|
| body type | 19.24px | **21.38px** |
| section padding, window 1280 | `88px 64px 104px` | `88px 64px 104px` |
| section padding, window 390 | `26.8125px 19.5px 31.6875px` | **`88px 64px 104px`** |

The ratio is uniform: across 316 elements of the bloom sidecar, 164 computed font sizes
change and **every one by exactly 1.1111** (= 1280/1152). That uniformity is the evidence
that this is one systematic basis error, not a pile of layout bugs.

`engineering/gotchas.md` already ruled on which path was right — "Do not trim to the
preview and assume the export is the truth — it is the flattering one" — and this is that
ruling, applied.

**One honest caveat about that ruling.** It was written about overflow-verdict fidelity
between two browser surfaces, not as a design decision about the descendant basis. The
preview's 1280 basis for DESCENDANTS was a side effect of `patchSectionGeometry`, whose
own comment says it exists to fix SECTION-OWN properties in the VS Code webview. Nobody
chose the 11% descendant inflation. It happens to coincide with `scale.js`'s declared
intent — which is why the direction is defensible — but the argument is weaker than
"the docs already ruled" makes it sound.

## 4. The fallout, measured over the whole corpus

This number was wrong twice before it was right, and both mistakes are worth recording
because they are the same mistake.

**First** the note claimed "14 slides across four decks … in full" — measured over a deck
list of four. **Then** it claimed 53 newly-clipping slides and a finish at "12, below main's
15" — measured over a 185-deck glob that silently excluded `exemplars/**` (46 worked decks
that ship committed PDFs AND are bundled into the docs Playground), every `examples/`
SUBDIRECTORY, and `design/*.gallery.md`. Both times the denominator was a set someone
remembered rather than the set that ships, and the second time the gate I had just built
was the thing enforcing the wrong denominator — so it went green while ~45 slides clipped
outside its view.

The corpus is now the decks that ship: **247**. Measured on both trees through the real
emulator, reading its own `⚠ OVERFLOW` report:

| | decks clipping | slides clipped |
|---|---|---|
| `main` | 31 | 43 |
| this branch, before the content pass | 41+ | 88 |

**The lesson, stated for the next person:** a fit gate is only as honest as its glob. If you
add a render surface, add it to `corpus()` in `tools/check-overflow-corpus.js` in the same
change, or the gate will certify a corpus it cannot see.

**Fixed here (12 decks, all to zero):** `q-and-a` (2), `inventory` (2), `gallery-jargon` (3),
`baseline-decks/gallery` (7), `auto-split` (2), `kanban-chart-redesign` (4), `map` (3),
`policy-recommendation` (2), `read-across-carousel` (3), `split-envelope` (2),
`staged-flow` (2), `universal-pill` (2).

**Then fixed: every slide the widened corpus exposed**, tracked by `npm run overflow:check`
— 26 in `examples/token-contrast/` (13 byte-identical theme decks), 23 across 15 exemplars,
2 in the design-system gallery. The ratchet is
re-blessed at that lower floor. How the trims were chosen, and the one class of edit that
was rejected, is §6.

Two things learned while trimming, worth writing down because they cost time:

- **Most of these boxes are padding-dominated, not text-dominated.** Shortening a
  sentence that does not cross a line boundary changes nothing. The levers that move a
  padding-dominated box are structural: drop a garnish (a caption, a pull-quote, an
  eyebrow band), or drop a row.
- **A caption or blockquote cannot shrink below its own padding.** `.chart-caption` is
  218px at 4K with a single line of text — 96px of that is padding. Rewriting the
  sentence is wasted effort; removing the element is the only lever.

And one thing learned the hard way: **in a component-documentation deck, the garnish IS
the demo.** A first pass at these trims removed a documented required slot from
`pricing` (the marker-less audience line, which has its own `whenToUse` and anti-pattern
entries) and cut `logo-wall` to six marks against its own docs' "fewer than six looks
thin". Both were reverted. Trimming a specimen deck is not prose editing.

## 5. The third leak: a JS measurement, not a CSS unit

With the CSS tier closed, a viewport sweep of the gallery still showed computed values
moving with the host window — all inside `section.state-chart`. The cause was not a `cq*`
at all: `state-chart.transform.js` derived its geometry scale from
`section.getBoundingClientRect().width`, the VISUAL box. On a host that transform-scales
the section to a preview pane, that read 695px instead of 1280 and every px constant in
the diagram shrank with the pane.

Fixed the same way the overflow probe was: read the slide's 1% from the stamp
(authoritative, unit-safe), and normalize every rect the drawing pass consumes back to
layout px through a single `VIS` factor (`rectL`). After it, the sweep reports **0**
viewport-dependent values on all 117 gallery slides.

**That fix had a bug of its own, caught by the trio and worth recording**, because it is
the same class as the defect it was fixing: `rectL` normalized `figRect` but the fit-scale
ratio at the end of the pass still read a RAW rect for the other operand, so `k` collapsed
to the pane's own scale and the diagram was scaled by the pane twice. Measured on the real
Playground at `secVis=0.543`: `fitK` **0.475** where it should be **0.8748** (0.475 =
0.8748 × 0.543, exactly). Both operands are layout px now.

**The pattern is four-for-four**: the overflow probe, the figure-legibility probe,
state-chart's scale factor, and state-chart's fit ratio all had the same defect — a
`getBoundingClientRect()` mixed with a transform-blind number. Anything that measures a
slide should read the stamp or `offsetWidth`, never a rect, unless it normalizes — and
when it normalizes, BOTH sides of every ratio have to move.

## 6. The fork, and how it was settled

The first cut of this change left 53 slides across 33 decks clipping at design size and
put three options to the human. **Option 1 — finish the trims — was chosen, and it is
done.** The corpus is now at **12 clipped slides, below `main`'s own 15.**

**The fact that decided it.** Those 53 slides were not created by this change. On `main`,
the PREVIEW already flagged them; only the export hid them. Measured by applying `main`'s
own runtime stamp to `main`'s own exported HTML — no engine change involved — and
comparing against this branch's export:

| deck | `main` PDF says | `main` PREVIEW says | this branch's PDF said |
|---|---|---|---|
| `evidence/kpi.gallery` | 8 | 2, 3, 7, 8, 9, 11 | 2, 3, 7, 8, 9, 11 |
| `legal/legal.gallery` | 6 | 5, 6, 7, 23, 25 | 5, 6, 7, 23, 25 |
| `chart/roadmap.gallery` | 3, 4 | 2, 3, 4, 5, 7, 8, 10 | 2, 3, 4, 5, 7, 8, 10 |
| `connect/contact.gallery` | — | 2, 3, 4 | 2, 3, 4 |

Page for page, the export equalled `main`'s preview. The catalog was already
over-subscribed for every Playground and Studio user; the export had simply been
concealing it. So the honest move was to fix the content, not to re-normalize the type
scale away from its documented pt values (option 2) — which would also have shrunk every
preview by 11% to match a render nobody chose.

**What the trims actually cost, and the four levers that worked.** In order of how often
they were the answer:

1. **Unwrap a line.** A wrapped line costs ~25-40px at HD and ~65-190px at 4K. But
   shortening prose only helps if it crosses a line boundary — and in decks that write a
   paragraph across several source lines, single newlines render as hard `<br>`, so line
   count tracks SOURCE lines, not text width. In those decks the lever is "join lines",
   not "shorten words". Several first-pass edits measured *identical* to baseline before
   this was understood.
2. **Drop a garnish** — an eyebrow, a lede, a caption, a below-note. Worth ~45-70px at
   HD. This carried most of the chart-family slides, whose tiles and rows are sized by a
   hero numeral or a fixed grid and so do not respond to text edits at all.
3. **Correct a stated ceiling.** Several stress specimens asserted a capacity that is no
   longer true at design size — roadmap's "four workstreams by five phases", agenda's
   "seven stops", list-tabular's "eight rows", content's "two paragraphs and a list".
   Each was reduced AND its headline rewritten, so the slide still tells the truth.
4. **Drop a row or item** — last resort, used where the box was padding-dominated.

**One class of edit was rejected outright:** removing the thing a specimen exists to
demonstrate. A first fast pass deleted `pricing`'s marker-less audience line (a documented
required slot with its own `whenToUse` and anti-pattern entries) and cut `logo-wall` to
six marks against its own docs' "fewer than six looks thin". Both were reverted, and both
turned out to be unnecessary anyway — see §6.1.

### 6.1 A gate that was measuring nothing

Three manifest samples (`pricing`, `logo-wall`, `regulatory-update`) appeared
over-subscribed only because the component-invariant suite was asserting against an
unstyled stack: `test/helpers/semantic-render.js` pinned `form: off`, and `mastheadLift`
is also what wraps a slide's body into the frame's `.cell-stage` cell, which every
stage-migrated component keys its whole layout off. With form off those selectors matched
nothing. logo-wall's eight marks measured 547px as a `display:block` list where the real
component tiles them into a 400px flex wall with 90px to spare (`form: on` → 0px over,
measured). The samples were fine; the harness was blind. Fixed at the harness, with the
slot matcher treating the Form cells as transparent — 265/265 pass, and the assertion now
means what it says.

### 6.2 Still open, deliberately

`examples/overflow-fix-me.md` clips 5 pages, up from 3 on `main`. That deck exists to
demonstrate the overflow overlay — its own prose says so — and the two new pages are the
export catching up to what the preview always showed. Re-baselined rather than trimmed.

**Three capacity ceilings ARE corrected here, because a gate forced the issue.**
`gallery-contract.test.js` requires a stress specimen to sit inside `[soft+1, hard]`
and the default sample to land at or under `soft`, so trimming those specimens made
the stale ceilings fail loudly rather than silently:

| component | before | after | measured basis |
|---|---|---|---|
| `roadmap` | soft 5, hard 7 | **soft 5, hard 5** | five columns — the label column plus four phases — is what renders; `examples/portrait-roadmap.md` sits exactly there |
| `agenda` | soft 6, hard 7 | **soft 6, hard 6** | seven stops clipped once the export stopped rendering 11% small |
| `policy-recommendation` | sweet 3, soft 3, hard 4 | **soft 3, hard 3** | three evidence pairs is both the target and the ceiling |

Those three are the ones the gate could see. The rest of the catalog is not re-derived.

**Not done here, and it should follow:** every `capacity` and `density` ceiling in the
manifests was measured THROUGH the export by `tools/calibrate-capacity.js` /
`calibrate-density.js` (`tools/lib/calibrate-core.js` parses the same `⚠ OVERFLOW` line),
so they are all ~11% too generous, and `lib/core/auto-split.js`,
`lib/authoring/lint-core.js` and `dist/docs/components.json` all consume them. The stress
specimens corrected in this PR are the visible tip. `2026-07-28-capacity-basis.md` is
already open on exactly this question and is where it belongs.

## 7. Verification, and the gate that was missing

- **`tools/check-geometry-parity.js`** (new, `npm run geometry:check`): renders each deck
  through the real emulator, loads the real exported HTML in real Chromium at 1280×720,
  900×700, 500×700 and 390×844, and asserts the section padding, stage height, overflow
  verdict and overshoot are identical on every one — optionally with the sections
  transform-scaled the way a preview pane scales them (`--scaled`). 50 slides across five
  decks (HD prose, 4K gallery, charts, portrait) pass on both modes. Run against `main` it
  reports **477 disagreements** and exits 1, which is the check that it checks something.
  It refuses to report success if it measured zero slides.
- **`tools/check-overflow-corpus.js`** (new, `npm run overflow:check`) — **this is the gate
  whose absence let §4 happen.** Nothing in this repo measured corpus-wide fit:
  `build:galleries:check` verifies the gallery PDFs are current, not that they are clean,
  and the integration tier asserts page counts, not fit. So an engine change could add fifty
  clipped slides across decks nobody opened, regenerate their committed PDFs, and go green —
  which is exactly what the first draft of this change did. It is a per-deck ratchet against
  `test/integration/overflow-baseline.json`, committed at **`main`'s numbers (10 decks / 15
  slides)**, so it fails on this branch and names precisely what is outstanding. On-demand
  rather than blocking, for the same reason `bench:check` is (HARD RULE #19): a full sweep is
  185 real renders.
- **The component-invariant suite now measures a laid-out component.** Three of its overflow
  assertions went red on this branch (`pricing`, `logo-wall`, `regulatory-update`), and the
  obvious response — trim those manifest samples — would have been wrong. The harness pinned
  `form: off`, which also strips the `.cell-stage` cell every stage-migrated component keys its
  layout off, so the suite was measuring an unstyled `display:block` stack: logo-wall's eight
  marks at 547px where the real component tiles them into a 400px flex wall with 90px to spare
  (`form: on` → 0px over, measured). The samples were fine; the harness was blind. Fixed at the
  harness, with the slot matcher treating the Form cells as transparent. 265/265 pass, and the
  assertion now means what it says.
- **Overflow parity:** the export's flagged set now equals the preview's, deck for deck (§6).
- **The state-chart fit fix** was verified on the real docs Playground, not a harness
  (HARD RULE #23) — A/B against `main`'s runtime in the same served bundle.
- Gates: `lint`, unit, `build:check`, integration, and the ownership gate.

## 8. What this does NOT close

- **The 53 slides in §6.** Named, measured, and enforced by the ratchet — not fixed.
- **Export-to-Marp** does not carry the stamp (§2). New asymmetry, not closed here.
- **The PPTX/PNG raster paths** go through the same emulator page, so they inherit the fix,
  but their bytes change with it and they are not separately asserted.
- **Committed PDF staleness.** 122 gallery PDFs are rebuilt here; the rest of the ~329
  committed PDFs are stale against a change that alters every exported byte. That follows the
  repo's existing convention for an engine-wide render change — but note it is not only stale
  bytes: `examples/social-portrait.pdf` is committed at 8 pages and the engine now produces
  **10**, because auto-split divides differently at the corrected size.
- **A deck's `style:` front matter can still override the emitted stamp** and silently
  reintroduce the leak, at any value, with no gate. Author escape hatch by design; worth a
  lint rule.
- **`--fluid`** deliberately re-derives the box; the runtime override is what makes that
  work, and this note does not change it.
