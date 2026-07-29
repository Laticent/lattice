---
status: shipped
summary: Retire `autosplit:` as a deck directive. A deck is authored once and presented at many sizes, so the page COUNT is not an authoring fact — it is a function of the content and the box. A toggle that turns pagination off does not express an authoring intent; the evidence is that in the whole history of the repo no deck has ever set it off, while the only things that want it off are measurement rigs and specimen slides, which want it for a different reason (page N must equal slide N so they can measure). Splitting becomes intrinsic, on two conditions the owner set and this note records after correcting itself on both — it fires on FIT, never on an authored count, and it fires at `square` · `tall` · `strip`, never at `wide`. The reason for the second one was itself corrected twice: not "16:9 is the authoring box" (this repo has no render-time size override, twenty example decks are portrait-native, and the Studio's own source forbids assuming 16:9), but "at `wide`, overflow is almost always a LAYOUT defect and pagination produces a worse artifact than the clip" — demonstrated on `inventory editorial`, where the split was papering over a grid-placement bug that is fixed here instead. The terminal at `wide` is a clipped page plus a build-time stderr line, NOT a ring (the export strips it) and not a lint warning (the four clipping decks overflow by density, which a count cannot see); that gap is logged as the change's sharpest open risk. The instrumentation need moves off the authoring surface to a `--no-split` tool flag and the existing per-slide `stress-slide` marker.
builds-on: 2026-06-22-the-fit-spine.md, 2026-07-22-structure-derived-split-patterns.md, 2026-07-27-family-stamp-replaces-container-queries.md
---

# Auto-split is not a toggle

**Date:** 2026-07-29 · **Status:** Shipped · **Decision owner:** Sharmarke

This supersedes a decision made two commits earlier on the same branch. #1234 flipped
`autosplit` from opt-in to default-on for non-landscape decks, on the strength of a
catalog audit. That was the right direction and the wrong altitude — it kept the
directive, and the directive is the thing that shouldn't exist.

## The argument

A deck is authored once. `size:` is a property of how it is *presented*, not of what
was written — the same markdown renders at `hd`, `portrait`, `story`, `mobile`. It
follows that **the number of pages is not an authoring fact.** An author writes one
`premise` with eight rows; that is one unit of content, and it is one page in a wide
box and a cover plus two body pages in a tall one. They did not author three slides.

If page count is a function of content and box, then whatever produces it cannot be an
authoring-time switch. `autosplit: off` does not say "this deck should be paginated
differently" — it says "at this size, do not paginate; clip instead." That is not an
intent anyone holds about a deck they want people to read.

The Fit Spine already implies this and stops one step short. It forbids a shrink
primitive outright — *"there is no fifth move, and crucially no shrink move"* — which
leaves exactly two terminals when content does not fit: **SPLIT**, or the honest
**ring**. Making split opt-in made the ring the default terminal for any author who
had never heard of the flag. The engine's stated policy and its out-of-the-box
behavior disagreed, and the behavior was the worse of the two.

## The evidence, which is stronger than the argument

**No deck has ever turned it off.** Every deck in the repository that mentions
`autosplit` sets it **on** — six example decks, four test fixtures. Nothing sets it
off. The `off` value has never once expressed an authoring intent, because nobody has
ever wanted the thing it does.

What *does* want splitting suppressed is instrumentation, and it wants it for a reason
that has nothing to do with authoring:

- **`tools/check-family-tiers.js`'s sweep** measures the un-split terminal on purpose
  — "what clips when nothing paginates" — and needs a 1:1 page↔component mapping.
- **`tools/lib/calibrate-core.js`'s graded deck** needs page N to equal step N, or
  every measured ceiling reads wrong.

Both want *the whole deck* held still so they can measure it. That is a tool concern,
and it belongs on the tool, not in front matter where an author can reach it and get a
clipped deck.

## What replaces it

| need | today | after |
|---|---|---|
| ordinary authoring | `autosplit: on` (or clip) | nothing — splitting is intrinsic |
| measurement rigs | `autosplit: off` in a synthetic deck | `--no-split` on the emulator |
| a specimen that demonstrates overflow | `autosplit: off` on the deck | `<!-- stress-slide -->` on the slide |

`stress-slide` already exists and already means exactly this: the gallery builder
emits it, and `lint-core` already uses it to suppress `capacity-crowd`, on the stated
ground that such a slide *"EXISTS to show the upper limit."* A slide that exists to
show overflow should not be paginated out of showing it. Extending the marker to
suppress the split is the same meaning applied to the other mechanism, not a new
concept — and it is per-SLIDE, which is the right altitude for "this one is the
exhibit".

## Two corrections, both from the owner, both against this note's first draft

The first draft of this note took "size is presentation" one step further than it goes
and got two things wrong. Both are recorded here in place, because the wrong version
shipped on this branch for a few commits and the reasoning that produced it is the part
worth keeping.

### 1. Landscape is not another presentation — it is the authoring box

The first draft removed the landscape gate, on this argument:

> Split is currently skipped outright on landscape @sizes. The rationale is that *"in a
> wide box, collapse + shed resolve overflow before split is ever reached"* — an
> assumption, and measured it is false. If size is presentation, landscape is just
> another presentation. The gate should be "does it overflow, and is there a seam",
> never "which box shape is it".

The measurement was right and the conclusion did not follow. The gate stays. But the reason
below is the **second** one this note gave, because the first one was also wrong, and it is
worth recording what it was:

> ~~**`hd` is where the deck is composed.** An author looking at a 16:9 preview and adding a
> row is making a fit judgment in that box; a slide that fits there is a slide they decided
> on. Pagination at wide is the engine re-cutting a deck to solve a problem its author does
> not have.~~

**This repository refutes that.** There is no render-time size override — no `--size` flag
exists, and the Studio's `setDeckSize` *writes `size:` into the source* — so a deck has exactly
one size, the one its author chose, and that is the box they composed in **whatever it is**.
Twenty committed example decks are portrait-native (`social-story.md`, `portrait-journey.md`,
`legend-below-portrait.md`, …), and `docs/src/components/studio/slide-size.ts` opens with the
rebuttal in its own words: *"Slides have an author-chosen size — the skeleton must honor it,
never assume 16:9."* Worse, the premise the whole note opens with — *a deck is authored once
and presented at many sizes* — has no mechanism behind it today. Changing the size is an edit.
Found by the adversarial trio's inversion pass (#1234).

**The reason that survives is narrower and testable: at `wide`, overflow is almost always a
LAYOUT defect, and pagination produces a worse artifact than the clip.** Worked case, the one
this gate was measured against: `inventory editorial`'s gallery slide is four items against a
budget of six. Splitting it at `hd` turned a four-item list into a four-page run with two of
the pages nearly empty. Not splitting it left a sentence cut mid-phrase. **Neither terminal was
acceptable, because neither addressed the actual defect** — the variant was placing its sidebar
in an implicit second grid row (see §"What this note caused", below). Pagination was papering
over a placement bug. That is the shape of the argument: a wide box is short and roomy across,
so when something does not fit there it is usually built wrong, and cutting it into pages hides
the evidence.

That reason is falsifiable, which the first one was not. If landscape clips later turn out to
be ordinary decks that drifted over the line rather than broken layouts, the gate should be
revisited — as a measurement, not a re-argument from first principles.

`4K` is not a separate case. `cqi` is width-relative, so a 3840×2160 render is a 1920×1080
render at 2× — identical layout, identical fit. Verified: `examples/q-and-a.md` clips on the
same page at both.

The gate is therefore the FAMILY, so a geometry registered by a custom `@size` is classified by
its shape rather than by whether anyone added its NAME to a list:

| family | @sizes | split |
|---|---|---|
| `wide` | `hd` · `4K` · `16:9` · `standard` | **no** |
| `square` | `square` · `1:1` | yes |
| `tall` | `portrait` · `story` · `4:5` · `9:16` · `reel` | yes |
| `strip` | `mobile` | yes |

**What the first draft was reaching for is real, and it is not the splitter's job.** Four
committed landscape decks clip (`examples/README.md`, `image-set-export.md`, `q-and-a.md`, and
`overflow-fix-me.md`, a deliberate specimen), and **four** component galleries do — `roadmap`,
`wifi`, `kpi`, `policy-recommendation`, eight pages between them (re-measured 2026-07-29 after
the `inventory` fix below removed the fifth; `wifi`'s three are the same slide in three looks,
which is a component defect, not an author writing too much). Splitting them would have hidden
every one behind an automatic re-cut.

**What the terminal at `wide` actually is — stated precisely, because an earlier draft of this
section got it wrong twice in one sentence.** It claimed the terminal was *"the RING plus the
`capacity-overflow` lint warning."* Neither fires:

- **The ring never reaches the artifact.** `lattice-emulator.js` strips the overflow marker
  before printing, deliberately (*"a red box in front of a board is worse than the silent
  clip"*), and says so in the warning itself: *"The export stays clean — no overflow marker is
  printed."*
- **`capacity-overflow` fires on none of those four decks.** It counts members against
  `capacity.hard`, and all four overflow by DENSITY — the class this note's own §2 says no count
  threshold can see. `lint:deck --strict` reports zero errors and zero warnings on each.

So the real terminal is: **a clipped page, and one line on stderr at build time.** That is thin,
and calling it thin is the point — the honesty argument for preferring the ring to a shrink
primitive only works if the signal is real. The lint fix text has been rewritten to promise no
ring, and the gap is logged in Risks below rather than papered over.

### 2. Split fires on FIT, never on an authored count

The engine had **two** split triggers, and the second one was quietly the more aggressive.
A pre-render pass (`autoSplitDeck`) counted each collection against `capacity.hard` and
handed every over-budget slide to the measured loop as a candidate — explicitly including
the slides that measured *no* overflow, because otherwise "the count signal would do
nothing." So a slide authored past its budget that fit its box comfortably was cut anyway.

Twelve one-line checklist items at `size: portrait` — `hard` is 9, and they occupy a
little over a third of a 1080×1920 canvas:

    before   3 pages   (cover + 2 body pages)
    after    1 page

Both fixtures are committed — `test/fixtures/split-trigger-fits-tall.md` is that deck — so
the before/after is reproducible rather than a number in this prose.

**The pin is `test/integration/invariants/split-trigger.test.js`**, and it has to be an
integration test because both mechanisms live in the emulator. An earlier draft of this note
cited a unit block in `test/unit/core/auto-split.test.js` instead. That citation was wrong,
and wrong in the way this whole branch is about: the block *cannot* fail. The count trigger
never lived in `resplitDoc` — it lived in `autoSplitDeck` plus the emulator's
`DEFERRED_BY_COUNT` wiring, and that wiring fed the measured loop a NON-empty verdict, so
handing `resplitDoc` an empty one was a no-op before the change as much as after. The
adversarial checker proved it by running the new tests against the old kernel: 30/30 passed.
Both halves of this change shipped with no test that fails on revert; the integration file
closes that, and its landscape case was verified to fail when the gate is removed.

That is the engine second-guessing an author who stayed inside the geometry, and it is the
same instinct as a shrink primitive wearing different clothes: the content was legible and
correct, and something decided it knew better. **`capacity` is an editorial budget**, not a
fit predictor — measured against a synthetic probe deck nobody ships
(`2026-07-28-capacity-basis.md`), too generous on 23 of 25 components, and blind to the
look modifier and to everything else on the slide. It has one consumer, `lint:deck`, and
one job: telling an author "six entries is crowded here."

The splitter now reads `capacity` for **pacing only** — how many members ride one page
*once a cut has been decided*. The decision itself is a fact about glyphs in a box, and
only the measured pass knows it. `autoSplitDeck` is deleted rather than left as a no-op.

**The advisory had to become conditional to stay true.** `capacity-autosplit` used to say
"auto-split will divide it into 4 pages of 4"; it now says "**if it does not fit**, …4 **or
more** pages of 4". Both edits are forced: a fitting slide is not divided at all, and when
one is, `resplitDoc` paces at the tighter of the authored target and the measured ratio —
so the count can only bound the run from below. And at `wide` the advisory does not appear
at all; `capacity-overflow` does, because nothing will be split there.

## What does NOT change

- **The ring stays, and is not a toggle either.** Content with no seam — a figure, an
  atomic text grid — still rings on overflow, and so does anything that does not fit at
  `wide`. "Splitting is intrinsic" does not mean "nothing ever clips"; it means clipping
  stops being the *default answer, at a presentation size, for content that could have
  paginated*.
- **The per-component enrollment gate stays** (§8 rule 3 of the split note: a rendered
  collection does not imply a seam). That gate is about whether a seam EXISTS, which is
  a real property of the component. This note retires the DECK-level toggle, not that.
- **Landscape LAYOUT is unchanged** — not just for content that fits. With the family gate the
  wide path never reaches the splitter, so every `hd`/`4K` export lays out exactly as it did
  before this branch. Verified two ways: the 12-item checklist above renders pixel-identical to
  the previous head's `--no-split` render of the same deck (clip and all), and the `inventory`
  gallery is pixel-identical at 200 dpi on all 11 pages against the branch base.
  *Not* byte-identical, which an earlier draft claimed: a re-rendered PDF differs in
  `CreationDate`/`ModDate` and deflate jitter. Text layer and every rasterized page match; the
  bytes do not, and the sentence should never have said "full stop".
- **`capacity.hard` keeps its meaning** — an editorial budget. What changed is that the
  splitter stopped reading it as a fit verdict; `lint:deck` still reports it, and the
  numbers themselves are untouched (they are `2026-07-28-capacity-basis.md`'s business).

## The blocker this depends on, and why it landed first

**Everything keyed by slide index breaks when the page count changes**, and making
split intrinsic makes that universal.

Speaker notes were the sharp case: a deck with ONE split slide lost EVERY note
annotation, because `embedNotesInPdf` guards on `notes.length === pages.length` and
the authored array is shorter after a split. Correct guard, all-or-nothing failure.
Fixed first and separately (`fix(notes)`, this branch) by binding notes to rendered
pages — the splitter already carries each body page's aside, so nothing had to be
guessed.

Front-matter captions carry the same defect and are already declared unsafe under
autosplit ("keys are unsafe under autosplit (section count shifts)"). That one is
**still open** and is named here rather than discovered later.

## Risks

- **Committed artifacts move — measured, and the answer is small.** At
  portrait/square/story/mobile, the flip to intrinsic moved exactly one of thirteen
  example decks, and that one was shipping a clipped slide. Landscape moves nothing at
  all under the family gate. (The first draft, without the gate, swept all 61 component
  galleries: 5 carried a clipping slide at landscape, and cross-referenced against seam +
  specimen status exactly one — `inventory` — would have split. That sweep is what the
  landscape section above cites as evidence of real authoring defects; with the gate
  restored, none of the five is re-cut and all five still ring.)
- **A deck author loses a lever they never used.** Retiring a directive is a breaking
  change to the authoring surface even when nothing used it. Decks carrying
  `autosplit:` should be cleaned up in the same change (HARD RULE #7 — no
  dead-but-present fields), and lint should name the directive as retired rather than
  ignore it silently.
- **Page counts become less predictable for a timed talk.** Real at the presentation
  sizes, and the honest answer is that the alternative was a clipped slide. Two things
  bound it: the authoring size (`wide`) never re-paginates, so the deck an author rehearses
  has the page count they see; and `capacity-autosplit` tells them which slides *may* grow
  and by roughly how much at the other sizes.
- **The `wide` clips are permanent until someone fixes them, AND NOTHING WATCHES THEM.** This
  is the sharpest open risk, and it is the one the trio's inversion pass rated most likely to
  go unnoticed. Four example decks and four galleries clip at landscape and will keep clipping.
  That much is the intended outcome. What is not acceptable is that no gate can see it:
  - `test/oracle/family-overflow.json` records `"hd": []` — the committed record asserts that
    *nothing clips at landscape* — because it sweeps synthetic per-component skeletons, not the
    real galleries;
  - `lint:deck:all --strict` passes at 245 files while four decks clip, because they overflow
    by density and `capacity-overflow` counts members;
  - `npm run build` regenerates the gallery PDFs and exits 0 with the clipped pages in them.

  So "the ring is their terminal" degrades quietly into "nobody will ever know", and every
  future font tweak or `--fs-*` re-tune moves the line with nothing to catch it. **The
  recommended follow-up is a `wide`-clip ratchet**: an exceed-only budget measured against the
  REAL galleries and example decks, seeded at today's four-and-four, with `overflow-fix-me.md`
  and the two `stress-slide` pages allowlisted. HARD RULE #18 says log a found defect rather
  than ignore it; a paragraph in an ADR is the weakest possible log, and this bullet is an
  admission of that, not a discharge of it.
  Two individual notes worth carrying: a `checklist` past its budget at `hd` *scrolls* its
  collection, so the FIRST item goes missing as well as the last — worse than "clipped at the
  bottom"; and `wifi`'s three clipped pages are one slide in three looks, i.e. a component
  defect rather than an author writing too much.
- **`examples/data-viz-gallery.dark.pdf` is stale** (committed 15 pages, renders 16), since
  well before this branch. It has no same-named `.md`, so a sweep keyed on
  `<name>.md → <name>.pdf` — including the one this branch ran — skips it. Off-path
  pre-existing; logged here, not pulled into the diff.

## What this note caused, and had to fix

Restoring the gate un-fixed something. `inventory editorial`'s gallery slide had been clipping
at `hd`; the landscape split introduced two commits earlier turned it into a clean three-page
run, and this change reverted it to one clipped page. The committed docs artifact shipped its
sidebar cut mid-phrase — *"The sidebar carries the register's one"*, the word **takeaway.**
simply gone, with no ring in the export to say so. I rasterized that page during review, in a
three-across contact sheet at 40 dpi, and read it as fine; a missing final word is invisible at
that size. The trio found it.

Neither terminal was acceptable, and chasing that is what produced the real diagnosis. **The
variant was placing its sidebar in an implicit second grid ROW.** `grid-column` names a column,
not a cell; auto-placement walks children in source order and never goes backwards. An author who
writes the list first and the takeaway after — the natural order, and the order the component's
own gallery and skeleton use — gets the `<ul>` in row 1 column 2, and the blockquote then cannot
be placed beside it, so it opens row 2. Measured on the shipped slide: items at 209–565px in
column 2, blockquote BELOW them at 572–653px against a content cell ending at 616. The left
column was a tall void and the takeaway's second line fell 37px outside the clip box.

`grid-row: 1` on both children fixes it at its cause, for either authoring order. The gallery
is clean at landscape now, which is why the standing-debt count above is four galleries and not
five.

**And the fix exposed a second defect in the same variant**, which is the more useful finding.
The family reflow sets `grid-template-columns: 1fr` at `tall`/`strip` but never reset the
children's `grid-column` — and a grid asked for a column its template does not define simply
creates an implicit one. So the two-column form survived the reflow intact, with the takeaway
squeezed into a narrow rail; at `mobile` it wrapped one word per line down the left edge. It
looked right at `portrait` purely by accident: that box splits, and a split body page is caught
by the `lat-split-native` rule, which does reset `grid-column`. Unsplit — `mobile`, or any tall
deck short enough to fit — nothing reset it, and nothing ever had.

That is the general lesson worth keeping: **`grid-template-columns` on the container does not
collapse a grid whose children name their own columns.** Any component that reflows a
multi-column stage by rewriting the template alone has the same latent bug.
