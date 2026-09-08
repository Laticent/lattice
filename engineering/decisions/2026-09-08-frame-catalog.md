---
status: proposed
summary: Lattice ships 12 Frames and 10 are sovereign, each welded by name to one component, so 59 of 69 components get one carve (standard, rail on or off). Three laws turn the Frame into a vocabulary a component picks from. A first cut drew 28 Frames; its own derivation then showed 11 of the 16 new ones changed how a slide LOOKS rather than what it ARGUES, which is the Finish axis Lattice has shipped since 2026-06-11 — two were near-duplicates of shipped `finish:` backdrops. Corrected to NINE Frames, one per distinct reading (order/rank/arity), plus a contract for the Mode axis the other eleven belong to: six channels, seven clauses, and the argument that a persona is not a style — a deliverable is, which collapses ~14 team personas onto ~6 postures.
---

# The Frame catalog — nine Frames, and a contract for the Mode axis

**Date:** 2026-09-08
**Status:** proposed — design only. Nothing here is implemented.
**Extends:** `design/forms.md` (the canonical Form model — the vocabulary authority).
**Prototype:** `2026-09-08-frame-catalog/prototype.html` — the nine drawn to true
16:9 at Lattice's real Form geometry, with carves, component fits and two scores.

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

**That derivation is kept because its method is right and its scope was wrong.**
It counted *canvas treatment* as a Frame axis, and treatment is Finish (§5.1). Strip
it and the same arithmetic lands on **nine Frames** — one per distinct reading — with
the treatments moving to the Mode axis, where they multiply against the nine rather
than inflating them. The ceiling is low either way because a 16:9 rectangle read for
forty seconds does not hold more than three regions before it stops being a slide.

## 5. The catalog is nine Frames, not twenty-eight

The first cut of this note drew 28. Deriving each Frame's reframe set from three
atoms — `order`, `rank`, `arity` (§5.2) — then reported, as a side result,
that `atelier`, `ruled`, `mount`, `column`, `overline` and `bleed` all read
`before/thesis/1`: **the same reading as `standard`**.

That result was the answer, and it was filed as a footnote. A Frame that does not
change the reading is not a Frame — it is a **treatment**, and Lattice already owns
an axis for treatments.

### 5.1 The axis error

`design/design-system.md` owns a **four-axis** model — Function · Form · Substance ·
**Finish** — and Finish answers "what should it feel like?". It is surfaced through
three composable registers: `theme:` (color), **`mode:`** (the typographic and
geometric hand), `finish:` (the backdrop layer stack). Eleven of my sixteen new
Frames were `mode:` values wearing a Frame's clothes, and two were near-exact
duplicates of shipped code — HARD RULE #15, broken:

| Sheet-01 entry | Actually | Belongs |
|---|---|---|
| `ruled` | treatment | ships as `finish: ledger` — "fine horizontal ruled lines + a bold left margin bar + a top-right corner fold" |
| `mat` | treatment | ships as `finish: gallery` — "a museum inset keyline frame + a spotlight" |
| `atelier` | treatment | overlaps `finish: savile` / `atrium` |
| `drafting` · `manuscript` · `colophon` · `mount` | treatment | `mode:` values |
| `overline` · `column` · `bleed` | **carve variant** | variants of `standard` — same reading, different box |
| `recto` | **carve variant** | a variant of `panel` — a canvas well, not a tinted panel |

Five survive as Frames: `margin`, `plinth`, `foot`, `quiet`, `triptych`.

### 5.2 The three atoms, and the boundary they draw

Reframing is a **relation between two Frames**, not a property of one — "`foot`
reframes" is meaningless without saying reframes *from what*. So each Frame declares
three atoms and the relation derives from them, rather than from a hand-kept edge
list (over 28 nodes that was 756 pairs to keep honest, and it drifts the moment a
Frame's geometry changes):

| Atom | Values | Decides |
|---|---|---|
| `order` | `before` · `after` · `none` | Whether the thesis is met before the evidence, after it, or not at all. A left column is `before` — it is still read first. |
| `rank` | `thesis` · `takeaway` · `margin` · `none` | What holds the reserved, emphasized position. |
| `arity` | `1` · `2` · `3` | How many things the slide asserts. |

**A reframes to B when they admit a common content pool and differ on at least one
atom.** Equal on all three and they are the same argument in a different treatment.
That gives the boundary:

> **Does it change `order`, `rank` or `arity`? If no, it is not a Frame.**

Form owns the reading; Finish owns type, line, box, mark, measure and ornament.
The test is mechanical rather than a matter of taste, and it is what lets the two
axes compose instead of collide.

### 5.3 The nine

| Frame | Reading | Carves | Design | Board |
|---|---|---|---|---|
| `standard` | `before/thesis/1` | band · overline · column · bleed | 9 | 10 |
| `margin` | `before/margin/1` | rail right · rail left | 9 | 9 |
| `plinth` | `before/takeaway/1` | band · wide | 9 | 10 |
| `foot` | `after/thesis/1` | band · plate | 8 | 7 |
| `quiet` | `none/none/1` | open · sheet | 7 | 8 |
| `panel` | `before/thesis/2` | tinted · plain · well | 9 | 10 |
| `compare` | `before/none/2` | symmetric · titled | 8 | 9 |
| `triptych` | `before/thesis/3` | equal · weighted | 8 | 8 |
| `bookend` | `none/thesis/1` | opening · section · closing · colophon | 9 | 10 |

Twelve shipped entries collapse into four of these: `split-panel` + `premise` +
`recto` are all `panel`; `split-compare` + `compare-code` are `compare`; `title` +
`divider` + `closing` are `bookend`; `minimal` is `standard` with a chrome control.

`plinth` remains the one to build first — the coda Cell already exists, so it is
that Cell given a reserved band and a hairline.

## 6. The Mode contract

A Mode is a deck-wide hand every component honors. Lattice ships **one** real value,
`sketch`, whose governing rule generalizes: *roughen the lines the deck draws, never
invent a box.* Written as a contract so a second and sixth value stay cohesive:

**Six channels — a Mode must set every one.** Type (display + body family, weight,
tracking) · Line (weight, and the *mechanism* — `sketch` swaps CSS borders for real
rough.js strokes) · Box (corner geometry, fill posture, elevation) · Mark (bullets,
ticks, numerals, the `--mark-*` / `--shape-*` masks) · Measure & rhythm (text measure
and how much air) · Ornament (a folio, corner ticks, a title block — **to frame chrome
only, never to the stage**).

**Seven clauses.**

| | Rule | Protects |
|---|---|---|
| **M1** | Restyle, never restructure — may not add or remove a box, Cell or slot | `sketch`'s own rule. Adding a box is deciding layout, and layout is Form |
| **M2** | **Reading-preserving** — may not change `order`, `rank` or `arity` | The load-bearing clause: it is what makes Frame × Mode compose, and it is testable |
| **M3** | Palette-blind — where a structure carries meaning-bearing color, change its geometry, never its hue | HARD RULE #3. `sketch` already obeys this exactly |
| **M4** | **Total coverage** — every channel, every component; none falls back to the baseline hand | The cohesion the axis exists for. **`sketch` fails this today** by its own docs: boxed blockquotes and bordered rows "still bend a `border-radius`; they convert next" |
| **M5** | Content-blind — never changes what a component holds, nor its capacity budget | Otherwise it is Substance |
| **M6** | Export-safe through PDF and PPTX | The Finish layer's scar: gradients fade opaque-to-opaque because Chromium's print path turns an alpha fade into a gray cloud |
| **M7** | Escapable per slide | Already works — `_class: boardroom` opts out of `mode: sketch` |

**M4 is the only clause a machine can cheaply check, and it decides whether the axis
is worth having**: render all 69 components under a Mode and assert none falls back.
Without that gate a Mode ships at partial coverage and every deck using it is visibly
two decks — which is where `sketch` is today.

## 7. How many Modes — personas are the wrong unit

Fourteen teams do not need fourteen hands. **A persona is not a style; a deliverable
is.** One security team ships an audit report that must read as *checked* and an
architecture review that must read as *engineered* — two Modes, one team, same
quarter. Index the posture and the space collapses.

The question a Mode answers is *what must the audience believe about these claims?*
Six answers cover the listed teams. **This is a hypothesis the contract lets you
test, not a committed catalog** — values come after the contract, and each costs a
full pass over 69 components.

| Posture | The claim | Teams | Status |
|---|---|---|---|
| **Restraint** | "This is finished and considered." | executive · consulting · corporate comms · board · everyone's default | ships (`boardroom`) |
| **Rigor** | "These numbers were checked." | finance · legal · audit · compliance · government · procurement · security reporting | backdrop half ships (`finish: ledger`) |
| **Precision** | "This was engineered." | engineering · product · data · platform · security architecture · ops | proposed |
| **Narrative** | "This is worth reading." | comms · marketing · policy · research · NGO storytelling · exec narrative | proposed |
| **Hand** | "We are working this out together." | education · workshops · HR · ideation · early product · NGO field | ships (`sketch`) |
| **Display** | "Look at this." | brand · sales showcase · design · launch · recruiting | backdrop half ships (`finish: gallery`) |

**Six is near the ceiling, and cost is why.** Nine Frames × six Modes × eighteen
palettes is 972 combinations to keep coherent, and M4 prices each Mode at a full pass
over all 69 components. Past six, the marginal hand is one nobody can distinguish and
nobody can afford to keep complete.

**The gap, stated plainly: nine backdrops ship and one hand does.** `finish:` carries
`atrium · meridian · strata · halo · ledger · nimbus · loom · savile · gallery` —
atmosphere painted *behind* content, touching no component's geometry. `mode:` carries
`sketch` alone. Lattice has the weather for eight styles and the grammar for one.

## 8. One naming collision to settle first

`ledger` already means two things: a `finish:` backdrop, and a component **Form** value
(the shape `actors`, `glossary`, `inventory` and `kpi` take). A `mode: ledger` would be
its third sense across three axes, which `design-system.md` §2.5 bans outright — one
system word per concept, no third synonym. The posture is named **Rigor** above for
that reason; the register value needs a word that is not already spent.

## See also

- `design/design-system.md` — the four axes; §2.5 the vocabulary law; the three Finish
  registers.
- `design/forms.md` — the Form model; §5 `kind`, §8 the catalogs, §11 the manifest.
- `2026-06-11-sketch-finish.md` — the one shipped Mode, and why a hand cannot be a theme.
- `2026-08-04-finish-stacking-displaces-frame-chrome.md` — the Finish↔Frame seam, and
  what it costs when a treatment reaches into frame chrome.
- `2026-08-25-deck-profiles-craft-style-split.md` — the precedent for a declared,
  named deck profile (there, for grading rather than composition).
- `2026-08-24-universal-coda-cell.md` — the Cell `plinth` and `margin` re-home.
