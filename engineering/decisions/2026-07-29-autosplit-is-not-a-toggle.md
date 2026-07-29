---
status: shipped
summary: Retire `autosplit:` as a deck directive. A deck is authored once and presented at many sizes, so the page COUNT is not an authoring fact — it is a function of the content and the box. A toggle that turns pagination off does not express an authoring intent; the evidence is that in the whole history of the repo no deck has ever set it off, while the only things that want it off are measurement rigs and specimen slides, which want it for a different reason (page N must equal slide N so they can measure). Splitting becomes intrinsic, gated only on "overflows AND has a seam"; the ring stays for content with no seam. The instrumentation need moves off the authoring surface to a `--no-split` tool flag and the existing per-slide `stress-slide` marker.
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

## The landscape gate goes too

Split is currently skipped outright on landscape @sizes. The rationale in
`lattice-emulator.js` is that *"in a wide box, collapse + shed resolve overflow before
split is ever reached."* That is an assumption, and it is false — measured, four
committed landscape decks clip today with no recourse:

    examples/README.md              1 slide
    examples/image-set-export.md    1 slide
    examples/overflow-fix-me.md     3 slides   (a deliberate specimen)
    examples/q-and-a.md             1 slide

If size is presentation, landscape is just another presentation. The gate should be
"does it overflow, and is there a seam" — a question about the content in its box —
never "which box shape is it". The specimen in that list is exactly the case
`stress-slide` covers.

## What does NOT change

- **The ring stays, and is not a toggle either.** Content with no seam — a figure, an
  atomic text grid — still rings on overflow. "Splitting is intrinsic" does not mean
  "nothing ever clips"; it means clipping stops being the *default answer for content
  that could have paginated*.
- **The per-component enrollment gate stays** (§8 rule 3 of the split note: a rendered
  collection does not imply a seam). That gate is about whether a seam EXISTS, which is
  a real property of the component. This note retires the DECK-level toggle, not that.
- **Landscape output for content that fits is byte-identical.** Removing the gate
  changes only slides that overflow.

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
  portrait/square/story/mobile, the earlier flip to default-on moved exactly one of
  thirteen example decks, and that one was shipping a clipped slide. For the landscape
  half, all 61 component galleries were swept: **5** carry a clipping slide, and
  cross-referenced against seam + specimen status only **one** actually splits —
  `kpi` and `policy-recommendation` are marked `stress-slide` (suppressed by design),
  `wifi` is atomic with no seam, `roadmap`'s table form has none either, and
  `inventory` splits, fixing a clip it has been shipping. So the change costs one
  golden and buys back a defect.
- **A deck author loses a lever they never used.** Retiring a directive is a breaking
  change to the authoring surface even when nothing used it. Decks carrying
  `autosplit:` should be cleaned up in the same change (HARD RULE #7 — no
  dead-but-present fields), and lint should name the directive as retired rather than
  ignore it silently.
- **Page counts become less predictable for a timed talk.** Real, and the honest answer
  is that the alternative was a clipped slide. The advisory
  (`capacity-autosplit`) already tells an author what will happen; that is where the
  predictability belongs, not in a switch that trades pages for lost content.
