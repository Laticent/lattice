---
status: shipped
summary: >
  An agenda slide with a heading and no list fills itself from the deck's divider headings, and one placed inside
  section k gains `progress-k`. It fills a slide the author placed rather than generating one like `glossary: auto`,
  so no slide moves. A hand-written list always wins. The agenda keeps three styles (ledger, circles, checks); `rail`
  and `cards` are retired, render as the ledger, and lint names the fix. A filled agenda prints each section's page,
  read at render time; a deck-wide `agenda:` register sets the style and turns those page numbers off.
---

# The agenda: three styles, and an empty agenda fills itself

**Date:** 2026-11-08 · **Decided by:** the owner, in session ("I find it odd that for glossary we can auto generate it
but we can't for agenda. We also have too many agenda looks."), choosing among scored options · **Code:**
`lib/core/agenda-autofill.js`, `lib/engine/index.js` (`render`), `lib/authoring/lint-core.js` (`findAgendaIssues`),
`lib/components/inventory/agenda/agenda.styles.css`, `lib/base/base.sketch.css` · **Docs:**
`lib/components/inventory/agenda/agenda.manifest.json` → `agenda.docs.md` · **Demo:** `examples/agenda-autofill.md`

## The question

Two complaints, one component. A glossary can be generated (`glossary: auto`) but an agenda cannot, and the agenda had
five looks: the default `ledger`, `circles`, `rail`, `cards` and `checks`. The owner wanted the weak looks cut, and the
agenda made easier to write without taking it away from the author.

## The five styles, scored

Each was rendered in light and dark from the committed gallery PDFs and counted across every committed deck. The score
is out of 10: does it do a job no other style does, does it read well, and does anyone use it.

| Style | Score | What it does that the others do not | Used in |
|---|---|---|---|
| ledger | 9 | The only one with page references (`p.15`, right-aligned with a dotted leader); reads as a contents page | 30 of 32 agenda slides |
| cards | 7 | A boxed row per section, the current one filled with the accent | 1 (a test fixture) |
| checks | 5 | The only one that shows three states: done (tick), here (arrow), ahead (empty box) | 1 (a demo deck) |
| circles | 4 | Numbers in rings: a track of stops rather than a contents page | 0 |
| rail | 3 | Circles plus a 1px connecting line that barely shows; the current node scaled up and stuck out of the column | 0 |

**Decided:** keep ledger, circles and checks; retire rail and cards. The owner kept circles and checks for jobs the
other styles do not do, which the table supports: checks is the only three-state style, and circles is the only one
that reads as a track rather than a document. Cards' one property was the box around each row, and rail was circles with
a line you could not see.

Two scores rested on fixable faults, and both were fixed here rather than carried:

- **Page references on circles and checks** fell to the universal inline pill and sat glued to the end of the title, which
  is also what made circles look lopsided. They now sit flush right in the label face, as on the ledger (no leader: the
  ring and the box are those styles' marks).
- **Checks rows** were 1.5em tall against circles' 2.4em, so the same agenda in checks sat a third shorter. Its rows now
  take the circles height.

**Retired, not deleted from decks.** A slide that still names `rail` or `cards` renders as the ledger: the ledger's
`:not()` chains no longer exclude them. Both words are still known (other components own a `cards` and a `rail`), so
`unknown-class` stays quiet; `agenda-retired-style` names the change with a one-click fix (`rail` → `circles`, `cards`
removed). The `cards:` register no longer governs the agenda, since it only ever applied to `agenda cards`. The
changelog marks this **Breaking**, because a deck that used either style changes how it looks.

## Why the glossary could be generated and the agenda could not

The glossary's data already lives in the front matter: the `definition` field of each `acronyms:` entry. The agenda's
data is the deck's section structure, and most decks do not mark it. Of the 19 decks in `examples/`, `exemplars/`,
`test/fixtures/` and `design/` that carried an agenda slide before this change, **14 had no `divider` slide and one more
had a single one** (all nine exemplars among the 14). Their agenda is a promise typed by hand, and nothing else in
the deck records it. So automation can only read structure the author marks, and the source of truth is the divider
heading. That also turns on the section rail, which already reads an agenda whose item count matches the section count
as its legend.

## What generating a glossary slide has cost

`glossary: auto` (`lib/core/glossary-auto.mjs`) APPENDS a slide the source does not contain. The audit:

- **Its consumers have to trim it back out.** Four modules call `withoutAutoGlossary` (narration's projection, the
  bake, the share export and the single-slide preview), and the Playground counts it with `autoGlossarySections`. Before that trim, 8 of the Q3 fixture's 17 slides were narrated with different words
  in the Studio than in `lattice video` (`engineering/pipeline.md` §6).
- **Present never shows it**, and the CLI blanks its narration page to match.
- **Its table transform exists twice**: the engine's token rules and `lib/core/glossary-slide.js` for the live DOM,
  held together by a parity test. That file's own header says this is not the single kernel HARD RULE #1 asks for.
- **Four decks use it.**

It survives only because the glossary goes LAST, so every authored slide keeps its index. An agenda belongs at slide 2,
where an inserted slide would shift every slide after it and the end-trimming trick stops working.

## What was decided: fill, do not generate

Options put to the owner: fill an empty agenda (recommended); a front-matter `agenda: auto` that inserts slide 2
(mirrors glossary, shifts every index); a lint suggestion only (generates nothing). **Chosen: fill.**

- The author still places the slide: `<!-- _class: agenda -->` and a heading, no list. The engine lists one numbered
  item per shown `divider`, its heading with the closing period dropped.
- An empty agenda inside section k gains `progress-k` on its spot `_class` directive, up to 6 (the CSS draws no more),
  inside the quotes when the value is quoted. A running global `<!-- class: agenda -->` is filled but never given a
  progress token, which would carry to every later slide. An author's own `progress-N` is kept.
- A directive counts only where the ENGINE reads one: a whole comment block (`lib/engine/slides.js`), so two comments on
  one line or a comment with text after it fill nothing. The front matter's `class:` never names a component (the
  engine refuses one there), so it cannot make a slide an agenda.
- A divider heading that starts with a block marker (`1. Intro`, `- Draft`, `# Hash`) is escaped, so it stays one
  item of text.
- Narration needs nothing: the CLI and the Studio project it from the rendered slides, so a filled agenda is narrated
  with its items (checked with `lattice … --captions` on the demo deck).
- A hand-written list always wins, and the source comes back as the same string, so a deck without an empty agenda
  renders byte-identically.
- Fewer than two shown dividers: nothing to fill, and lint warns (`agenda-empty`), because the slide would render a
  heading over a blank stage.

**Where it runs.** At the engine's render door (`lib/engine/index.js` `render`, next to `foldSettingsBlock`), so the
CLI, the Studio, the docs site and every engine export see one result; and in the two Export-to-Marp bakes
(`tools/export-marp.js`, `docs/src/components/studio/export/deck-export.js`), where marp-core renders instead of the
engine. The Studio's one-slide preview route cannot see the other slides, so a deck that relies on the fill takes the
whole-deck route (`DECK_DERIVED_FACTS` in `docs/src/playground/single-slide-render.ts`, a superset test: a false match
costs one whole-deck render, a miss would preview an empty agenda).

**Two readers, pinned.** The kernel reads slides with the engine's boundary parser, the way `bake-splits.js` does. The
lint core may not touch that parser instance (`tools/build-playground.js` `assertLintParserIsolated` fails the build), so
`agendaLintPlan` reads the same facts through the lint's own readers. `test/unit/core/agenda-autofill.test.js` holds the
two to the same answer over every committed deck that names an agenda, plus the hidden-divider, fenced-divider and
trailing-note cases.

## Follow-up decision: page numbers, and the `agenda:` register

The owner asked, after the first pass, for the page numbers to be filled too, and for one front-matter key that
sets the agenda's style and whether page numbers show, with autocomplete and an Inspector row; default ledger
with page numbers. Picked from the options: ONE key, `agenda: <style> <pages>` (the `progress-rail:` shape),
over two keys; the same PR; and `no-pages` reaches only FILLED agendas ("if somebody actually authors the
agenda slide that should be sacred").

**Page numbers are read at render time, not computed from the source.** The first pass ruled them out because
the source cannot know the rendered numbering. The rendered deck can, and it turned out to be exact:

- every shown slide's number is its place among the shown slides (a hidden slide is not counted), and a divider
  is counted although it draws no number of its own;
- an automatic split numbers its extra pages `4.2`, `4.3` and never moves a later slide
  (`lib/core/auto-split.js` `repaginate`), so a divider's number is stable however the slides before it split.

`withAgendaPagesHtml` / `agendaPagesDom` (`lib/forms/tile/progress/progress.transform.js`, both adapters, beside
the agenda legend) count the shown sections, check the count against every number the engine stamped, and print
`<code class="agenda-page">p.N</code>` on each item, the trailing page reference every style already draws flush
right. They FAIL CLOSED: a disagreement with a stamped number (a document holding part of a deck), a deck with no
page numbers (`paginate: false`), or a list that is not one item per section prints nothing. Checked on the demo
deck: dividers on pages 3, 5, 7 and 9, the footer numbers around them 2, 6 and 8.

**Which agendas get them.** The fill kernel writes `agenda-pages` onto a slide it filled, unless the deck or the
slide said `no-pages`, and the render pass prints numbers on exactly those slides. So an authored agenda never
gets one, as ruled.

**Why the register is applied at the source, not stamped.** Every other axis register stamps `<key>-<word>` on
every slide (`lib/core/register-factory.js`). This one does not join `AXIS_REGISTERS`: a deck-wide
`agenda-pages` would reach the authored agendas, and the agenda's styles are the bare `circles` / `checks` words a
slide already writes. The kernel resolves `agenda:` per agenda slide and writes the answer on that slide's own
`_class`: the deck's style on any agenda that names none (`agenda-ledger` opts out), and the page marker on filled
ones. The factory still supplies the words, so the linter (`unknown-agenda`), the editor's completion and the
Inspector (`docs/src/components/studio/agenda.ts`, pinned to the kernel by its test) read one vocabulary.

## Not done, and why

- **A `split: headings` deck is not filled.** Its slides are cut at render time from `##` headings, so the source has
  no `---` for the fill to read sections from; the agenda renders empty and `agenda-empty` does not fire, because the
  linter reads the same source. It fails safe (nothing wrong is drawn), and such a deck is better served by a written
  list.
- **Hand-written agendas that drift from their dividers** are not flagged. The count-match legend already treats a
  matching agenda as the deck's contents; a mismatched one may be deliberate.
