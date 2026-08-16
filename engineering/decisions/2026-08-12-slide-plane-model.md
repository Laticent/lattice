---
status: shipped
summary: A Lattice slide has no working depth model. The Form manifests already declare five z-planes (0 canvas · 1 atmosphere · 2 content · 3 chrome · 4 annotation) and every Cell and Tile carries a `z` — but no CSS reads it. Engine CSS instead uses 50 hand-picked integers on an ad-hoc ladder (-1, 0, 1, 2, 3, 50, 100, 2147483000), and the containers those integers are compared inside are inconsistent: a `section` forms a stacking context only when it is `.form`, and a `.cell-stage` only when the deck happens to use a finish. Measured consequences — the watermark ghost (atmosphere) paints UNDER the finish field (canvas) and gets overprinted by its texture; `citation-card`'s pale glyph hit the same trap and was patched in place; a sovereign frame's z values escape to the page root. Shipped — the declared model executed as six named, tokenized planes with a local 0–9 band inside each occupant, on an unconditional per-section stacking context. That last piece is the precondition `2026-08-04-finish-stacking-displaces-frame-chrome.md` named before its rejected alternative can be re-proposed, and landing it deletes that note's gated exclusion list.
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
`lib/components/legal/citation-card/citation-card.styles.css`:

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

There is even a gate. `checkZPlaneZIndex` (`lib/forms/index.js`, run by
`tools/build-forms.js`) asserts that a lower plane never carries a higher
z-index. It is real and it passes — and it can see exactly **two files**, because
it only reads `lib/forms/{cell,tile}/*/*.css`, and only two of those declare a
z-index at all (`watermark.css`, `progress-centre.css`). Every other layering
decision in the engine is outside its field of view.

## What the paint actually does

50 `z-index` declarations across `lib/` (comments stripped; a raw grep says 66 and that
is where an earlier draft's "56" came from), on this ladder:

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
accidental. Measured on a real render — a three-slide probe (a `content` slide, the
same slide under `finish: savile`, and a sovereign `title`) through the emulator's own
HTML output, computed styles read in Chromium 131:

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
  (`lib/forms/cell/stage/stage.css`) is the only thing creating one, and
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
section { isolation: isolate; }   /* lib/base/base.elements.css */
```

One line, no exceptions, no class gate — declared on the bare `section` so a sovereign
frame cannot miss it. (The theme prefixer emits it as `article.lattice > section`.) Every
plane number below then means the same thing on every slide, and nothing on a slide can be
ordered against anything off it.

### Two: nothing else becomes a stacking context

The section is the only new one. In particular the `stage` Cell is **not** isolated and
carries **no** z-index, which was the opposite of this note's first draft — see *The cut
that did not survive contact*.

Containment comes from arithmetic instead: the local band `0–9` is the content plane's
interior, which is why the gap up to `--z-chrome` is 30 and not 1. A component's
internals sit above atmosphere (−1) and below chrome (30) by construction, so nothing has
to isolate them for them to be ordered correctly.

### Three: six named planes — the decorative ones sink, the chrome ones rise

Tokens in `base.tokens.css`, consumed everywhere a slide-level layering decision
is made:

| Token | z | What lives here |
|---|---|---|
| `--z-canvas` | **−2** | the sheet: the `.lattice-bg` photo panel, the finish `.backdrop` field |
| `--z-atmosphere` | **−1** | decorative depth: the watermark ghost, oversized ghost numerals, the photo scrim, pale quote glyphs |
| `--z-content` | 0 | the stage and everything the author wrote |
| `--z-chrome` | 30 | header, footer, pagination, logo, meta, status, kicker, title, the progress rail |
| `--z-mark` | 40 | what ships stamped **on** the slide: status stamps, review annotations, the comments layer |
| `--z-alarm` | 50 | authoring-only signals that must beat everything: the overflow / illegible / fix-me tabs, debug boxes |

**The signs are the design.** A negative-z child paints at step 3 of the painting
algorithm — after the section's own background, before every in-flow descendant — so the
author's markup floats above the canvas and the atmosphere *without declaring anything*.
The stage Cell carries no z-index; neither does a component's DOM. Only the things that
must rise above the words pay for a declaration.

That is not the scale this note first proposed, and the correction is recorded below
under *The cut that did not survive contact*, because the reason is worth more than the
outcome.

A seventh plane was drafted and dropped before it shipped: `--z-content-focus` at 25,
for a promoted `.lat-focus` item. It was wrong by this note's own rule — a focused row
always renders *inside* the stage, so it belongs to the local band, and `base.focus.css`
keeps the `z-index: 2` it already had. The scale would have carried a token nothing could
legitimately use.

Plus two rules that are part of the model, not decoration:

- **Local band 0–9.** The dividing line is whether an element can be a **direct child
  of `section`**. If it can, it sits on a plane and names it. If it can't — a
  component's internals, a `.lat-focus` row inside the stage — it uses 0–9 and nothing
  else, and the gap between content and chrome is what keeps it honest.
- **Viewer chrome is not a slide plane.** `#lattice-fluid-toggle` and the exported
  player's bar live in the *document*, above the entire deck. They keep their own
  `--z-viewer`, outside this scale, and the gate leaves them alone.

Why spaced by ten: a sub-plane like focus can be inserted (25) without renumbering
anything, and at slide level any value that isn't a multiple of ten reads as a
mistake at a glance.

### Four: gate it, in the two halves it actually splits into

**Static** — `checkZPlanes` in `tools/check-ownership.js` (`build:check`, like
`checkMarginDiscipline` and its siblings): no bare `z-index` outside the local 0–9 band,
no plane token nothing reads, no `var(--z-…)` the scale does not define. All three fire;
each was verified by introducing the violation and watching the gate name it.

**Empirical** — `test/integration/invariants/slide-planes.test.js`: render a corpus,
walk every real direct child of every section, assert its computed z-index is a plane
value. This half exists because the other half cannot decide it. "Can this selector
match a direct child of a section" is not answerable from CSS text: it means
reimplementing selector matching, specificity and bundle source order against a DOM the
CSS never describes. `checkFinishChromeExclusions` tried and abandoned it at *"38
candidates, nearly all false positives"*; a rebuilt version here fired on
`.state-chart-edges`, `.scene-control` and `.panel-eyebrow`, none of which is a section
child. Asked of the DOM it is not a heuristic but a fact — `el.parentElement === section`
— and needs no enumeration at all. Verified by reverting each original defect and
confirming the test names it.

**And the Form §4.3 check becomes an equality test.** It compared *order*: "a lower plane
must not paint at a higher-or-equal z-index." That is the strongest thing derivable from
hand-picked integers, and it passed the watermark — `"z": 1` against `z-index: -1` was
monotonic against the only other co-located declaration in the repo. Once the CSS names
the plane, the check is "the manifest plane and the CSS plane are the same plane," which
catches it. Two things had to be fixed for it to be true rather than merely green:

- **It went vacuous the moment the Form sheets moved to tokens.** The collector matched
  `/z-index:\s*(-?\d+)/`, found nothing, and the check passed on an empty set. It now
  errors on an empty set explicitly — a gate that certifies nothing is worse than no gate.
- **Attribution was by file, and Cells do not own their own files.** `.cell-footer` is
  styled in `lib/forms/cell/stage/stage.css`, so a file-keyed collector read the footer's
  `--z-chrome` as a claim by `cell/stage` and reported a disagreement that was entirely its
  own. It now attributes by the DOM class the rule *selects*.

## The cut that did not survive contact

The scale above is the second one. The first ran **entirely positive** — canvas 0,
atmosphere 10, content 20 — and lifted the content onto its plane with a blanket
`section > * { z-index: var(--z-content) }`, plus `isolation: isolate` on the stage Cell to
contain a component's internals. It was coherent, it passed every gate, the whole unit
tests and the 472-test integration tier, and the invariant test asserted exactly what it
was supposed to. **A corpus A/B against the pre-change render is what found it.**

On `examples/marker-corner.md` p2 a 1px `.below-note` hairline — an accent gradient fading
right — came out of the exported PDF as a barely-visible tint. The two renders were
**pixel-identical on screen**, so nothing in the DOM, the computed styles, or a browser
screenshot showed anything at all; the difference existed only in the PDF, at 3,596 pixels.

Bisected by appending overrides to the built bundle and re-rendering, one rule at a time:
the cause was the pair *stage z-index + stage isolation*, i.e. **the stage becoming a
stacking context**. Chromium's print path composites a gradient image inside a nested
stacking context down to roughly 22% of its intended strength. Not a Lattice bug, and not
one any amount of screen review would have caught.

Three things about it are worth keeping, because each one cost a wrong hypothesis:

- **Height is not the variable.** An 8px-tall gradient washes exactly as badly as a 1px
  one. The first fix attempt assumed sub-pixel coverage and was wrong.
- **Alpha is not the variable either.** The second attempt assumed the documented
  fade-to-`transparent` hazard (`base.finish.css`'s OPAQUE rule) and changed the gradient
  to end opaque. It still washed. So did a hard-stop gradient.
- **A solid fill survives**, because the exporter emits it as a vector rather than a
  rasterized image. A `border-top` survives for the same reason.

So the model changed rather than the hairline being patched around: sinking the decorative
planes needs **no** stacking context on the stage, no blanket rule over a section's
children, and no isolation anywhere but the section itself. The hairline additionally got
the export flip the finish presets already use (gradient on screen, solid bar in print and
`.lattice-exporting`), because that rule was one stacking context away from failing no
matter who added it.

**The lesson generalizes past this branch: every stacking context between a mark and the
page is a chance for the print path to rasterize something that used to be vector.** Do
not create one to "contain" a subtree — space the planes so the arithmetic contains it
instead.

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

**The deletion changes what a future author inherits, and that is worth stating
plainly.** Before this change, every non-backdrop child of a `finish:` section sat at
`z-index: 2`, so a new element added there landed *among* content and had to out-number
it to cover anything. After it, content sits at `auto` and floats above a backdrop sunk
to −2 — which means a new element placed inside the `section` but outside `.backdrop`,
carrying any positive z-index at all, paints **above** the words rather than tying with
them. That is the correct behavior for chrome and the wrong behavior for a decorative
layer, and the difference is no longer visible in the number: `z-index: 2` used to read
"level with content" and now reads "over it".

So a decorative layer added at section level belongs on `--z-canvas` or
`--z-atmosphere`, not on a small positive number — and if it needs to sit inside the
finish's own stack rather than the slide's, it belongs inside `.backdrop`, whose local
band 0–2 is contained. `checkZPlanes` will reject the bare integer either way, but the
gate only says *don't*; this paragraph is the *why*. The live case is the `--surface`
token sketched in #1662 — a token declared by whichever rule paints the background,
which would retire that PR's enumerated `:is()` list. It is a color mechanism, so
nothing here blocks it; the note is only that it must not assume finish content still
carries a z-index of its own.

**One deletion nearly went wrong, and it is the note's own best cautionary tale.** The
removed gate located its subject with `css.indexOf('section.finish > *:not(.backdrop,
:where(')` on the **raw** file. The comment written to explain the deletion quotes the
deleted rule verbatim — so the gate found the quote, parsed the comment as its exclusion
list, and passed. It certified a rule that no longer existed, which is precisely what its
own error message was written to prevent. `checkZPlanes` strips comments before it reads
anything. A gate must not be able to read its own obituary as its subject.

## What this unlocks

Naming the planes is also what makes "slam a plane into the frame independently"
addressable. Once each plane is a token and each section is a context, a present-mode
depth effect is a sibling token (`--depth-atmosphere`) plus one transform per plane,
rather than a hunt for which of 50 integers moves the ghost numeral.

Two honest caveats, so this is designed *toward* and not claimed: `transform-style:
preserve-3d` does not survive the stage's `overflow: hidden` clip, and
`2026-06-19-css-3d-charts-feasibility.md` already established that CSS 3D rasterizes
in the exported PDF. Any depth effect is present-mode only, and the clip interaction
needs its own spike. **This note ships no 3D and claims none.**

## What shipped, and what it measured

Verified on real renders (HARD RULE #23), not inferred:

- **The watermark inversion is fixed.** Under `finish: savile`, before and after, every
  box on the slide is identical to the pixel — `header`, `footer`, `.cell-stage`,
  `.cell-footer`, `.backdrop` and the ghost all at the same coordinates and sizes. What
  changed is the z values, and that the pinstripes no longer rule across the numeral.
- **The stage stopped being dragged into flow.** `.cell-stage` computed
  `position: relative` on a finish deck and computes `static` now — the destructive
  mechanism the 2026-08-04 note was written about, gone rather than excluded.
- **The pagination pseudo has a plane.** `section::after` is frame chrome but a
  pseudo-element, so no rule over a section's children reaches it and it sat at `auto`.
  That accident went both ways in one corpus: the page number **vanished** behind `scene`'s
  exhibit panel and **appeared** on `split-panel`, where it had always been hidden.
- **The running header is consistently visible on split frames.** It used to be hidden over
  `.panel-left` (positioned, so it painted after the header) and shown over `.panel-right`
  (a static flex item, so it painted before) — an arbitrary split nobody chose.
  `split-panel.styles.css` is already written against the header being visible: `watermark`
  recolors it to on-accent ink, and a `mirror` rule reserves a band for the collision it
  causes. On a fitting slide it lands in the empty band those comments describe. It crowds
  the panel eyebrow on one slide of `examples/marker-corner.md`, which is a deliberate
  overflow demo the engine already tags "Content clipped"; every available fix for that
  would have moved content on slides that fit, to protect one that does not.
- **Both original defects fail the new test.** Reverting the watermark to `z-index: -1`
  fails it by name; reverting `section { isolation: isolate }` to the `.form` gate fails it
  naming the sovereign `title` section.
- Full unit suite (6,108 tests at the time of writing), the 334-test integration
  invariants tier, `lint`,
  `build:check` and `check:ownership` green.

**The whole example corpus, A/B.** All 131 decks rendered twice — once from a worktree at
the pre-change commit, once from this branch — and pixel-diffed page by page. **106 decks
are byte-identical.** The 25 that moved fall into exactly three families, and every one is
the model doing its job:

| What moved | Decks | Pages | Why |
|---|---|---|---|
| a 1px hairline at the below-note | 17 | 35 | the export flip: a gradient that washed out in the PDF is now a solid accent bar |
| the running header appears | 9 | 20 | it was painting *under* an opaque full-bleed child and was invisible; chrome is now above content |
| the page number appears | 2 | 2 | the pagination pseudo had no plane, so an opaque child covered it |
| the watermark ghost clears the finish | 1 | 1 | the originating defect, on this branch's own demo deck |

(Classified mechanically from each changed page's diff bounding box, not by eye.)

Two of those three are **restorations of something a deck author asked for and silently did
not get** — `examples/kaizen-craftsmanship.md` declares a `header:` that never rendered on
its dark split slides, and `examples/scene.md` lost its page number on the exhibit pages.
Spot-checked at full resolution on the four largest diffs (`kaizen-craftsmanship`,
`seven-steps-problem-to-code`, `accent-on-accent`, `gallery-jargon`): the header lands in
the panel's empty top band in every case, well clear of the panel's own eyebrow.

## The flip that fixed nothing

The worst thing in this change shipped as a fix, passed every gate, and was blessed
into six golden PDFs before anyone looked at it. It is worth the space because the
failure was not in the CSS — it was in the order the questions got asked.

**What happened.** An earlier cut of this branch put `z-index: var(--z-chrome)` on
`img.deck-logo`. That looked obviously right: the logo is chrome, chrome has a plane,
name it. It also, in Chromium's print path, promoted the logo out of the z-auto/0 paint
group into the positive-z group — and that tipped the compositor into rendering an
unrelated **sibling** at roughly 22% strength: the below-note hairline, a
`linear-gradient` on a 1px `::before`. On `examples/marker-corner.md` p2 the rule went
from a crisp `#0C71A4` taper to a washed `#CAE0EB` ghost.

The wash was real and it was measured. What was never asked is *what caused it*. Instead
a RICH-on-screen / SAFE-on-export flip was written — replacing the gradient with a solid
`var(--accent)` bar at `right: 62%` under `@media print` and `.lattice-exporting` — on
the reasoning that a solid fill survives as vector where a gradient image does not. That
reasoning is correct. The flip did survive export. It also **restyled every page where
the gradient had never washed**, turning a full-width taper into a hard-edged stub at 38%
width, on 32 slides across three galleries — all of which were then blessed as goldens,
which is what made the regression invisible to the regression gate. A gate that compares
a render to a golden cannot see a bad golden.

**What found it.** Not a test. CI was green, the unit suite was green, `build:check` was
green, and the regression gate reported "all match committed goldens" — because they did.
It was found by opening the CI golden-diff bot's before│after│overlay montage and looking
at the picture, which is the one step the QUALITY BAR asks for and the one step that had
been skipped.

**The bisect.** Neutralizing the flip and re-rendering against the true branch point:
`obligation-matrix` went from 1,724 differing pixels on 8 pages to **0 on all 12** — so
there the flip was pure restyle. `marker-corner` p6 went from 856 to **0**; p2 stayed
washed, which localized the real cause. `isolation: isolate` was ruled out in both
directions (removing it on this branch did not fix the wash; adding it to the base tree
did not cause it). The ancestor stacking-context chain of `.below-note` is *identical*
across the two trees. Diffing every stacking context inside the section instead of the
ancestors is what surfaced the logo, and single-declaration overrides settled it:
`img.deck-logo { z-index: auto }` → 0 differing pixels; `header { z-index: 3 }` → still
1,726. One line, all of it.

**What shipped instead.** The logo's `z-index` is gone and both flips are deleted. Both
decks now render **pixel-identical to the branch point on every page**, and the six
blessed goldens were reverted — after which the *base* goldens match a fresh render on
this branch, which is the proof that the blessing had been certifying a regression rather
than recording a change.

**Three rules this earns.**

1. **A plane is not free.** Naming an element's plane promotes it in the paint order, and
   promotion has compositor-level consequences that have nothing to do with the ordering
   you wanted. An element that is *already* correctly ordered — `img.deck-logo` is
   absolutely positioned, carries `opacity` below 1, and has nothing left to climb over
   now the decorative planes are negative — should stay at `auto`. `auto` is a plane
   decision, not an omission, and the model counts it as one.
2. **When a workaround and a cause are both available, the cause is the deliverable.**
   The flip was a correct answer to the wrong question. It survived review because it
   came with a real measurement attached, which is exactly what made it convincing.
3. **Blessing a golden is an assertion, not a build step.** `--bless` writes down "this
   is what the output should be." Six goldens were re-blessed here without the montage
   being opened once. If a change re-blesses a golden, the diff image is the artifact
   that justifies it (HARD RULE #23), and "the gate is green" is not that artifact.

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
  render paths, and it moves what the overflow probe and autosplit measure, which is a
  protected surface. Considered and deferred with the human; the token model does not
  preclude it later.
- **Retrofit every component's internal z-index in the same branch.** Unnecessary: all 33
  bare values left in engine CSS are already inside the local band, and the GAP between
  atmosphere (-1) and chrome (30) is what contains them — not isolation, which the shipped
  model deliberately does not use below the section. Pulling them in would have been churn
  against HARD RULE #17.
