---
status: shipped
summary: >
  Three registers ride the coda band — key insight, below-note, and the annotation an
  italic-only trailing paragraph gets — and only ONE of them was built the universal way.
  Key insight and below-note share the kernel's `rendersBeat` predicate with the published
  `authoring.blocks` contract; the annotation was a hand-enumerated OPT-IN union of
  seventeen layouts in base.modifiers.css, written three times over, decorating a block
  that is OPT-OUT. Two mechanisms, so the sets could not agree. Measured through the real
  emulator, one probe slide per component across all 61 layouts: key insight 51/51 honest,
  below-note 34/34 honest, annotation 15 — with 19 layouts that DO render a below-note
  silently rendering an italic note as an ordinary one, no spark, no dotted rule, `content`
  among them, which is what every un-classed slide resolves to. Two of the seventeen names
  (`timeline`, `principles`) are not components but VARIANT classes. Fixed by keying the register on the
  `.below-note` wrapper the kernel emits, so it names no component and inherits the kernel's
  answer: annotation now matches below-note exactly, 36 and 36. The same probe proposed five
  dead `coda.claims`; TWO were dead (`diagram` claimed the paragraph for a `.diagram-caption`
  NO code path emits — the identical wart `code` carried until 2026-08-30 — and `big-number`
  for nothing at all) and three were not, which §4 records as the more useful half: the probe
  APPENDED a beat, and that displaces `matrix-grid`/`state-chart`'s trailing `legend` from the
  anchor position, so it read as unstyled where the bare sample shows it becoming
  `.chart-caption`. The `<!-- annotation: … -->` comment register, documented on three
  surfaces, renders nothing anywhere and is retired.
---

# Universal is not the same as optional

**Date:** 2026-09-01
**Status:** shipped
**Follows:** `2026-08-24-universal-coda-cell.md` (which gave the beats a Cell and made
key-insight/below-note honest, and left the annotation alone), `2026-08-30-code-type-step.md`
§3 (the first dead `coda.claims` found and dropped, one component at a time).
**Rules touched:** none changed. HARD RULE #1 (one predicate, every caller), #18 (a
regression this change caused is fixed here, a pre-existing one is logged), #23 (every
count below names its surface), #29 (the ✦ is drawn, never typed).

---

## 1. The question, and why the answer was not what it looked like

The report was: *"our charts and diagrams don't support universal coda? we need to check
why key insight is supported but not annotation and below note. what other components
don't support the universal coda? things can't be universal if they are optional."*

The last sentence is the finding. Three registers ride the coda band, and they were built
on **three different mechanisms**:

| Register | Mechanism | Reached | Published | Linted |
|---|---|---|---|---|
| key insight (`> …`) | coda kernel, opt-out via `coda.claims` | 51 / 61 | yes | yes |
| below-note (trailing `p`) | coda kernel, opt-out via `coda.claims` | 34 / 61 | yes | yes |
| annotation (`_italic_`-only `p`) | **hand-enumerated union in base.modifiers.css, opt-IN** | **15 / 61** | **no** | **no** |
| annotation (`<!-- annotation: … -->`) | **none** | **0 / 61** | no | no |

So key insight was not privileged over the others by any design decision. It is simply the
only one of the three that `2026-08-24` finished converting. Below-note shares its kernel
and is withheld by claims; the annotation was never moved at all, and was still the exact
pattern that note was written to kill — a universal block bound to per-layout selector
arms, which drift the moment anything else moves.

## 2. The measurement

One probe deck per register, built from **each component's own manifest `sample`** so every
layout gets markup its transform actually accepts, plus a key insight and a trailing
paragraph. Rendered through `lattice-emulator.js` (the real export path), measured in real
Chromium at 1920×1080: where did each beat land, what did it compute to, did the register's
three arms fire.

**Key insight — honest.** 51 layouts publish it, 51 paint the panel. The ten that do not
are exactly the ten that claim the blockquote.

**Below-note — honest as a COUNT, but two claims are dead.** 34 published, 34 in the band.
The claims are what the audit was about:

| layout | what the claim protects | verdict |
|---|---|---|
| 12 chart-frame layouts | `.chart-caption`, via `liftChartCaption` — measured at `--fs-meta` | **true** |
| `matrix-grid`, `state-chart` | the swatch `legend`, lifted into `.chart-caption` | **true — see §4** |
| `quote` | the attribution, 14.976px | **true** |
| `title`, `closing`, `divider` | the bookend lede, 28px | **true** |
| `stats` | its italic lede rule | **true** |
| `image`, `split-panel` | consumed into `.image-text` / `.panel-right` | **true** |
| `contact`, `wifi`, `split-compare` | dropped by design (a 527px card in a 524px stage) | **true** |
| `math` | absorbed into the equation grid | **true — see §4** |
| `diagram` | `.diagram-caption`, which nothing emits | **DEAD** |
| `big-number` | nothing | **DEAD** |

`diagram` is the instructive one. Its manifest claimed the trailing paragraph;
`diagram.styles.css` styled a `.diagram-caption`; **nothing in the tree emits that class.**
What actually caught the author's paragraph was diagram's *dek* rule,
`section.diagram > .cell-stage > p` — the rule for the LEADING paragraph under the heading —
so a closing sentence rendered at `--fs-meta` at the FOOT of the slide, looking like a
second dek. The claim was protecting a rule that had never fired, and costing the layout
both the note and the annotation to do it. That is bit-for-bit the defect `code` carried
until 2026-08-30, found the same way, a component at a time. `big-number` is the plain
case: no rule in the tree matches a trailing `<p>` on it at all, and its documented caption
is a nested bullet.

**Annotation — 15, and the other 19 fail silently.** The union named seventeen layouts, of
which two (`timeline`, `principles`) are not components but VARIANT classes — see §4b,
where the reason first given for deleting them turned out to be false. Nineteen layouts
that render a below-note got an ordinary one for
an italic-only paragraph: accent hairline instead of the dotted rule, `--fs-body` instead of
`--fs-meta`, no spark. `content` is on that list, so **the default slide did not render the
register.** Nothing told the author: `authoring.blocks` does not publish the annotation, and
the deck lint's `block-unsupported` rule only fires on an explicit `insight-*` / `no-note`
modifier, never on the authored shape.

**The comment register — 0.** `<!-- annotation: WIP … -->` is documented in `base.docs.md`
as a top-right corner overlay, mapped in `design/forms.md` to the `overlay` Cell, and its
Tile manifest said `status: shipped`. Rendered, the text lands in
`<aside class="lattice-notes" hidden>` — the speaker-notes channel — and nothing paints, on
any layout. There is no CSS for it and no transform reads it. Three surfaces describing
chrome that has never existed.

## 3. What shipped

**The register is keyed on the `.below-note` wrapper, not on a list of names.** The kernel
already decided whether this slide renders a below-note — it consulted `rendersBeat`, the
same predicate that publishes `authoring.blocks` — and it only emits that wrapper where the
answer was yes, so the class IS the permission and CSS has nothing left to decide. Three
single-arm rules replace roughly a hundred selector arms, and the annotation set is now the
below-note set **by construction**:
an annotation IS a below-note that happens to be italic-only.

The old per-layout `> .cell-stage >` arms went with them, and keying on the wrapper is what
makes that safe. Measured across all 61 layouts, every KERNEL-promoted note lands in
`.cell-coda` — but that is not the only legal place a `.below-note` can be, and the first
cut of this change assumed it was. `section .below-note` reaches the wrapper wherever it
sits; a note left loose in the stage on a layout that CLAIMED the paragraph never gets one,
because the kernel is what emits the class.

**One name list survives, deliberately.** The CSS-only fallback tier serves a Marp deck that
loads `lattice.css` without the runtime — a real configuration, since the marp-kit loads the
runtime through per-deck `<script>` tags rather than its config. There is no coda cell on
that surface and no Form structure, so the raw trailing `<p>` needs the treatment directly,
and the layout's claim is visible only in its class name. That tier was covering 15 layouts
while 36 render a note. It is now the full set, written as `section:is(…)` (scope-safe: the
packer keys on the leftmost compound, which a `section:is()` head satisfies — only a LEADING
`:is(section.x, …)` needs distributing, which is what the note it replaces was about), and
`test/unit/transformers/coda-fallback-union.test.js` **derives** the expected set from
`blocksFor()` and fails on a missing name AND a stale one. Verified able to fail by mutation
in both directions.

That test is not the CSS-parsing drift test `2026-08-24` deleted, and the difference is the
direction of the arrow. The deleted one mirrored a CSS `:not()` chain into a hand-kept JS
array and could only confirm that two hand-written lists still matched each other. This one
computes the answer from the catalog and asks whether the CSS agrees.

**Two claims dropped**, with their dead CSS: `diagram`'s `.diagram-caption` rule and its
`base.accent-finish.css` arm are deleted, following the `code` precedent exactly. Three more
were proposed and are NOT dropped — §4 is about why, and about the probe that mis-read them.

## 4. Three claims looked dead and are not — and the probe is why

This is the more useful half of the audit, because it is a lesson about the INSTRUMENT.

**The probe appends a beat, and that is exactly what hides a legend.** Every probe slide is
`<component sample>` + a key insight + a trailing paragraph. On `matrix-grid` and
`state-chart` the sample ALREADY ends in a paragraph — their documented `legend` slot
(`p:last-of-type`), which the transform pre-wraps in a span so `liftChartCaption` lifts it
into `.chart-caption` as one inline run instead of tearing into four flex items. Appending
a second paragraph displaces the legend from the anchor `liftChartCaption` matches
(`/<p…>…<\/p>\s*$/`), so on the probe NEITHER paragraph became a caption and the layout
looked exactly like one whose claim protects nothing.

I dropped both claims on that reading. Rendering the BARE samples — the manifest sample and
nothing else, which is how anyone actually writes the slide — shows what really happens:

| | claim dropped | claim kept |
|---|---|---|
| `matrix-grid` legend | `.below-note` in the coda band | `.chart-caption` |
| `state-chart` legend | `.below-note` in the coda band | `.chart-caption` |

The chart loses its legend. Both claims are restored, and their entry in `2026-08-24` §5 —
"render neither a caption nor a below-note … their claim is correct in effect and wrong in
reason" — is corrected here: the claim is correct in effect AND in reason, and that note
reached the same wrong conclusion from the same kind of probe.

**`math` is the third, and it fails differently.** Dropping its claim does dock the note in
the band, but the band lands in the wrong place. Measured on the probe, band geometry
against the section box:

| layout | band width | distance above the footer |
|---|---|---|
| `content`, `list` (the reference) | 1152px @ x=64 | 56px |
| `big-number`, `diagram` (dropped) | 1152px @ x=64 | 56px |
| **`math`** | **584.6px** | **376.3px** |

`math` docks `grid`, and `math.styles.css` puts every non-heading child in `grid-row: 3` —
the body's own row — so the band lands beside the equation rather than beneath it. That is
the per-variant/per-structure limit `2026-08-24` §8 records for `scene` and `video`, reached
from a third direction. One manifest value cannot describe it, and fixing it is a layout
change rather than a claim change, so the claim stays and math still hosts no note.

**What the instrument needs, if this is ever run again:** probe each layout BOTH ways — with
a beat appended and with the bare sample. The appended form is what proves a layout can host
the beat; the bare form is what proves the claim is not protecting something real. Neither
alone is enough, and the appended form alone is what produced both this note's first wrong
answer and `2026-08-24` §5's.

## 4b. The ghost names were not ghosts, and the trio caught it

The first revision of this note, its commit message, the changelog, `base.docs.md`,
`base.modifiers.css` **and a gate's own failure message** all asserted that `timeline`
and `principles` "are not components at all, so those arms had never matched anything in
any render." The first half is true. **The second half is false**, and the inversion lens
found it.

Both are VARIANT classes: `timeline` on `inventory` and `regulatory-update`, `principles`
on `list` (`inventory.manifest.json`, `list.manifest.json`). A real slide carries
`class="inventory timeline form"`, so `section.timeline .below-note > p:has(> em:only-child)`
matched it. And it was doing WORK: `inventory` was not in the seventeen, so that arm was
the union's only route to an annotation on an `inventory timeline` slide. `principles` was
the redundant one — its base `list` was already in the union.

**The instrument is why.** The probe renders one slide per component NAME and never
composes a variant, so it could not have observed a match if one existed. "Never matched"
was not a measurement; it was the absence of one, reported as a finding. This is the same
error shape as §4 — a probe's blind spot read as a property of the tree — twice in one
change, which is the argument for the tier rather than against the probe.

Nothing about the fix changes: the wrapper-keyed rule reaches an `inventory timeline`
slide like any other. What changes is the REASON, and it mattered enough to correct in six
places because one of them was a machine refusing a future arm while citing a precedent
that never happened.

## 5. What this change BROKE, and where it was caught

**The split envelope mirrored the annotation enumeration by hand.** `base.modifiers.css`
carried a "rule 3" — twice, once for `lat-split-native` and once for `lat-split-cards` —
whose 16-arm `:not()` chain existed to size an em-only note *on layouts the annotation did
not cover*, because such a note otherwise got no sizing and rendered LARGER than an ordinary
one beside it (43.5px vs 37px, measured when it was written). Its own comment says the chain
"MIRRORS that rule's own enumeration exactly … so the two cannot drift apart."

Making the register universal empties the set that rule serves — and a stale copy would have
been worse than no rule at all, because 16 `:not()` arms out-specify the register: every
annotation on a split page outside the old sixteen would have been forced to
`--fs-body-compact`, spark and dotted rule at the wrong size. Both copies are deleted.

**It was caught by the test written for something else**, which is worth recording. The
fallback-union test's "tier 1 names no component" arm swept every line mentioning the cell
and hit the split rule. The first version of that assertion was too broad and I narrowed it —
but the broad version is what surfaced the mirror. `2026-08-24` §8 ends on "moving a
universal cell is not a local edit, and the gate that would have caught it is a census of who
addresses the cell, which does not exist." It still does not. What exists now is one test
that reads the cell's selectors, and it earned its place on its first run.

## 6. What was NOT taken

**The grammar rework.** Positional inference is the root cause: all three registers are
inferred from position and element type (last blockquote, last paragraph, last italic-only
paragraph), and on 17 layouts that exact shape is already the component's own anatomy. That
is why the set can never reach 61 by dropping claims — 12 of the surviving claims are real
chart captions. Giving the beats a marker their anatomy cannot collide with (a required
em-dash prefix, say) would let a chart carry an unmarked caption AND a marked note, and take
all three registers to ~59/61. It is a breaking change to existing decks and needs the corpus
measured first. Put to the owner as an explicit fork; the truth pass was chosen, and this is
the truth pass.

**The `lat-split-cards` note rules address a shape the render no longer produces.** Both arms
key on `section > .below-note.lat-split-note`, and measured on `examples/split-envelope.md`
every split note — cards pages included — sits in `<div class="cell-coda lat-split-note">`.
The §8 sweep that added coda arms to the NATIVE rules missed these. Pre-existing, off the path
of this change, and it needs its own before/after on a cover-cards deck: logged in the file,
not pulled into this diff (HARD RULE #18).

**The trailing-pill rule's `:not()` chain also carries `principles` and `timeline`**
(`base.modifiers.css`, the `margin-left:auto` pill rule). Same two ghosts, different feature,
off-path. Logged here.

**The deck lint still says nothing about an annotation.** It fires on an inert `insight-*` or
`no-note` modifier, never on an authored shape — deliberately, because flagging the shape
itself would fire on every correctly-authored quote in the corpus. Now that the annotation
set equals the below-note set, there is nothing left for it to warn about that
`block-unsupported` does not already cover.
