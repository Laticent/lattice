---
status: proposed
summary: A Lattice slide has no working depth model. The Form manifests already declare five z-planes (0 canvas · 1 atmosphere · 2 content · 3 chrome · 4 annotation) and every Cell and Tile carries a `z` — but no CSS reads it. Engine CSS instead uses 56 hand-picked integers on an ad-hoc ladder (-1, 0, 1, 2, 3, 50, 100, 2147483000), and the containers those integers are compared inside are inconsistent: a `section` forms a stacking context only when it is `.form`, and a `.cell-stage` only when the deck happens to use a finish. Measured consequences — the watermark ghost (atmosphere) paints UNDER the finish field (canvas) and gets overprinted by its texture; `citation-card`'s pale glyph hit the same trap and was patched in place; a sovereign frame's z values escape to the page root. Proposal — execute the declared model as six named, tokenized planes with a local 0–9 band inside each occupant, on an unconditional per-section stacking context. That last piece is the precondition `2026-08-04-finish-stacking-displaces-frame-chrome.md` named before its rejected alternative can be re-proposed, and landing it deletes that note's gated exclusion list.
builds-on: 2026-08-04-finish-stacking-displaces-frame-chrome.md, 2026-06-16-form-manifest-medium-independent-contract.md, 2026-06-15-form-implementation.md
---

# The slide has planes on paper and a flat number line in the CSS

## The symptom, in one picture

Render a `form watermark` slide under `finish: savile` and the section-number
ghost — the big "01" that is supposed to sit *behind* the words and *in front of*
the sheet — comes out with the finish's pinstripes ruled straight across it. The
ghost is painting below the finish field, not above it.

That is backwards by the model's own definition. `lib/forms/tile/watermark/watermark.manifest.json`
declares `"z": 1` — the **atmosphere** plane. The finish backdrop is the **canvas**
plane. Atmosphere is defined to sit above canvas. It doesn't, because the two
numbers that actually decide are `-1` (watermark.css) and `0` (base.finish.css),
picked years apart by two authors who each reasoned locally and correctly.

The same trap has already been paid for once, in a different file. From
`lib/components/legal/citation-card/citation-card.styles.css:130`:

```css
/* z-index:0 (was -1, which sank it behind the opaque canvas → invisible). */
```

Two elements, same intent ("decorative, behind the words"), same mistake, two
independent local patches, no shared rule. That is the shape of the whole
problem: **the layering model exists in the manifests and nowhere in the paint.**

## What is actually declared today

The Form model is not vague about depth. `lib/forms/schema/cell.schema.json` and
`tile.schema.json` both require a `z`, `lib/forms/index.js` freezes
`Z_PLANES = [0,1,2,3,4]`, and every noun on disk carries one:

| Plane | Cells | Tiles |
|---|---|---|
| **0 canvas** | — | `canvas`, `rule` |
| **1 atmosphere** | — | `atmosphere`, `watermark` |
| **2 content** | `stage` | `content` |
| **3 chrome** | `masthead`, `masthead-lede`, `masthead-bay`, `footer`, `footer-left`, `progress-centre`, `pagination-right` | `kicker`, `title`, `meta`, `logo`, `status`, `footer`, `progress`, `pagination` |
| **4 annotation** | `overlay` | `annotation` |

There is even a gate. `checkZPlaneZIndex` (`lib/forms/index.js:406`, run by
`tools/build-forms.js`) asserts that a lower plane never carries a higher
z-index. It is real and it passes — and it can see exactly **two files**, because
it only reads `lib/forms/{cell,tile}/*/*.css`, and only two of those declare a
z-index at all (`watermark.css`, `progress-centre.css`). Every other layering
decision in the engine is outside its field of view.

## What the paint actually does

56 `z-index` declarations across `lib/`, on this ladder:

```
-1     watermark ghost
 0     finish backdrop · finish mark · image panel · component internals
 1     divider numeral · component connectors/rails
 2     content under a finish · chrome under a finish · focus promotion
 3     progress rail · component internals (scene, chart-family)
50     overflow tab · illegible tab · fix-me tab
100    status stamps (CONFIDENTIAL / DRAFT / …)
2147483000  the fluid-view toggle
```

Three things are wrong with that list, and they are different problems.

**1. Slide planes and component internals share one number line.** `scene`
declares `z-index: 3` for an internal element; the progress rail Tile declares
`z-index: 3` as a chrome plane. They mean unrelated things. They only stay apart
when something happens to isolate them — see below.

**2. Chrome and content are the same plane.** `base.finish.css` puts every
non-backdrop child at `z-index: 2` in one sweep. The masthead, the stage, the
footer and the author's component all land together. Nothing expresses that
chrome is *above* content, which is precisely what plane 3 exists to say.

**3. The alarm ladder is magic.** 50 for the three authoring tabs, 100 for the
status stamps, and a `--corner-stack` token system in `base.variants.css` to keep
them from eating each other geometrically. The geometry work is right and stays;
the numbers are two unnamed tiers nobody can look up.

## The root cause: the containers are inconsistent

A z-index only orders elements *within a stacking context*. Lattice's are
accidental. Measured on a real render (`.scratch/zprobe/leak2.md`, three slides,
Chromium 131, the emulator's own HTML output):

| Slide | Section forms a context? | `.cell-stage` forms one? |
|---|---|---|
| `content` (default form) | yes — `isolation: isolate` | **no** |
| `content` + `finish: savile` | yes | **yes** — via `position:relative; z-index:2` |
| `title` (sovereign frame) | **no** — `isolation: auto` | n/a |

Read those rows together and the flatness is explained:

- **A component's internal stacking is contained only if the deck uses a finish.**
  Turn a finish on and `.cell-stage` earns a z-index, becomes a context, and traps
  the component's internals. Turn it off and those same internals compare directly
  against the slide's chrome. A deck-wide cosmetic setting silently changes what
  a component's `z-index: 3` competes with.
- **A sovereign frame has no context at all.** `section.form { isolation: isolate }`
  (`lib/forms/cell/stage/stage.css:105`) is the only thing creating one, and
  `title` / `math` / `divider` and friends never get the class. Their z values
  escape to the page root, where they are ordered against *other slides* and
  against viewer chrome. `container-type: size` does not help — measured
  `contain: none`, `isolation: auto`.

`2026-08-04-finish-stacking-displaces-frame-chrome.md` hit this from the other
side and wrote the conclusion down:

> Do not re-propose it without first giving every section an unconditional
> stacking context, which is a wider change than this one.

This note is that wider change.

## The proposal

### One: every section is a stacking context, unconditionally

```css
article.lattice > section { isolation: isolate; }
```

One line, no exceptions, no class gate. Every plane number below then means the
same thing on every slide, and nothing on a slide can be ordered against anything
off it.

### Two: every occupant root isolates too

`.cell-stage`, `.cell-masthead`, `.cell-footer`, and each component root get
`isolation: isolate` **unconditionally** — not as a side effect of a finish. A
component's internals become permanently local, whatever the deck's cosmetics.

### Three: six named planes, spaced by ten

Tokens in `base.tokens.css`, consumed everywhere a slide-level layering decision
is made:

| Token | z | What lives here |
|---|---|---|
| `--z-canvas` | 0 | the sheet: section background, `.lattice-bg` photo panel, `.image-scrim`, the finish `.backdrop` field |
| `--z-atmosphere` | 10 | decorative depth: the watermark ghost, oversized ghost numerals (`split-panel .panel-eyebrow`), pale quote glyphs, the finish mark and edge |
| `--z-content` | 20 | the stage and everything the author wrote |
| `--z-content-focus` | 25 | a *promoted* content item (`.lat-focus`) — deliberately a sub-plane of content, not above chrome |
| `--z-chrome` | 30 | header, footer, pagination, logo, meta, status, kicker, title, the progress rail |
| `--z-mark` | 40 | what ships stamped **on** the slide: status stamps, review annotations, the comments layer |
| `--z-alarm` | 50 | authoring-only signals that must beat everything: the overflow / illegible / fix-me tabs, debug boxes |

Plus two rules that are part of the model, not decoration:

- **Local band 0–9.** Inside an occupant (a component, a tile's internals), use
  0–9 and nothing else. A rail behind a node is `z-index: 1`. Never reach for a
  plane token from inside a component — the isolated root already guarantees the
  whole component sits on its plane as a unit.
- **Viewer chrome is not a slide plane.** `#lattice-fluid-toggle` and the exported
  player's bar live in the *document*, above the entire deck. They keep their own
  `--z-viewer`, outside this scale, and the gate leaves them alone.

Why spaced by ten: a sub-plane like focus can be inserted (25) without renumbering
anything, and at slide level any value that isn't a multiple of ten reads as a
mistake at a glance.

### Four: extend the gate to the whole engine

`checkZPlaneZIndex` today sees two files. Generalize it into
`tools/check-ownership.js` (`build:check`, like `checkMarginDiscipline` and its
siblings): **engine CSS may not declare a bare numeric z-index outside the local
0–9 band; anything above it goes through a `--z-*` token.** The existing Form
manifest ↔ CSS plane check folds in as the special case it always was, and the
manifest `z` finally has a consumer.

## What this deletes

The finish exclusion list. With planes and a guaranteed per-section context,
`base.finish.css` becomes:

```css
section.finish > .backdrop { z-index: var(--z-canvas); }
```

and that is all — no blanket rule over every child, no
`:not(.backdrop, :where(header, footer, img.deck-logo, .illegible-tab, .lat-split-rail, .lattice-bg))`,
no `checkFinishChromeExclusions` gate to keep the list from rotting, no
`position: relative` dragged onto chrome that positions itself. The 2026-08-04
note's rejected alternative works once its stated precondition is met, and this
proposal meets it.

`--corner-stack` stays. It is geometry — keeping two corner tags from covering
each other — and planes do not solve adjacency.

## What this unlocks

Naming the planes is also what makes "slam a plane into the frame independently"
addressable. Once each plane is a token and each section is a context, a present-mode
depth effect is a sibling token (`--depth-atmosphere`) plus one transform per plane,
rather than a hunt for which of 56 integers moves the ghost numeral.

Two honest caveats, so this is designed *toward* and not claimed: `transform-style:
preserve-3d` does not survive the stage's `overflow: hidden` clip, and
`2026-06-19-css-3d-charts-feasibility.md` already established that CSS 3D rasterizes
in the exported PDF. Any depth effect is present-mode only, and the clip interaction
needs its own spike. **This note ships no 3D and claims none.**

## Alternatives considered

- **Leave the integers, document a convention.** Rejected: the two files that
  already got this wrong were each locally reasonable. A convention with no gate
  is what we have now.
- **Fewer planes (reuse the declared 0–4 verbatim).** Rejected: the declared five
  have no home for the authoring alarms or for status stamps, which is exactly why
  those grew the unnamed 50/100 tier. Six planes plus the local band cover
  everything found in the sweep; the declared five map onto the first five without
  renumbering the manifests.
- **Make each plane a real DOM layer.** The cleanest end state for a 3D effect,
  and much too large for this change — it restructures the DOM across all three
  render paths. The token model does not preclude it later.
