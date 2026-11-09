---
status: proposed
summary: >
  The owner's definition: a DYNAMIC component is anything the engine fills in from other facts in the deck. Two kinds:
  dynamic CONTENT (agenda, glossary, topic; the author places the slide and anything the author writes wins) and dynamic
  MARKS (page numbers, the section rail, the divider's count and numeral, the topic eyebrow, the proof color, the
  agenda's page references; stamped, switched on or off, never authored; they must agree). Measured on 561 committed
  decks: every mark agrees on all of them, but a divider with focus steps makes four marks count one section as
  several. That case names a third thing, dynamic BEHAVIORS (focus steps, builds): state that changes while presenting,
  never a slide of its own and never read by a mark. Decided: a committed agreement test comes first, a shared counter only if that test ever needs one; the
  glossary moves to the fill model and must be the deck's last slide or slides; a citation syntax is designed next.
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
| When the deck lacks the facts | Render nothing and let lint say why (an agenda with one divider: `agenda-empty`) | Show nothing rather than a wrong value (the agenda's page references refuse when the count is in doubt, or when the list does not name the dividers in order). Four marks break this today on a divider with focus steps (§The measurement), because a behavior is counted as slides (§Dynamic behaviors) |
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

A scratch script rendered decks through the engine and compared every mark with a ground truth. It was written twice:
the first version (2026-11-08) was reviewed by an independent checker on 2026-11-09, which found that it never read the
numeral or the proof color from the render, passed whenever a mark was missing, took its ground truth from the render it
was judging, and missed the focus-step case through a malformed fixture. This section reports the second version only.
The script itself is posted on PR #3096, since a scratch file does not outlive the session.

**What it rendered.** Every committed deck under `examples/`, `exemplars/`, `test/fixtures/`, the baseline decks,
`lib/**/*.gallery.md` (component galleries and chart kinds) and the design galleries: 561 decks, 0 render errors. Plus 13
fixtures for the hard cases: a divider with real focus steps (`_focusSteps: item 1 | item 2`), a hidden divider, a hidden
divider inside a run of slides, a hidden proof slide, `split: headings`, a reordered agenda list, `paginate: false`, a
twelve-section deck, an authored `progress-N`, an agenda inside a section, `glossary: auto` with an agenda, and an
`#`-headed divider.

**Ground truth.** The section count comes from the SOURCE, through a reader in the script that shares no code with the
marks: it splits on `---` outside code fences and reads each slide's `_class:` and `hide` comment. Each rendered slide's
page and section is then walked from the shown slides, with an expanded copy of a divider staying in the section it
belongs to.

**What it checked, and how often each check ran** (read from the render in every case):

| Mark | Checks run | Can it fail? (a mark corrupted in the render, extra findings) |
|---|---|---|
| page number | 4133 | shifted: +4133 |
| divider `k / N` | 100 | `k` changed: +92 |
| `divider numbered` numeral | 21 | changed: +19; deleted: +19 |
| section rail lit dot | 419 | dot moved: +129 |
| topic eyebrow number | 12 | changed: +9 |
| agenda list and page references | 13 | a reference changed: +11; all deleted: +11 |
| proof color (`cat-N`) | 60 | changed: +60 |

Deleting every page stamp, divider marker or rail is NOT caught: the script cannot tell a mark that is missing from one
switched off. The agreement test must close that gap.

**Result on the 561 committed decks: no disagreement.** Every page number, divider count, numeral, lit dot, eyebrow
number, agenda reference and proof color matched.

**One real disagreement, in a fixture: a divider with focus steps counts as several sections.** `_focusSteps: item 1 |
item 2` expands one slide into two copies, and the copies carry nothing that says they are one slide. So the divider
marker reads `1 / 3`, `2 / 3`, `3 / 3`, the numerals read 01, 02, 03, the rail draws three dots and the next topic's
eyebrow reads `03`, in a deck with two sections. The agenda fill reads the source, lists two sections, and (since this
PR) drops its page numbers because the counts do not match. No committed deck puts focus steps on a divider, which is
why the corpus is clean. The fix is the same in all four marks: count an expanded copy once, which needs the expander
to stamp the copies the way a heading split stamps `data-split-run`. But that patch treats the symptom: the cause is
that a presenting behavior is turned into slides at parse time. **§Dynamic behaviors** below fixes the cause, and with it
this case needs no patch to any count.

Smaller findings:

1. **A hidden proof slide keeps its color slot**, now read from the render (`cat-1`, hidden `cat-2`, `cat-3`). The proof
   color counts every proof slide, hidden ones included, the way it already counts one that pins its own `cat-N` (the
   comment at `sequenceProofPanels`: an override must not shift the hue of every slide after it). Pagination counts shown
   slides only. Different rules on purpose: a color is the slide's identity, so hiding a slide for a lens must not
   recolor the slides a reader already saw; a page number is a position, so it follows what is shown.
   **Recommendation: keep it, and make it the agreement test's one sanctioned exception.**
2. **A divider headed with `#` gives the topic eyebrow a number and no name** (`01` instead of `01 · Alpha`), because
   `topic-track.js` reads only an `##` heading. The agenda lists the section by name. Logged as a follow-up.
3. **The topic eyebrow keeps a heading's closing period; the agenda drops it.** `examples/topic.md` renders
   `01 · Where the money actually goes.`; the agenda fill (`agenda-autofill.js` `itemText`) would list the same divider
   without the period. Logged as a follow-up.

Expected results, confirmed: a reordered agenda list gets no page references (the by-name rule in this PR);
`split: headings` makes divider slides the source reader cannot see (the engine's split, not a mark disagreement);
`paginate: false` drops the references.

**Not measured.** Only the HTML-string render path ran; the live-DOM arms, which the note calls the second copy of each
count, ran on the small fixtures only. No deck exercised a split run (`4.2` pages, the split's k-of-N rail), so
`auto-split.js` `repaginate` is unmeasured. `data-lattice-pagination-total` and the agenda's automatic `progress-k` were
checked by hand on one fixture each.

## What this changes: a test first, and the counter question is now concrete

The earlier draft proposed one shared deck counter, the only source every mark reads. The committed decks agree, so the
counter is not urgent for them, and it would rewrite six working counts. The one measured disagreement, the focus-step
divider, is not a counting bug: it goes away when focus steps stop making slides (§Dynamic behaviors), so it argues
for neither four patches nor a counter.
It would also not be one piece of code. It needs a source count (the agenda fill and the glossary run before render)
and a render count (the marks), and because dividers carry no page stamp, it must recount slides rather than read the
stamp.

What actually protects a boardroom deck is a test that fails the day two marks disagree. So:

**A committed agreement test comes first.** It renders the committed decks and the hard-case fixtures, builds the
ground truth from the source, and checks every mark against it, on both render paths, with the proof color's hidden-slide rule
as its one sanctioned exception. It also knows when each mark must be present, so a deleted mark fails it. It lives in the integration tier (it renders decks), so it adds a test, not a CI job. Its job is
to make "they agree" a checked fact instead of a lucky one.

**A shared counter is built only if that test ever needs one**: when a new mark joins, or when two marks are found to
disagree and the fix is cheaper as one count than as a patch to one of them.

The earlier draft also proposed replacing the one-slide preview's `DECK_DERIVED_FACTS` entries (six today, in
`docs/src/playground/single-slide-render.ts`) with one rule ("this deck has a dynamic component"). Dropped: that rule
would mark nearly every deck, since almost every deck has page numbers, and the six entries are each narrower and
correct.

## Dynamic behaviors: the other kind

The owner's word for `_focusSteps` (2026-11-09): "an advanced dynamic behavior capability". It is dynamic, but not in
the sense above.

- **Dynamic components** fill in from FACTS IN THE DECK (the dividers, slide order, the acronyms). They are settled once
  per render, and every surface shows the same answer.
- **Dynamic behaviors** change OVER TIME WHILE PRESENTING: `_focusSteps` moves a spotlight, `_build` reveals items one
  by one. They depend on where the presenter is, which is state, not a fact about the deck.

**The rule for a behavior:**

1. **One source slide is one slide everywhere.** A behavior never adds a slide.
2. **Live surfaces** (Present, the Studio, the HTML player) run it as **state plus CSS**: the current step moves a class
   and the stylesheet draws it.
3. **Still formats** (PDF, PowerPoint, PNG) show **one frame**, a defined still of the slide. One page per step, a
   printed walkthrough, is an explicit export option applied in that export only.
4. **No mark reads a behavior.** Page numbers, section counts, narration's slide index and the preview never see a step.

**`_build` is designed to follow all four, but only its first half has shipped.** `lib/transformers/build.js` stamps
each unit's step on the one slide and `lib/base/base.build.css` hides the units past the current step, keyed on a
`data-build-at` the player is meant to set. No code sets it today: the player that walks the steps (increment 2 of
`2026-06-16-narrative-step-model.md` §11) and the page-per-step PDF (increment 3) are not built, and issue #380 tracks
them. So a `_build` slide shows whole everywhere, Present included. The model is right; the walker is missing, and it
is the same walker `_focusSteps` needs.

**`_focusSteps` breaks rules 1 and 4.** The highlight itself is already CSS: `lib/transformers/focus.js` tags the target
`.lat-focus` and its siblings `.lat-recede`, and `lib/base/base.focus.css` draws the treatment. But the step is applied
by copying the slide in the Markdown parser (`focusSteps` in `lib/integrations/markdown-it/plugins.js`, chosen in
`2026-06-16-focus-highlighting.md` §4 so pagination and the PowerPoint export "need no special casing"). Every surface
then gets N slides: a 3-slide source with one three-step table renders 5 sections in the HTML and 5 PDF pages. The
cost landed on every reader of slide position instead: the #1387 off-by-one, the guards in narration, the preview, the
render cache, the slice check and the Export-to-Marp note, and now four section counts that see one divider as three.

**So `_focusSteps` is redesigned on `_build`'s model:** one slide carrying its steps, walked live by moving
`.lat-focus`, one frame in still formats, and page-per-step only as an export option. Both need the same step walker
in Present and the same page-per-step export, so the two are built together with #380, not twice. One committed deck uses it
(`examples/focus.md`, once). The PDF change is an export-bytes change, so its before and after renders go to the owner
for sign-off. Its design note comes first (`followups.d/3096-p5-focus-steps-as-a-behavior.md`).

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
| D3 | Agreement | **A committed agreement test first; a shared counter only if needed.** The preview's one rule dropped (2026-11-09: "we need to prove it rather than assume"). The focus-step divider does not reopen it: it is a behavior counted as slides, fixed at its cause (D6) |
| D4 | The manifest `dynamic` field | **Not asked.** A proposal until a consumer needs it |
| D5 | A sources slide | **Design the citation syntax next**; a sources slide is its first consumer (2026-11-08) |
| D6 | Dynamic behaviors | **A third kind with its own rule: one slide, state plus CSS live, one frame in still formats, never read by a mark.** `_focusSteps` is redesigned on `_build`'s model (2026-11-09) |

## The work this sets up, in order

1. **The agreement test** (one PR): the scratch measurement turned into an integration test over the committed decks and
   the thirteen fixtures, on both render paths, with the proof color's hidden-slide rule as its sanctioned exception, a
   presence rule for every mark, and the count sites the red team added (the split rail, the `data-lattice-slide`
   stamps). `followups.d/3096-p1-mark-agreement-test.md`.
2. **`_focusSteps` as a behavior** (a design note, then a PR): one slide, steps walked live, one frame in still formats,
   page-per-step as an export option; before and after PDFs to the owner. `followups.d/3096-p5-focus-steps-as-a-behavior.md`.
3. **The glossary on the fill model** (one PR): the empty-slide fill, the last-slide lint, the two-part autofix, the six
   trims and counts retired, and narration, Present, the closing check and the term export moved off the key, each
   verified on its surface. `followups.d/3096-p2-glossary-fill-model.md`.
4. **The citation syntax** (a design note first): how an author cites a source on a slide, and what a sources slide
   gathers. `followups.d/3096-p3-citation-syntax-note.md`.
5. **The eyebrow's closing period**, matched to the agenda. `followups.d/3096-p4-topic-eyebrow-period.md`.
6. **The eyebrow's name for an `#`-headed divider.** `followups.d/3096-p6-topic-eyebrow-h1-divider.md`.

## Not decided here

- Whether a shared counter is ever built. The agreement test decides that, by failing or not (D3).
- Whether narration reads a counter. It reads the rendered slides today and agrees.
- Any visible change to a mark beyond the eyebrow's period and name. (The `_focusSteps` redesign changes what a PDF
  shows, and goes to the owner on its own.)
