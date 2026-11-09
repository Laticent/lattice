---
status: proposed
summary: >
  The owner's definition: a DYNAMIC component is anything the engine fills in from other facts in the deck. Two kinds:
  dynamic CONTENT (agenda, glossary, topic; the author places the slide and anything the author writes wins) and dynamic
  MARKS (page numbers, the section rail, the divider's count and numeral, the topic eyebrow, the proof color, the
  agenda's page references; stamped, switched on or off, never authored; they must agree). Measured on 539 committed
  decks: every page and section mark agrees today. Decided: a committed agreement test comes first, a shared counter
  only if that test ever needs one; the glossary moves to the fill model and must be the deck's last slide or slides; a
  citation syntax is designed next.
---

# Dynamic components: what the deck fills in for you

**Date:** 2026-11-08, revised 2026-11-09 after the adversarial trio and a measurement · **Asked by:** the owner, on
PR #3089 ("it seems to me agenda and glossary are special kinds of components … I call these dynamic components"; then
"anything that gets filled in based on other facts from the deck is a dynamic component"; then "we need to prove it
rather than assume") · **Status:** proposed, no code · **Follows:** `2026-11-08-agenda-styles-and-autofill.md` ·
**Resolves:** `followups.d/3089-p1-dynamic-components-design-note.md`

## The definition

**A dynamic component is anything the engine fills in from other facts in the deck**, so the author never types it.

The oldest one is the page number. Nobody types "7" on slide seven; the engine counts. The section rail is the same idea
one level up: it counts sections instead of slides. Each item below answers a question about the rest of the deck:
where is this slide, where does each section start, what are the other topics called, which terms has the author
defined.

## Two kinds, two sets of rules

| | **Dynamic content** | **Dynamic marks** |
|---|---|---|
| What it is | The slide exists to show what the engine gathers | A small fact the engine stamps onto a slide |
| Today | agenda (the sections), glossary (the terms), topic (the sibling topics in a section) | page numbers, the section rail, the divider's `2 / 4` marker and its `divider numbered` numeral, the topic eyebrow's section number, the proof panel's color, the agenda's page references |
| Who places it | The author places the slide; the engine never inserts one (the glossary is the one exception today, see below) | The engine stamps it where it applies |
| Can the author write it instead? | **Yes, and the author wins.** A written agenda list, an authored `_track` on a topic slide | No. The author switches it on or off (`paginate: false`, `progress-rail: off`, `no-progress`). Three authored overrides exist and stay: a proof's `cat-N`, a slide's own `progress-N`, and a topic slide's own eyebrow |
| Settings | One front-matter register, applied to that slide only (the `agenda:` shape) | The mark's own register or switch |
| When the deck lacks the facts | Render nothing and let lint say why (an agenda with one divider: `agenda-empty`) | Show nothing rather than a wrong value (the agenda's page references refuse when the count is in doubt, or when the list does not name the dividers in order) |
| The rule that matters most | The author's words are never overwritten | **Every mark agrees with every other mark** |

## The inventory, checked against the code

### Dynamic content

| Component | Reads | Writes | Built as |
|---|---|---|---|
| **agenda** (#3089) | the shown `divider` headings | the list and `progress-k` | source fill at the engine door, `lib/core/agenda-autofill.js` |
| **glossary** (`glossary: auto`) | the `definition` fields of `acronyms:` | one or more slides appended at the end, paged by venue | source transform, `lib/core/glossary-auto.mjs` `appendAutoGlossary`; its table on the live page, `lib/core/glossary-slide.js` |
| **topic** | the headings of the other `topic` slides in the section | the track along the bottom, current topic lit | render transform, both arms, `lib/transformers/topic-track.js`; an authored `_track` overrides (`overrideOf`) |

Agenda and topic already meet the content rules. The glossary does not: it inserts slides the source does not contain.
So four modules trim them back out with `withoutAutoGlossary` (`narration-bake.ts`, `narration-projection.ts`,
`share-export.ts`, `single-slide-render.ts`), and two more count them in with `autoGlossarySections`
(`docs/src/lib/playground-engine.ts`, `lattice.js`). Before that trim, 8 of the Q3 fixture's 17 slides were narrated with
different words in the Studio and in `lattice video`.

### Dynamic marks

| Mark | The fact it shows | Where it is counted |
|---|---|---|
| **page number** | this slide's place among the shown slides | `lib/engine/slides.js` (stamps `data-lattice-pagination`); a split's extra pages renumbered `4.2` by `lib/core/auto-split.js` `repaginate` |
| **section rail** | which section this slide is in, of how many | `lib/forms/tile/progress/progress.transform.js` (counts dividers; HTML and DOM arms) |
| **divider `2 / 4` marker** | this divider's section, of how many | the same file, the same divider count |
| **`divider numbered` numeral** | this divider's section number | `lib/core/section-index.js`, its own divider count (HTML and DOM arms) |
| **topic eyebrow** (`02 · <section>`) | the section this topic sits in | `lib/transformers/topic-track.js`, its own walk of the sections |
| **agenda page references** | the page each section starts on | `progress.transform.js` `withAgendaPagesHtml` / `agendaPagesDom`; dividers carry no page stamp, so it recounts the shown slides and attaches only when the list names the dividers in order |
| **proof color** | this proof slide's place among the proof slides | `lib/core/split-panels.js` `sequenceProofPanels`, and a second implementation in `lib/transformers/split-panels.js` |

The same two questions, "where is this slide?" and "where does each section start?", are answered by at least six
separate counts, five of them written twice (once per render path). Nothing in the code makes them agree. That is the
risk. The question this revision answers is whether they actually disagree.

The red team named more counts that read deck position and are not in the table: the split's k-of-N rail, the
`data-lattice-slide` stamps, the tile watermark glyph and the Studio's `pageOrigin`. The agreement test below covers the
first two; the others follow when the test is extended.

## The measurement: do the marks agree today?

A scratch script rendered every committed deck through the engine (539 decks: `examples/`, the exemplars,
`test/fixtures/`, the baseline decks, the component galleries and the design galleries; 0 render errors). For each deck
it built the ground truth from the source (the shown slides in order, the shown dividers, each slide's page and section)
and checked every mark against it: the page stamp, the divider's `k / N`, the `divider numbered` numeral, the rail's lit
dot, the topic eyebrow's number, the agenda's list and page references, and the proof color. Seven fixtures were added
for the hard cases: a divider with focus steps, a hidden divider, a hidden proof slide, `split: headings`, a reordered
agenda list, `paginate: false` and a twelve-section deck.

**Result: every page number, section count, numeral, rail and agenda page reference agreed, on all 539 decks and on
every fixture.** The red team's predicted disagreement on a divider with focus steps did not reproduce: the divider
renders once as `1 / 2` and `2 / 2`, and the agenda shows p.2 and p.4, as it should.

Two real differences, neither in the page or section counts:

1. **A hidden proof slide still takes a color.** The proof color counts every proof slide, hidden ones included, the
   way it already counts one that pins its own `cat-N` (the comment at `sequenceProofPanels` says why: an override must
   not shift the hue of every slide after it). Pagination counts shown slides only. These are different rules on
   purpose, and the purpose holds: a color is the slide's identity, so hiding one slide for a lens must not recolor the
   slides a reader already saw in the full deck. A page number is a position, so it must follow what is shown.
   **Recommendation: keep it, and write the rule down as the test's one sanctioned exception.**
2. **The topic eyebrow keeps a heading's closing period; the agenda drops it.** In `examples/topic.md` the eyebrow reads
   `02 · Where the money actually goes.` while the agenda lists `Where the money actually goes`. Four places. Small,
   visible, and outside this note: logged as a follow-up.

Three expected results confirmed: a reordered agenda list gets no page references (the by-name fix in this PR);
`split: headings` leaves an agenda empty (documented); `paginate: false` drops the references (by design).

## What this changes: a test, not a counter

The earlier draft proposed one shared deck counter, the only source every mark reads. The measurement takes the urgency
out of it: the marks agree today, and a counter would rewrite six working counts to prevent a drift nobody has seen.
It would also not be one piece of code. It needs a source count (the agenda fill and the glossary run before render)
and a render count (the marks), and because dividers carry no page stamp, it must recount slides rather than read the
stamp.

What actually protects a boardroom deck is a test that fails the day two marks disagree. So:

**A committed agreement test comes first.** It renders the committed decks and the hard-case fixtures, builds the
ground truth from the source, and checks every mark against it, with the proof color's hidden-slide rule as its one
sanctioned exception. It lives in the integration tier (it renders decks), so it adds a test, not a CI job. Its job is
to make "they agree" a checked fact instead of a lucky one.

**A shared counter is built only if that test ever needs one**: when a new mark joins, or when two marks are found to
disagree and the fix is cheaper as one count than as a patch to one of them.

The earlier draft also proposed replacing the one-slide preview's four `DECK_DERIVED_FACTS` entries with one rule ("this
deck has a dynamic component"). Dropped: that rule would mark nearly every deck, since almost every deck has page
numbers, and the four entries are each narrower and correct.

## The glossary on the content rules

An empty `_class: glossary` slide fills from the `acronyms:` definitions, paged by venue as today. Once that slide is in
the source, the glossary meets the content rules and the six trims and counts above can go.

**It must be the deck's last slide or slides.** A long glossary pages into N slides. Placed mid-deck, that shifts every
slide after it, which is exactly the problem the fill model exists to avoid. At the end it shifts nothing that matters.
Lint warns on a filled glossary that is not last.

`glossary: auto` as it stands inserts the slide, so a one-time lint autofix writes the empty glossary slide at the end
of the source and drops the key, and the engine keeps honoring the old key until decks have moved. Today's `applyFix`
(`lib/authoring/lint-core.js`) rewrites one located line; this fix is two edits in different places, so it needs a
two-part fix shape or two findings that apply together.

The move is not invisible, and the plan must say so. Today video narration, Present, the closing check and the exported
glossary term list all key on `glossary: auto`. Each must switch to reading the glossary slide, and each switch is
verified on its real surface (#23), not by unit test alone.

## A manifest field

`"dynamic": { "kind": "content" | "mark", "reads": "dividers" | "acronyms" | "topics" | "pages" | "order" }` in a
component's manifest, so the component docs ("fills itself from …") and the authoring skills find dynamic components
without a hand-kept list. **Not decided:** the owner has not been asked about it, and with the preview's one rule
dropped, its main consumer is gone. It stays a proposal until the docs or the skills need it.

## Decided

| | Decision | Owner's pick |
|---|---|---|
| D1 | The definition | **Anything the engine fills in from other facts in the deck**, with the two kinds and their rules above (2026-11-08) |
| D2 | The glossary | **Fill model, as the deck's last slide or slides, with a one-time lint fix** that writes the slide into the source; the old key honored meanwhile (2026-11-08, last-slide rule 2026-11-09) |
| D3 | Agreement | **A committed agreement test first; a shared counter only if needed.** The preview's one rule dropped (2026-11-09: "we need to prove it rather than assume") |
| D4 | The manifest `dynamic` field | **Not asked.** A proposal until a consumer needs it |
| D5 | A sources slide | **Design the citation syntax next**; a sources slide is its first consumer (2026-11-08) |

## The work this sets up, in order

1. **The agreement test** (one PR): the scratch measurement turned into an integration test over the committed decks and
   the seven fixtures, with the proof color's hidden-slide rule as its sanctioned exception, and the count sites the red
   team added (the split rail, the `data-lattice-slide` stamps). `followups.d/3096-p1-mark-agreement-test.md`.
2. **The glossary on the fill model** (one PR): the empty-slide fill, the last-slide lint, the two-part autofix, the six
   trims and counts retired, and narration, Present, the closing check and the term export moved off the key, each
   verified on its surface. `followups.d/3096-p2-glossary-fill-model.md`.
3. **The citation syntax** (a design note first): how an author cites a source on a slide, and what a sources slide
   gathers. `followups.d/3096-p3-citation-syntax-note.md`.
4. **The eyebrow's closing period**, matched to the agenda. `followups.d/3096-p4-topic-eyebrow-period.md`.

## Not decided here

- Whether a shared counter is ever built. The agreement test decides that, by failing or not.
- Whether narration reads a counter. It reads the rendered slides today and agrees.
- Any visible change to a mark beyond the eyebrow's period.
