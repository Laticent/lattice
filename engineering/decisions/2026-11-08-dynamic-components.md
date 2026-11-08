---
status: proposed
summary: >
  "Dynamic components" (the owner's name): components whose content the engine reads from elsewhere in the deck —
  agenda, glossary, topic, divider and split-panel proof today. Each was built on its own and re-solves the same three
  problems (the one-slide preview, the Export-to-Marp DOM arm, narration agreement). Proposes one contract (the author
  places the slide; what the author writes wins; settings through a front-matter register), moving the glossary to the
  agenda's fill model, one shared deck-facts kernel adopted as each component is next touched, a manifest `dynamic` field,
  and parking a sources slide until the deck has a citation syntax. Five decisions for the owner.
---

# Dynamic components: one contract for the slides the deck writes

**Date:** 2026-11-08 · **Asked by:** the owner, on PR #3089 ("it seems to me agenda and glossary are special kinds of
components … I call these dynamic components") · **Status:** proposed, no code · **Follows:**
`2026-11-08-agenda-styles-and-autofill.md` · **Resolves, once the owner picks:** `followups.d/3089-p1-dynamic-components-design-note.md`

## What a dynamic component is

A component is **dynamic** when the engine writes some of its content from elsewhere in the deck, so the author does not
type it twice. The test is the source of the content, not the look: an agenda with a hand-written list is an ordinary
component; the same slide left empty is a dynamic one.

## The five we already have

Each was designed on its own. The table is the inventory, checked against the code named in it.

| Component | Reads | Writes | How it runs | Author's own content |
|---|---|---|---|---|
| **agenda** (#3089) | the shown `divider` headings, and each divider's page | the list, `progress-k`, the page numbers | source fill at the engine door (`lib/core/agenda-autofill.js`); page numbers at render, both arms (`withAgendaPagesHtml` / `agendaPagesDom`, `lib/forms/tile/progress/progress.transform.js`) | a written list wins and is never touched |
| **glossary** (`glossary: auto`) | the `definition` fields of `acronyms:` | a whole new slide (or pages of one) at the end | source transform that APPENDS (`lib/core/glossary-auto.mjs` `appendAutoGlossary`) | an authored `_class: glossary` slide is a second, separate glossary |
| **topic** | the headings of the sibling `topic` slides in the same section | the track, and the section eyebrow (`02 · <divider heading>`) | render transform, both arms (`lib/transformers/topic-track.js` `applyToHtml` / `applyToDom`) | an authored track overrides (`overrideOf`) |
| **divider** | its place among the shown dividers | the marker (`2 / 4` + marks) and the `divider numbered` numeral | render, both arms (`progress.transform.js` marker; `lib/core/section-index.js` `applyToHtml` / `applyToDom`) | none; the number is never authored |
| **split-panel proof** | its place among the deck's proof slides | its categorical color `cat-N` | render, two separate implementations (`lib/core/split-panels.js` `sequenceProofPanels` and its DOM mirror in `lib/transformers/split-panels.js`) | an authored `cat-N` wins |

## What each one re-solved, separately

1. **The one-slide preview cannot see the deck.** The Studio renders the edited slide alone when it can. Four of the six
   reasons it falls back to the whole deck are dynamic components, each written as its own entry
   (`DECK_DERIVED_FACTS`, `docs/src/playground/single-slide-render.ts`): `auto-filled agenda`, `glossary: auto`,
   `split-panel proof run`, `ambiguous divider count`. Topic is not on the list; its slice degrades to "no track", named
   as a residual in the slice-equivalence sweep (`classifyDivergence`), not prevented.
2. **Export to Marp needs a live-page arm.** marp-core renders that bundle, so every render-time step needs a DOM version
   in the runtime, and each component wrote its own: all five have one (the glossary's draws its table,
   `lib/core/glossary-slide.js`; its slide itself is added at the source).
3. **Narration and Present must agree on the slide.** The glossary's appended slide is the costly case: four modules
   trim it back out (`withoutAutoGlossary`: `narration-bake.ts`, `narration-projection.ts`, `share-export.ts`,
   `single-slide-render.ts`), and before that trim 8 of the Q3 fixture's 17 slides were narrated with different words
   in the Studio and in `lattice video`.

Each re-solve is also a place the two render paths can drift, which is the HARD RULE #1 risk: `split-panels` already
carries two implementations of one rule, and `glossary-slide.js`'s own header says the glossary table is two
implementations held together by a parity test.

## The proposal

### A contract (D1)

A dynamic component:

1. **Is placed by the author.** The engine never inserts a slide; it completes one the author put there. Positions stay
   stable, so nothing downstream counts around it.
2. **Yields to the author.** Anything the author writes in the part the engine would fill wins, and the engine adds
   nothing to it. (The agenda's "a written list is never touched"; topic's override; proof's authored `cat-N`.)
3. **Takes its settings from one front-matter register**, applied to that slide alone (the `agenda:` shape), never a
   deck-wide class that reaches authored slides.
4. **Fails closed.** When the deck does not hold what it reads (one divider, no definitions, a page count in doubt), it
   renders nothing rather than something wrong, and lint says why.
5. **Declares itself** (D4), so the preview, the docs and the Studio find it without a hand-kept list.

### The glossary on the agenda's model (D2)

An empty `_class: glossary` slide, placed anywhere, fills from the `acronyms:` definitions, paged by venue as today. That
retires the appended slide, and with it the four `withoutAutoGlossary` trims — but only if the slide is IN THE SOURCE.
`glossary: auto` as it stands still inserts one, so it has to change too: a lint autofix can write the empty glossary
slide into the source at the end and drop the key, once, and the engine keeps honoring the old key until decks have
moved. Today's `applyFix` (`lib/authoring/lint-core.js`) rewrites ONE located line, and this fix is two edits in
different places (drop a front-matter line, append a slide), so it needs a two-part fix shape or two findings that
apply together; that is part of D2's cost.

### One deck-facts kernel (D3)

The five read the same handful of facts: the shown slides and their page numbers, the dividers and their headings, each
slide's section, the order of a class across the deck. One pure kernel computing them once per render, with an HTML and a
DOM adapter, would leave each dynamic component a few lines of "read facts, write content". It would also give the
preview one rule ("the deck has a dynamic component") in place of four entries.

### A manifest field (D4)

`"dynamic": { "reads": "dividers" | "acronyms" | "topics" | "order", "fills": "<slot>" }` in the component's manifest.
The Studio preview probe, the component docs ("fills itself from …"), and the authoring skills read it.

### A sources slide (D5)

The one new dynamic component worth having is a sources/references slide collected from citations across the deck. The
deck has no citation syntax today (no footnote rule in `lib/integrations/markdown-it/plugins.js`, no `sources:` key in
`lib/core/deck-settings.js`), so it is new language, not a conversion. A recap slide built from section headlines was
considered and set aside: it would write the author's argument for them.

## Decisions for the owner

| # | Decision | Options | Recommendation |
|---|---|---|---|
| D1 | Adopt the contract above as the definition of a dynamic component | adopt · adopt with changes · no | **Adopt.** It is what the agenda already does, and the agenda is the one that cost nothing downstream. |
| D2 | The glossary | (a) fill model + lint autofix that writes the slide into the source, old key honored meanwhile · (b) fill model, `glossary: auto` kept appending forever · (c) leave it | **(a).** Only (a) retires the four trims; (b) keeps them. |
| D3 | The shared kernel | (a) adopt as each component is next touched · (b) one refactor PR now · (c) no kernel | **(a).** Five working components and no open defect: a big-bang refactor buys risk, not behavior. Glossary (D2) would be first. |
| D4 | The manifest `dynamic` field | yes · no | **Yes, with D3**, so the preview probe is derived, not listed. |
| D5 | A sources slide | park until a citation syntax exists · design the syntax now · no | **Park.** It needs a language decision first. |

## Not decided here

- Any change to topic, divider or proof behavior: D3 changes how they are built, not what they draw.
- Whether `progress-rail` (a tile, not a component) joins: it reads the same facts and would use the kernel, but it is
  chrome, not a slide's content.
