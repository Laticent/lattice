---
status: proposed
summary: Lattice ships 12 Frames and 10 are sovereign, each welded by name to one component, so 59 of 69 components get one carve (standard, rail on or off). Three laws — one stage per component, chrome relocated never dropped, a published stage aspect band — turn the Frame into a vocabulary a component picks from, and the axis product bounds the catalog at ~30 distinguishable Frames. 28 are drawn; 6 of the 16 new ones change the argument rather than the shape.
---

# The Frame catalog — 28 Frames, and why the ceiling is about 30

**Date:** 2026-09-08
**Status:** proposed — design only. Nothing here is implemented.
**Extends:** `design/forms.md` (the canonical Form model — the vocabulary authority).
**Prototype:** `2026-09-08-frame-catalog/prototype.html` — all 28 drawn to true 16:9
at Lattice's real Form geometry, with per-Frame component fits and two scores.

---

## 1. The symptom

`design/forms.md` §5 says a Frame's `kind` is `root` (carves the slide, keeps the
chrome) or `sovereign` (claims the canvas, suppresses chrome Cells). Read as a
catalog, that promises a set of structures an author selects from. Read as shipped
code, it is something else.

`lib/forms/frame/` holds twelve manifests. Two are `root` — `standard` and
`minimal`, which is `standard` with the progress rail suppressed and is reached by
the `no-progress` chrome control rather than by name. The other ten are sovereign,
and **every one of them is named after, and reachable only by, the single component
of the same name**: `title`, `divider`, `closing`, `image`, `scene`, `math`,
`split-panel`, `split-compare`, `compare-code`, `premise`. The binding is `Set`
membership in `masthead.transform.js` (`FORM_TOGGLE_SKIP`), not declared data.

Measured across the 69 shipped component manifests:

| Component stage kind | n | Frames it can select |
|---|---|---|
| `flow` | 34 | 2 (`standard` · `minimal`) |
| `canvas` | 25 | 2 (same) |
| sovereign-bound | 10 | 1 (its own) |

Two manifests, but **one carve**: `minimal` is `standard` with the rail
suppressed, and §4 below concludes that chrome posture is a control rather than a
Frame axis.

So the axis that decides where the title sits, how tall the stage is, and where a
Key Insight lands has, for 59 of 69 components, one shape and a switch. That is the gap. The
sovereign Frames are not a layout vocabulary — they are per-component escape
hatches from chrome.

## 2. Why the sovereigns cannot be shared

They carve **two content Cells**. `split-panel` produces a panel and a supporting
zone; `compare-code` produces two code cells with their own titles. Only a
component authored for two cells can fill them, so the Frame and the component are
the same object under two names. A chart cannot ask for `split-panel` because a
chart has one body.

That is the mechanism behind the whole defect, and it is what the three laws
below fix.

## 3. Three laws

**Law I — one stage per component.** A Frame hands the component exactly one
contiguous stage Cell. Every other Cell it carves is frame-owned: chrome, or an
editorial band the Frame fills from parts the author already writes (`meta`, the
coda, the state stamp). A Frame that carves a second *content* cell is a different
family and admits only split-capable components.

**Law II — chrome is relocated, never dropped.** Title, running header, footer,
pagination, progress rail, meta, coda and the state stamp each get a declared home
in every Frame — even where that home is *silent*. Today eight sovereigns suppress
seven Cells apiece with no re-home, which is why `image` silently leaves the
pagination sequence and why a coda can vanish when a slide changes layout.

**Law III — the stage publishes an aspect band.** Each Frame declares the aspect
its stage resolves to at 16:9 and whether it admits `flow` bodies, `canvas`
bodies, or both. A component already declares which it is (`stage: "flow" |
"canvas"`, read by `masthead.transform.js`). Admissibility becomes derivable —
`frame.admits ⊇ component.stage`, minus a short per-Frame exclusion list for
wide-only bodies — instead of three hand-maintained `Set`s. This is `forms.md`
§7's `accepts` / `fits` pair finally doing work, and it is the same
manifest-is-the-contract move §11 already made for Cells and Tiles.

## 4. How many Frames can there be

Four axes describe a Frame. The raw product is 675; most of it is illegal,
invisible at slide scale, or already a knob elsewhere in Lattice.

| Axis | Values | Survives as a Frame axis? |
|---|---|---|
| Stage topology — full · banded · columned · mounted · bled · margined · dual · triple · poster | 9 | Yes. This *is* the Frame. |
| Masthead position — top band · left column · bottom · overlaid · absent | 5 | Yes, but only ~22 of the 45 pairs are legal |
| Chrome posture — full · no rail · silent | 3 | **No** — already a per-slide control (`silent`, `no-progress`) |
| Canvas treatment — flat · tinted · plated · bled · ruled | 5 | Partly — two are the `finish:` / `lift:` registers; three move a box |

675 → drop chrome posture as orthogonal (folding it in would triple every Frame)
→ 225 → keep only legal topology × masthead pairs → ~110 → collapse the treatments
that are really registers → **about 30 distinguishable Frames**. Two pairs among
those read the same at ten feet and one has no component that can fill it.

**Twenty-eight is the catalog.** The ceiling is low because a 16:9 rectangle read
for forty seconds does not hold more than three regions before it stops being a
slide.

## 5. The catalog

Twelve ship; sixteen are new. Six are artisan. Scores are design /10 and boardroom
fit /10, on the rubrics in the prototype; they are deliberately independent.

### Root — one contiguous stage, any admitted component

| Frame | Status | Carves | Admits | Design | Board |
|---|---|---|---|---|---|
| `standard` | ships | masthead band · stage · footer band | flow + canvas | 9 | 10 |
| `minimal` | ships | standard, rail suppressed | flow + canvas | 8 | 9 |
| `overline` | **new** | one-line ruled masthead (44px); stage +96px | flow + canvas | 8 | 9 |
| `column` | **new** | masthead as a 28% left column; stage full height | flow + canvas | 9 | 9 |
| `mount` | **new** | stage raised on a plate over a tinted ground | flow + canvas | 8 | 9 |
| `bleed` | **new** | stage to trim; chrome overlaid on scrims | canvas | 8 | 7 |
| `margin` | **new** | stage 63%; frame-owned editorial rail 24%, full height | flow + canvas | 9 | 9 |
| `plinth` | **new** | stage 37%; reserved 96px takeaway band below | flow + canvas | 9 | 10 |
| `foot` | **new** | stage on top; masthead band beneath it | canvas + flow | 7 | 7 |
| `quiet` | **new** | no masthead band; stage from top inset to footer reserve | flow + canvas | 7 | 8 |

Three of these carry most of the value:

- **`plinth`** is the shape of every chart page in every strategy deck ever
  printed — exhibit above, conclusion below, in a fixed position the eye learns by
  slide three. Today the coda lands at content height and moves per slide.
- **`column`** is the only Frame that gives a component a *tall* box. `piechart`,
  `radar`, `state-chart` and `cards-stack` all want squarer than 2.5:1 and have
  never had it.
- **`overline`** buys a quarter of the stage height back for the cost of a
  one-line title, which is what `gantt`, `map` and a fourteen-row table need.

`margin` is the one to watch: it re-homes the coda as a margin note, which is
where a source, a caveat and a "so what" belong in a diligence or legal deck. It
needs a coda or a meta line, or the rail reads empty.

### Dual stage — two content cells

| Frame | Status | Carves | Design | Board |
|---|---|---|---|---|
| `split-panel` | ships | tinted panel + supporting zone | 9 | 10 |
| `split-compare` | ships | two symmetric cells, centered divider | 8 | 9 |
| `premise` | ships | framing claim beside a ledger, one canvas | 8 | 9 |
| `compare-code` | ships | two code cells with their own titles | 8 | 7 |
| `recto` | **new** | figure well 32% + prose column 54%, shared masthead | 9 | 9 |
| `triptych` | **new** | three equal cells, two hairline dividers | 8 | 8 |

`recto` is the largest single gap. "A picture beside words" today means either
`image` (which claims the slide) or `split-panel` (which is a tinted panel, not a
figure). It is also the one Frame where two *different* components share a slide —
which is what the rejected frame-recursion branch was reaching for, in the flat
form `2026-06-18-frame-recursion-cells.md` explicitly blesses ("a flat split
layout — itself a Frame — whose cells host components").

### Poster — the stage is the canvas

`title` · `divider` · `closing` · `image` · `scene` · `math`, all shipping and all
correct as they stand. Two Law II gaps: `image` suppresses the page number, so a
full-bleed photo silently leaves the pagination sequence, and only `scene` carries
a stamp berth — a WIP marker on a title slide is a real need with nowhere to go.

### Artisan — the craft register

| Frame | Carves | Admits | Design | Board |
|---|---|---|---|---|
| `atelier` | stage on the golden section; title in the left void; folio in the outer margin | flow | 9 | 6 |
| `mat` | mounted plate in a bottom-weighted mat; engraved caption below | canvas | 9 | 7 |
| `manuscript` | one 54-character measure; wide right margin for notes | flow | 8 | 6 |
| `ruled` | double-ruled masthead; ledger rules through the stage; ruled folio cell | flow | 8 | 8 |
| `drafting` | hairline border and corner ticks; title block bottom-right | canvas | 9 | 7 |
| `colophon` | bottom-anchored left column under a deep void; mark top-right | flow | 8 | 6 |

Two of these earn their keep on function, not costume. **`drafting`**'s title
block is the only place in the catalog where meta, a revision marker and a WIP
stamp sit together and read as intentional rather than as clutter — it is the
answer to "where does the stamp go". **`ruled`** is the artisan Frame a bank will
approve: a ruled register reads as rigor, and it makes a fourteen-row table look
deliberate instead of crowded.

## 5.5 Not every Frame reframes

Twenty-eight shapes is not twenty-eight arguments. Measured against `standard`
holding the same content, each Frame changes exactly one of three things, and only
one of the three is a reframe.

| Changes | n | What moves | Frames |
|---|---|---|---|
| Fit | 3 | The box the body gets. The argument is identical. | `overline` `column` `bleed` |
| Register | 7 | Tone and craft. A table on a plate says what a table on a flat stage says. | `mount` + the six artisan |
| **Reframe** | 10 | **Reading order and rank** — what the audience meets first, what reads as claim and what reads as consequence. | `foot` `plinth` `margin` `quiet` `recto` `triptych` + the four shipped dual Frames |
| Punctuation | 6 | Structure in the deck, not argument on a slide. | the six posters |

**Six of the sixteen new Frames reframe, and a component can freely select all
six.** The clearest case is `foot`: same chart, same words, but in `standard` the
title is a label read *before* the evidence and in `foot` it is a conclusion read
*after* it. Assertion-first becomes evidence-first with no edit to the markdown.
`plinth` promotes the coda from a trailing note to a reserved structural
commitment; `margin` turns it from a concession at the end into an ongoing
qualification beside the body; `quiet` removes the stated thesis entirely and makes
the component argue for itself.

**Reframing is Law II's dividend.** Moving the title under the stage is a reframe
rather than a mutilation only because every chrome part still has a declared home —
the same authored parts, re-ranked. A Frame allowed to drop chrome would simply
lose the title, which is what the ten shipped sovereigns do today.

**Two limits worth stating.** First, the reframe is per-slide: the Frame is
selected by class, so "make this whole deck evidence-first" has no expression.
That wants a front-matter register beside `finish:` and `stamp:`, with per-slide
override — it is not in this catalog, and it is the obvious next question.
Second, reframing is an instrument, not a default. A deck that changes Frame every
slide makes the audience re-learn the grammar each time; the catalog's value is
that a deck can pick two or three deliberately, not that it can use twelve.

## 6. What it buys

Counting root and artisan Frames a component may freely select, derived by Law III
from the shipped manifests:

| | today | proposed |
|---|---|---|
| Median component, all 69 | 2 | 12 |
| `flow` components (34) | 2 | 13 |
| `canvas` components (25) | 2 | 12 |
| Lowest non-sovereign (`map`, `word-cloud`) | 2 | 9 |
| Sovereign-bound (10) | 1 | 1 |

The ten sovereign-bound components stay at one, and should: they are inherently
two-cell, and Law I says so.

## 7. Open questions, and what would be built first

Three questions are genuinely open and are not settled here:

1. **Does a Frame become author-selectable, or does a component declare a set of
   Frames it permits?** Law III makes either work. Author-selectable is the
   `forms.md` §7 promise; component-permits is safer and shippable sooner.
2. **Where does `margin`'s rail get its content when a slide has no coda?** Either
   the Frame refuses the slide (a lint warning) or the rail collapses and the stage
   widens. The second is friendlier and is a geometry change mid-deck.
3. **`bleed` overlaps `claim-bleed`.** The modifier already lets a body bleed; what
   is missing is the chrome half. That may be an extension to the modifier rather
   than a Frame.

If one thing is built first it is **`plinth`**, because it needs no new Cell — the
coda Cell already exists (`2026-08-24-universal-coda-cell.md`), and `plinth` is
that Cell given a reserved band and a hairline instead of content height. It is
the cheapest Frame in the catalog and the highest-scoring on boardroom fit.

## See also

- `design/forms.md` — the canonical Form model; §5 `kind`, §8 the catalogs, §9 the
  composition, §11 the manifest.
- `2026-06-18-frame-recursion-cells.md` — why frames do not nest in content cells,
  and the flat split it blesses instead.
- `2026-07-14-one-frame-model.md` — the three hand-maintained `Set`s Law III
  replaces, and the `stage: flow | canvas` field it reads.
- `2026-08-24-universal-coda-cell.md` — the coda Cell `plinth` and `margin` both
  re-home.
