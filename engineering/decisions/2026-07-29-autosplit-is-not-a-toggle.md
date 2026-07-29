---
status: shipped
summary: Retire `autosplit:` as a deck directive. A deck is authored once and presented at many sizes, so the page COUNT is not an authoring fact — it is a function of the content and the box. A toggle that turns pagination off does not express an authoring intent; the evidence is that in the whole history of the repo no deck has ever set it off, while the only things that want it off are measurement rigs and specimen slides, which want it for a different reason (page N must equal slide N so they can measure). Splitting becomes intrinsic, on two conditions the owner set and this note records after correcting itself on both — it fires on FIT, never on an authored count, and it fires at `square` · `tall` · `strip`, never at `wide`, because 16:9 is the box a deck is authored in. The ring stays for content with no seam and for a landscape slide that does not fit. The instrumentation need moves off the authoring surface to a `--no-split` tool flag and the existing per-slide `stress-slide` marker.
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

The measurement was right and the conclusion did not follow. **`hd` is where the deck is
composed.** An author looking at a 16:9 preview and adding a row is making a fit judgment
in that box; a slide that fits there is a slide they decided on. Pagination at wide is the
engine re-cutting a deck to solve a problem its author does not have.

`4K` is the same box. `cqi` is width-relative, so a 3840×2160 render is a 1920×1080 render
at 2× — identical layout, identical fit, no reason for them to behave differently. The
sizes that genuinely need pagination are the ones the deck was never authored for:
`square`, `portrait`, `story`, `mobile` — the same content meeting a box it was never
fitted to, where the choice is paginate or clip.

So the gate is the FAMILY, and it is named as a family rather than as a list of @size
names so a custom `size: 1000x1000` is classified correctly too:

| family | @sizes | split |
|---|---|---|
| `wide` | `hd` · `4K` · `16:9` | **no** — the authoring box |
| `square` | `square` | yes |
| `tall` | `portrait` · `story` | yes |
| `strip` | `mobile` | yes |

**What the first draft was reaching for is still real, and it is not the splitter's job.**
Four committed landscape decks clip today (`examples/README.md`, `image-set-export.md`,
`q-and-a.md`, and `overflow-fix-me.md`, which is a deliberate specimen), and five
component galleries carry a clipping slide at landscape. Those are authoring defects on
slides someone composed too full, and the terminal for them is the RING plus the
`capacity-overflow` lint warning that names the non-split explicitly — *"a landscape @size
does not paginate."* Splitting them would have hidden four real defects behind an
automatic re-cut.

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

To re-derive it: render any deck whose collection is over its component's `capacity.hard`
and still fits its box, and count the PDF's pages. The unit pin is the
`the split trigger is measured overflow, never the authored count` block in
`test/unit/core/auto-split.test.js`, which hands `resplitDoc` an over-capacity slide with
an EMPTY overflow verdict and asserts the bytes come back identical.

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
- **Landscape output is byte-identical, full stop** — not just for content that fits.
  With the family gate the wide path never reaches the splitter, so every `hd`/`4K` export
  is exactly what it was before this branch. Verified on the 12-item checklist above: the
  new `hd` render is pixel-identical to the previous head's `--no-split` render of the same
  deck, clip and ring included.
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
- **The `wide` clips this note's first draft found are now permanent until someone fixes
  them.** Four example decks and five galleries clip at landscape and will keep clipping.
  That is the intended outcome — they are over-full slides and the ring is the signal —
  but it is a standing debt, not a solved problem, and it is off this change's path
  (HARD RULE #18: found, not caused). One of them is worse than "clipped at the bottom":
  a `checklist` past its budget at `hd` scrolls its collection, so the FIRST item goes
  missing as well as the last. Worth its own look at the component's overflow behavior at
  `wide`; recorded here rather than pulled into this diff.
