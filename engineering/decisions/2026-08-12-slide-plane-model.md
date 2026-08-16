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
| **1 atmosphere** | — | `atmosphere`, `watermark`, `logo` |
| **2 content** | `stage` | `content` |
| **3 chrome** | `masthead`, `masthead-lede`, `masthead-bay`, `footer`, `footer-left`, `progress-centre`, `pagination-right` | `kicker`, `title`, `meta`, `status`, `footer`, `progress`, `pagination` |
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
  (`lib/forms/cell/stage/stage.css`) is the main thing creating one — `section.image` and
  `section.scene` declare it for themselves too — and
  `title` / `math` / `divider` and friends never get the class. Their z values
  escape to the page root, where they are ordered against *other slides* and
  against viewer chrome. `container-type: size` does not help — verified by putting a
  `z-index: -1` child in a `container-type: size` box and watching it escape behind the
  box's own background. (An earlier version cited `contain` computing `none` as the proof.
  That is not a valid test: the containment a `container-type` implies never appears in
  `contain`'s computed value, so it would read `none` either way.)

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
| `--z-chrome` | 30 | header, footer, pagination, meta, status, kicker, title, the progress rail (NOT the deck logo — see below) |
| `--z-alarm` | 90 | authoring-only signals about the slide: the overflow / illegible / fix-me tabs, debug boxes. Never reach a delivered export |
| `--z-mark` | 100 | what ships stamped **on** the slide: status stamps, review annotations, the comments layer |

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
children, and no isolation anywhere but the section itself.

The hairline was *also* given an export flip at this point — a solid bar in print and
`.lattice-exporting` — because the gradient appeared to render at ~22% strength in
exported PDFs. **That flip is gone, and it was the worst thing on this branch.** It
restyled 32 slides that had nothing wrong with them, turning a full-width taper into a
hard stub at 38% width, and those were blessed into goldens before anyone opened a diff
image. The wash it was written against was not real. Full account in § The wash that was
a rasterizer, below — read it before reaching for a flip of your own.

**The lesson that survives is about measurement, not compositing.** An earlier version of
this paragraph generalized confidently: "every stacking context between a mark and the
page is a chance for the print path to rasterize something that used to be vector." That
was written from one rasterizer's output and it is not established. What IS established is
that sinking the decorative planes is cheaper than lifting everything else, and that is
reason enough for the negative signs.

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
- **One original defect fails the new test, not two.** Reverting `section { isolation: isolate }`
  to the `.form` gate fails it, naming the sovereign `title` section. Reverting the watermark
  to a literal `z-index: -1` does NOT — the test reads computed values and `--z-atmosphere`
  IS `-1`, so the two are indistinguishable to it. That case is caught by the STATIC gates
  instead (`checkZPlanes` rejects the bare integer; §4.3 demands the token). The test file's
  own docstring says so; this line used to claim otherwise.
- Full unit suite (6,108 tests at the time of writing), the 334-test integration
  invariants tier, `lint`,
  `build:check` and `check:ownership` green.

**What it changes on the canonical corpus: nothing.** `test/integration/baseline-decks/gallery.md`
is 117 pages and exercises every component bucket. Rendered from a worktree at the branch
point and from this branch, then diffed page by page with **`pdftocairo`**: **zero
differing pages.**

That is the claim this section should have made from the start, and it took three attempts
to be able to make it honestly. The earlier versions of this table are worth naming, because
each failure mode is one a reader might otherwise repeat:

- The first A/B measured against a worktree **two merges stale**, so it credited this branch
  with another PR's work — a "running header appears, 9 decks / 20 pages" family that was
  #1646's fix, not this one's.
- The second measured a real difference in the wrong units: a "1px hairline at the
  below-note, 17 decks / 35 pages" family that was the export flip **restyling** pages, read
  at the time as the model repairing them.
- Both were rasterized with `pdftoppm` alone, which is the tool that manufactured the wash
  those decisions were chasing (§ The wash that was a rasterizer).

The result is that the plane model is **visually inert** on the corpus. It changes the
structure of layering — six named planes, one stacking context per section, a deleted
exclusion list — without moving a delivered pixel. For a change of this blast radius that is
the outcome to want: the defects it fixes are ones no committed artifact had captured
(a watermark ghost under a patterned finish, a sovereign frame with no stacking context),
and everything else stays exactly where the author put it.

**Two things do change, deliberately, outside the canonical gallery.** The section-number
watermark now clears the finish field on this branch's own demo deck — the originating
defect. And `image`'s `statement` composition loses its page number, because there the glyph
full-bleeds over a photo at 1.72:1; every other image composition and all of `scene` keep
theirs. An earlier cut suppressed the number on *all* `image` and `scene` slides and was the
only visible change the model made to the gallery — five deleted numbers, four of them
perfectly legible on plain canvas at 3.76-4.20:1. Deleting readable content to settle a
layering question is the inversion of this model's purpose, and the narrow rule replaced it.

## The wash that was a rasterizer

Four decisions on this branch were made to avoid a rendering defect that does not exist.
This section is the record, because the CSS that used to encode those decisions now points
here, and because the failure was not in the CSS at all — it was in trusting one tool.

**The observation.** A 1px `linear-gradient` hairline above a `.below-note` appeared to
render at roughly 22% strength in exported PDFs, turning a crisp accent rule into a
barely-visible tint — "3,596 differing pixels", measured repeatedly, on
`examples/marker-corner.md` p2. It seemed to switch on and off with unrelated changes:
isolating `.cell-stage`, a blanket `section > *` z-index, adding `z-index` to
`img.deck-logo`, or simply removing the deck's `logo:` line.

**What it actually is.** `pdftoppm`'s splash backend leaks an earlier element's constant
alpha into a later tiling-pattern fill. The alpha is `/ca .22`, emitted by
`--code-inline-border` — `color-mix(in srgb, currentColor 22%, transparent)`, the inline
code chip — so any slide carrying a `code` span could trigger it. The arithmetic settles
it: `0.22 x accent + 0.78 x white` = `rgb(199,223,236)`, which is the "washed" color to
within a unit of what anyone measured. The unrelated changes were not causing a wash; they
were reordering which element painted first, and whichever one interposed a transparency
group happened to reset the leaked state.

**The proof is one PDF, three rasterizers.** With `.cell-stage` isolated:

| rasterizer | hairline | vs. unisolated |
|---|---|---|
| `pdftoppm` (poppler-splash) | `rgb(199,223,235)` | 3,596 px |
| `pdftocairo` | `rgb(34,130,180)` | **0 px** |
| ghostscript | `rgb(1,111,167)` | **0 px** |

The PDFs are byte-identical through the hairline — same PatternType 1 tiling pattern, same
axial shading, same `/Matrix`, same `/SMask /Luminosity` group. Only object numbers differ.

**What it cost.** The export flip (a solid bar at `right: 62%` under `@media print` and
`.lattice-exporting`) was written to survive it, and did — while restyling every page where
nothing was wrong: 32 slides across three galleries, blessed into goldens. `img.deck-logo`
had its plane removed to avoid it, which put the one element the model most obviously
covers outside the model. A `SANCTIONED_PLANELESS` gate was built to keep it there. The
logo Tile's manifest was edited from `z: 3` to `z: 2` so the declaration would agree with a
CSS position adopted to dodge a phantom — the paint editing the model, which is backwards.
Three CSS files grew guard rails telling future authors not to isolate containers. All of
it is reverted.

**Why it survived so long.** Every visual check in this repo goes through the same
rasterizer. `tools/pixel-check.js`, `tools/rasterize-for-review.sh` and `tools/preview.js`
all shell out to `pdftoppm`; nothing cross-checks against a second engine. The QUALITY BAR
says to rebuild and actually look at it, and looking was done faithfully — at output that
was wrong in a way no amount of looking could reveal, because the artifact is deterministic
and reproduces perfectly. A second opinion from the same tool is not a second opinion.

**Three rules this earns.**

1. **A rendering claim needs two rasterizers.** One engine's output is an observation about
   that engine. Before a pixel difference becomes a reason to change CSS, reproduce it with
   `pdftocairo` or ghostscript — it costs one command.
2. **When a workaround and a cause are both available, the cause is the deliverable.** The
   flip was a correct answer to the wrong question, and it was convincing precisely because
   it came with a real measurement attached.
3. **Blessing a golden is an assertion, not a build step.** Six goldens were re-blessed here
   without the diff image being opened once. If a change re-blesses a golden, that image is
   the artifact justifying it (HARD RULE #23); "the gate is green" is not.

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
