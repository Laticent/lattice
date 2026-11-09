---
status: proposed
summary: >
  The owner's definition: a DYNAMIC component is anything the engine fills in from other facts in the deck. Two kinds with
  different rules: dynamic CONTENT (agenda, glossary, topic: the slide exists to show what the engine gathers; the author
  places it and anything the author writes wins) and dynamic MARKS (page numbers, the section rail, the divider's count
  and numeral, the proof color, the agenda's page references: stamped, switched on or off, never authored; every mark
  agrees with every other and shows nothing when unsure). Decided: the glossary moves to the fill model with a one-time
  lint fix; one shared deck counter is built with that work and becomes the only source every mark reads; a citation
  syntax is designed next.
---

# Dynamic components: what the deck fills in for you

**Date:** 2026-11-08 · **Asked by:** the owner, on PR #3089 ("it seems to me agenda and glossary are special kinds of
components … I call these dynamic components"; then: "the progress rail (count and marks) is akin to pagination though
higher order of it. anything that gets filled in based on other facts from the deck is a dynamic component") ·
**Status:** proposed, no code · **Follows:** `2026-11-08-agenda-styles-and-autofill.md` · **Resolves:**
`followups.d/3089-p1-dynamic-components-design-note.md`

## The definition

**A dynamic component is anything the engine fills in from other facts in the deck**, so the author never types it.

The oldest one is the page number. Nobody types "7" on slide seven; the engine counts. The section rail is the same idea
one level up: it counts sections instead of slides. Everything below is an answer to a question about the rest of the
deck: where is this slide, where does each section start, what are the other topics called, which terms has the author
defined.

## Two kinds, two sets of rules

| | **Dynamic content** | **Dynamic marks** |
|---|---|---|
| What it is | The slide exists to show what the engine gathers | A small fact the engine stamps onto a slide |
| Today | agenda (the sections), glossary (the terms), topic (the sibling topics in a section) | page numbers, the section rail, the divider's `2 / 4` marker and its `divider numbered` numeral, the topic eyebrow's section number, the proof panel's color, the agenda's page references |
| Who places it | The author places the slide; the engine never inserts one | The engine stamps it where it applies |
| Can the author write it instead? | **Yes, and the author wins.** A written agenda list, an authored `_track` on a topic slide | No. The author switches it on or off (`paginate: false`, `progress-rail: off`, `no-progress`); a proof's authored `cat-N` is the one override |
| Settings | One front-matter register, applied to that slide only (the `agenda:` shape) | The mark's own register or switch |
| When the deck lacks the facts | Render nothing and let lint say why (an agenda with one divider: `agenda-empty`) | Show nothing rather than a wrong value (the agenda's page references refuse when the count is in doubt) |
| The rule that matters most | The author's words are never overwritten | **Every mark agrees with every other mark** |

## The inventory, checked against the code

### Dynamic content

| Component | Reads | Writes | Built as |
|---|---|---|---|
| **agenda** (#3089) | the shown `divider` headings | the list and `progress-k` | source fill at the engine door, `lib/core/agenda-autofill.js` |
| **glossary** (`glossary: auto`) | the `definition` fields of `acronyms:` | a whole slide appended at the end | source transform, `lib/core/glossary-auto.mjs` `appendAutoGlossary`; its table on the live page, `lib/core/glossary-slide.js` |
| **topic** | the headings of the other `topic` slides in the section | the track along the bottom, current topic lit | render transform, both arms, `lib/transformers/topic-track.js`; an authored `_track` overrides (`overrideOf`) |

Agenda and topic already meet the content rules. The glossary does not: it inserts a slide the source does not contain,
which is why four modules trim it back out (`withoutAutoGlossary` in `narration-bake.ts`, `narration-projection.ts`,
`share-export.ts`, `single-slide-render.ts`); before that trim, 8 of the Q3 fixture's 17 slides were narrated with
different words in the Studio and in `lattice video`.

### Dynamic marks

| Mark | The fact it shows | Where it is counted |
|---|---|---|
| **page number** | this slide's place among the shown slides | `lib/engine/slides.js` (stamps `data-lattice-pagination`); a split's extra pages renumbered `4.2` by `lib/core/auto-split.js` `repaginate` |
| **section rail** | which section this slide is in, of how many | `lib/forms/tile/progress/progress.transform.js` (counts dividers; HTML and DOM arms) |
| **divider `2 / 4` marker** | this divider's section, of how many | the same file, the same divider count |
| **`divider numbered` numeral** | this divider's section number | `lib/core/section-index.js`, its own divider count (HTML and DOM arms) |
| **topic eyebrow** (`02 · <section>`) | the section this topic sits in | `lib/transformers/topic-track.js`, its own walk of the sections |
| **agenda page references** | the page each section starts on | `progress.transform.js` `withAgendaPagesHtml` / `agendaPagesDom`, recounting shown slides and checking against the stamped numbers |
| **proof color** | this proof slide's place among the proof slides | `lib/core/split-panels.js` `sequenceProofPanels`, and a second implementation in `lib/transformers/split-panels.js` |
| **the one-slide preview's position** | the shown slide's page and section, handed to a slice render | `lib/diagnostics/slice-equivalence-core.mjs` `deckSectionFor`, counting dividers in the SOURCE |

So the same two questions, "where is this slide?" and "where does each section start?", are answered by at least five
separate counts, two of them on both render paths. They agree today because each was written carefully, and one pair is
held together by its own parity test. Nothing makes them agree.

## Why one counter matters more than it looks

A reader cross-checks marks. An agenda that says the third section starts on p.7, a divider that says `3 / 4` and a
footer that says 8 on the slide after it make one claim about the deck. If any two counts drift, a boardroom deck
contradicts itself, and every check passes, because each count is right by its own rule.

**One deck counter, the only source every mark reads**, turns "they happen to agree" into "they cannot disagree". It
computes once per render: the shown slides in order, each slide's page, the dividers with their headings and pages, each
slide's section, and each class's run order (for the proof color). It has an HTML adapter and a DOM adapter, the
pattern `section-index.js` already uses. The page-number stamp itself stays where it is (`lib/engine/slides.js`), and the
counter reads it rather than redoing it, so pagination keeps one author.

It also gives the one-slide preview one rule ("this deck has a dynamic component that reads beyond the slide") in place
of the four separate entries it carries today in `DECK_DERIVED_FACTS`.

## The glossary on the content rules

An empty `_class: glossary` slide, placed anywhere, fills from the `acronyms:` definitions, paged by venue as today. That
meets the content rules and retires the four `withoutAutoGlossary` trims, but only once the slide is IN THE SOURCE.
`glossary: auto` as it stands still inserts one, so: a lint autofix writes the empty glossary slide at the end of the
source and drops the key, once, and the engine keeps honoring the old key until decks have moved. Today's `applyFix`
(`lib/authoring/lint-core.js`) rewrites one located line; this fix is two edits in different places, so it needs a
two-part fix shape or two findings that apply together.

## A manifest field

`"dynamic": { "kind": "content" | "mark", "reads": "dividers" | "acronyms" | "topics" | "pages" | "order" }` in a
component's manifest, so the preview probe, the component docs ("fills itself from …") and the authoring skills find
dynamic components without a hand-kept list. Marks that are not components (page numbers, the rail) are registered with
the counter instead.

## Decided

| | Decision | Owner's pick (2026-11-08) |
|---|---|---|
| D1 | The definition | **Anything the engine fills in from other facts in the deck**, with the two kinds and their rules above |
| D2 | The glossary | **Fill model + a one-time lint fix** that writes the slide into the source; the old key honored meanwhile |
| D3 | One deck counter | **Build it with the glossary work**, as the only source every mark reads; move the other marks onto it the next time each is touched |
| D4 | The manifest `dynamic` field | with D3 (not asked separately; it is how the preview finds them) |
| D5 | A sources slide | **Design the citation syntax next**; a sources slide is its first consumer |

## The work this sets up, in order

1. **Glossary + counter** (one PR): the counter with its two adapters; the glossary's fill; the two-part lint fix; the
   four trims retired; the agenda's page references and fill moved onto the counter; the `dynamic` manifest field and the
   preview's single rule. The agenda's behavior does not change.
2. **Citation syntax** (a design note first): how an author cites a source on a slide, and what a sources slide gathers.
3. **The other marks onto the counter**, each the next time its file is touched: the rail and the divider marker, the
   numeral (`section-index.js`), the topic eyebrow, the proof color (folding its two implementations into one), and the
   preview's position (`deckSectionFor`).

## Not decided here

- Whether the counter also feeds narration (which reads the rendered slides today and already agrees).
- Any visible change to a mark. The counter changes who computes each fact, not what any slide shows.
