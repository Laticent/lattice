---
status: in-progress
summary: Give Compose point-and-click editors for the inline notation (pills, sparks, avatars) so non-technical authors never type `{SHIPPED, c2}` or `~{12 14 17, end}`. One shared editor host (a popover on desktop and tablet, a sheet on the phone), one drawn chip as the door, controls generated from Segno's own slot schemas, and a write path that replaces only the words the author changed. Charts and diagrams follow as later phases on the same host.
---

# Compose inline notation editors — point and click, never type the syntax (2026-10-13)

> Status: **decided; phase 1 built** (2026-10-13). The owner confirmed four forks in §11, then
> **revised the first one the same day**: Compose shows the pill as the slide draws it, not a chip
> beside its grammar. §11 records both answers, and §12 says what phase 1 built and how.

**The answer first.** Compose should draw a small, clickable chip next to every pill, spark
and avatar. A click opens one shared editor with the controls that notation allows: shape
thumbnails, color swatches, a number grid, trait swatches. The editor rewrites **only the
words the author changed** inside the existing inline-code span, so everything it does not
understand stays exactly as written. We build it once, on the host, and add one panel per
notation. Pills go first.

---

## 1. The ask, and what the audit measured

The owner's ask: Compose is mostly great, but the people using it are non-technical, they
like point and click, and they do not want to type. Charts, diagrams and the value-adding
inline visuals (sparks, avatars, pills) have no custom editor. The ask is to find where
friction can come out and what editor widgets to use.

The Compose audit behind #2649 measured the gap on the real Studio. In Compose, every
notation renders as a boxed span of raw monospace code:

| Source | What Compose shows | What the slide draws |
|---|---|---|
| `` `{SHIPPED, c2}` `` among other spans in a paragraph | a boxed `{SHIPPED, c2}` | a colored status pill |
| `` `~{0.8 0.9 1.1 1.9, end}` `` alone in a list item | a boxed `~{0.8 0.9 1.1 1.9, END}` | a small line chart |
| `` `!{Ada Okafor, hair=coily}` `` alone on a list line | a boxed `!{ADA OKAFOR, HAIR=COILY}` | a portrait |

The uppercase in the last two rows comes from the eyebrow rule, `.cs-host p > code:only-child`
in `ComposeView.tsx`, which fires when a span is the only code element in its paragraph or
list item. It also changes the case of what the author typed (`end` reads as `END`), another
reason a raw span misleads. The author gets no preview, no list of options and no sign that
`c2` is a color. The only help inside an editor today is in the Markdown source editor (a
completion menu); Compose has none. The icon grid opened from Compose copies the icon to the
clipboard instead of inserting it.

## 2. Who this is for, and the rule that follows

The authors are board and program staff, not engineers. Three things follow, and they are
the tests every option below is held to:

1. **No syntax to remember.** If an author must know that `c2` is a color or that `tag` is a
   shape, the editor has failed.
2. **Nothing is lost.** Opening and closing an editor without a change leaves the deck's bytes
   unchanged. A change touches only what it changes.
3. **The text door stays.** Anyone who prefers typing can still edit the raw span. The editor
   is an addition, never a lock (the table editor made the same promise).

## 3. The friction inventory

Ordered by how often an author meets it, and by how much typing it costs.

| Thing | What the author types today | Why it hurts |
|---|---|---|
| Pill | `` `{BETA, tag, c4}` `` | Three invisible vocabularies: 8 shapes, 12 color slots, 3 sizes |
| Spark | `` `~{12 14 17, bar, c3, end}` `` | A number series, 7 types, 4 flags, 3 frame axes |
| Avatar | `` `!{Ada Okafor, hair=coily, skin=6}` `` | Sixteen trait keys with values nobody can guess |
| Chart data | `- EMEA \`4.2\`` in a nested list | Backticks around every number; grouped series are made by indentation |
| Diagram | a fenced Mermaid block | Code. The worst case. |
| Icon | `` `^{database}` `` or `icon=` inside a pill | Needs the icon's name |
| State marker | `[x]`, `[-]` in a list or cell | Six markers, one character each |

This note decides the first three and the shared mechanism. Chart data, diagrams, icons and
markers are named in §9 as later phases, so the host is built for them.

## 4. What already exists (reuse before building, HARD RULE #15)

This list is why the recommendation is small. Almost every hard part is already in the repo.

| Need | Already there | Where |
|---|---|---|
| A schema for each notation, as data | Segno slot specs: `oneOf`, `indexed` (the `c1`–`c12` color slot), `flag`, `number`, `text`. The linter and the renderer already read them. | `lib/core/segno-slots.js`, `lib/core/segno-spec.js` |
| A pure reader per notation | `resolve` for pills and sparks, `read` for avatars. Each returns the resolved fields and refuses what it cannot read. | `lib/core/inline-pills.js`, `lib/core/inline-sparks.js`, `lib/plugins/avatars/avatars.inline.js` |
| Word positions inside a span | Segno's parse tree gives each record item `from` / `to` offsets and a `name`. The name is `null` for a bare word, so only `key=value` items carry one; `{SHIPPED, tag, c2}` has no name on `tag` or `c2`. `iconSpelling` and `withSparkSize` read the offsets. | `@laticent/segno` (`notation.ts` `Item`), `lib/core/inline-pills.js`, `lib/authoring/lint-core.js` |
| What may come next in a pill | `nextWords` and `withWord`, which the Markdown editor's completion menu uses. | `lib/core/inline-pills.js`, `lib/core/inline-sparks.js` |
| The real drawing of each notation | `pillElement`, `sparkElement`, `avatarElement` build the same DOM the slide gets. | the three kernels above |
| The vocabularies | pill shapes, colors and sizes exported as `SHAPES`, `COLORS`, `SIZES`; spark `TYPES`; avatar `TRAIT_ORDER` and the generated trait vocabulary. | kernels; `avatars.vocab.generated.js` |
| An icon picker | `IconGrid.tsx` and `icon-grid-model.ts`, lazy-loaded | `docs/src/components/studio/` |
| A clickable widget inside the editor | `Decoration.widget` with `stopEvent` and `ignoreSelection` (the pane bar) | `ComposeView.tsx` |
| One popover for the whole document | the code-fence language chip's picker, anchored to the live chip | `ComposeView.tsx` |
| View-only decorations that leave the document untouched | the state-marker badges (`Decoration.inline`) | `ComposeView.tsx` (`stateMarkerPlugin`) |
| UI primitives | shadcn `popover`, `sheet`, `toggle-group`, `radio-group`, `slider`, `command` | `docs/src/components/ui/` |
| A sheet that lifts above the phone keyboard | `PanelSheet` (its `--kb` lift and focus rule) | `docs/src/components/ui/panel.tsx` |
| A precedent for "the editor is clamped to what the format can store" | table editing | `2026-07-19-compose-table-editing.md` |

What exists is small and narrow. `withWord` appends one word to a pill or spark.
`withSparkSize` in `lint-core.js` sets one spark field: it reads the items from Segno, drops
the size word and **re-prints the whole span**, which normalizes the separators to `, `, so
it is the C2 behavior §5 rejects. What does **not** exist: a general writer that changes one
axis and keeps every other byte, and anything in Compose that draws these notations or
opens an editor for them. Those pieces are the new work. The writer has one extra job
because bare words are unnamed: it must work out which axis each bare word fills by the
vocabulary match the readers use, the way `withSparkSize` does for the size word.

## 5. Design axes and the recommended move

**Axis A — the door: how an author reaches the editor.**
- *A1. A tag button beside the raw text* (view-only widget decoration, the real pill, spark
  or avatar from `pillElement` and its siblings). Click it to edit. The raw text stays visible
  and editable. **Recommended.** The state-marker badges are the precedent for a view-only
  decoration (no schema change, no serializer change, nothing in the document moves), and the
  pane bar is the precedent for a clickable widget decoration.
- *A2. Replace the raw text with the drawn thing* while the caret is elsewhere, and show the
  text when the caret touches it (a live preview). The nicest result, and the riskiest: hiding
  text inside an editable range is where caret, selection and IME bugs live. **Chosen, on the
  owner's revision of 2026-10-13** (§11, §12): show what is rendered, not the grammar.
- *A3. A toolbar button only.* Cheap, but nothing on the page shows an author that a pill is
  editable. Rejected as the only door.
- *A4. An insert door* ("+ Pill", "+ Spark", "+ Avatar" on the slide's divider bar). Needed
  regardless: an author cannot click a chip that does not exist yet. A new notation is
  inserted with sample content and its editor opens at once, so nobody starts from a blank
  field. **Recommended, with A1.**

**Axis B — how the editor is built.**
- *B1. Controls generated from the notation's slot schema.* `oneOf` becomes a choice,
  `indexed` becomes a swatch row, `flag` becomes a toggle, `number` a field. When a slot
  gains a value, the editor gains it with no edit. **Recommended**, with a hand-written panel
  where the schema is not enough (the number grid for a spark's data, the name and trait view
  for an avatar).
- *B2. A text field with the existing completion menu.* No new capability for the people
  this is for. Rejected.

**Axis C — the write path.**
- *C1. Replace only the changed words inside the span*, using the `from` / `to` offsets
  Segno already returns. A word the author did not touch keeps its bytes, spelling and
  order. An unset axis becomes an appended word (`withWord` is the model); a reset axis
  becomes a deleted word. **Recommended.** It keeps alias spellings, which the linter asks
  each deck to hold to one of.
- *C2. Re-print the whole span from the resolved fields.* Simple, and it silently rewrites
  `{X, label}` as `{X, tag}` and reorders words. Rejected: it breaks promise 2.
- The head of a span (a pill's label, a spark's numbers, an avatar's name) is replaced as one
  unit, with the quoting rule applied (`"Cost, excluding tax"`).

**Axis D — where the editor opens.**
- *One editor host for the whole document*, moved to whichever chip was clicked, the way
  the code-fence picker already is. Forty slides must not carry forty closed popovers.
- **Chosen (owner, 2026-10-13): a popover anchored to the chip on desktop and tablet, and a
  `PanelSheet` on the phone.** The popover sits next to the text it edits. The sheet is the
  surface `IconGrid` already uses, and it lifts above the phone keyboard by itself
  (`--kb` lift and focus rule in `ui/panel.tsx`). The phone keyboard once hid Compose's
  register bar (`2026-07-18-compose-mobile-keyboard-rail.md`, whose rail was later
  retired), so keyboard behavior is verified on a real device, not assumed. This costs two
  surfaces to build and test; the recommendation had been the sheet at every width. Both
  surfaces render one shared panel component, so the cost is the container, not the
  controls.

**Axis E — where the code lives.**
- The writer is a pure function next to each reader in `lib/core` (and the avatar plugin),
  shared by the Studio through the same generated authoring bundle the Studio already
  loads. **No editor-only parser, ever** (HARD RULES #1, #7; Segno decision 20). The panels
  are Studio code and are loaded lazily, the way `IconGrid` is, so the startup JavaScript
  budget does not pay for them.

**Axis F — when a chip does not appear.**
- *The kernel refuses the span* (`resolve` returns null): no chip. The raw text stays and the
  linter's existing message applies. We never guess a repair.
- *The slide is locked* (a construct Compose cannot round-trip, `LOSSY_CONSTRUCTS` in
  `deck-source.ts`): the chip shows disabled with the same hint the code chip gives.
- *`inline-code: literal`* (deck or slide): no chips, because the engine draws none.
- *The avatars plugin is off for the deck:* no avatar chip, for the same reason.

## 6. Recommended shape, in one paragraph

Add a Compose plugin that finds every inline-code span the kernels can read and paints a
drawn, clickable chip beside it (A1), plus an insert door on the divider bar (A4). Both open
one lazily loaded editor host (D: a popover on desktop and tablet, a sheet on the phone), which builds its controls from the notation's Segno slot
schema (B1) and writes back by replacing only the changed words (C1), after proving
`read(write(read(span)))` equals `read(span)`. Pills ship first. The spark editor follows,
and shares its number field with the chart series grid in phase 3. The avatar designer
follows after that, then the diagram outline builder.

## 7. What it feels like

- **Pill.** A small colored pill appears beside `{SHIPPED, c2}`. Click it. A popover shows the
  label field, eight shape thumbnails drawn in the deck's theme, twelve color swatches drawn
  in the active theme, and a size choice. Picking a swatch changes the one word `c2` and
  nothing else. A circle or diamond with a long label shows the same crowding warning the
  linter gives. "Edit as text" puts the caret in the raw span.
- **Spark.** A tiny chart appears beside `~{0.8 0.9 1.1 1.9, end}`. The popover holds a
  number grid (paste a column from a spreadsheet), type chips that each show the author's
  own data, color swatches, and toggles for the end dot and the zero baseline.
- **Avatar.** A face appears beside `!{Ada Okafor}`. The popover shows the name and trait
  swatches. Every trait left alone is chosen by the name, so a "reset to name" control is
  always one tap away, and a name alone is always a complete, valid avatar.
- **Insert.** "+ Pill" on the divider bar drops in `{Label, c1}` and opens its editor with
  the label selected.

Color slots are **ordinals, never meanings**: `c2` is blue on one theme and red on another
(`base.docs.md` § Color). The swatches are drawn in the active theme and carry no color name
and no "green means good" label.

## 8. Risks and how the design retires them

| Risk | How the design retires it |
|---|---|
| A write corrupts a span or rewrites one the author never touched | C1 changes only the touched words. A property test over **every** pill, spark and avatar in the shipped galleries proves `read(write(read(span)))` equals `read(span)` and that an unchanged edit is byte-identical. |
| Widget decorations break the caret, selection or IME | A1 leaves the text in place and the chip outside the editable range (`stopEvent`, `ignoreSelection`, the pane bar's pattern). A2, the risky one, is deferred. |
| The Studio's startup JavaScript grows | The panels are lazy-loaded; only the small chip painter ships in startup. Any measured growth gets a `docs/route-budget.d/` declaration (#2649 hit this gate). |
| Drift between the editor and the engine | The editor reads the engine's own slot schemas and kernels. No second vocabulary exists to drift. |
| A phone keyboard covers the editor | The phone uses `PanelSheet`, which already lifts above the keyboard; verified on a real device, not emulation (HARD RULE #23). |
| Authors lose trust after one surprise rewrite | Promise 2, the property test, and "edit as text" always present. |
| Scope creep into charts and diagrams | They are phases 3 and 4 with their own acceptance checks, not part of the first PR. |

## 9. Phasing (one feature, one branch, one PR; HARD RULE #17)

A phase that builds with only `main` is its own PR. A phase that needs an unmerged PR waits.

1. **Host, door and pill editor.** The editor host (popover and sheet), the chip painter, the insert door, the
   pill writer, the schema-driven panel, the round-trip property test, "edit as text", the
   locked and literal rules. This is the PR that proves the architecture.
2. **Spark editor.** Adds the number grid and the spark panel. Needs phase 1 merged.
3. **Chart series grid.** A block-level door (like the table door) over the list-shaped
   chart components, reusing phase 2's number field. Which chart components are in scope is
   a question for that phase's own note: the shapes differ (gantt, kanban and map are not
   plain lists).
4. **Avatar designer.** Adds the name and trait panel.
5. **Diagram outline builder.** A Tab-to-indent outline that becomes a flowchart. The owner
   picked the outline over a drag canvas on 2026-10-12. It needs its own note, because it
   has to turn Mermaid into an outline and back without loss, and may only open for diagrams
   it recognizes.

Cheap wins that need none of this (a "make this table a chart" conversion, spreadsheet
paste into a table) are candidates for their own small PRs.

## 10. Verification plan

- **Round trip.** The property test above, on every notation span in the galleries, in the
  first PR. The writer is the riskiest code here, so a tier 1 checker (HARD RULE #25) reads
  it: it rewrites deck source.
- **Real surface.** Each phase is driven on the real Studio at 1440 / 820 / 390, light and
  dark, with the popover open (`tools/screenshot.js`), and on a real phone for the sheet and
  keyboard. A chip that opens, an edit that lands, and an undo that restores it are each
  shown with an artifact.
- **Gates.** `npm run lint`, the unit suite, `npm run build:check`, and the Studio smoke
  tier. The export pipeline is not touched (the editors write source), so the export
  sign-off exception does not apply.
- **Not verified in the cloud sandbox.** Real touch, the software keyboard and iOS Safari;
  Mermaid, which does not load there. Phase 1 needs a person with a phone.

## 11. Decided (owner, 2026-10-13)

| # | Fork | Decision | Against the recommendation |
|---|---|---|---|
| 1 | The door | **Revised the same day.** First answer: A1, a tag button beside the raw text, with A2 deferred. Revised answer: **A2**, the pill drawn as the slide draws it, its text hidden until the caret touches it. The reason, in the owner's words: show what is rendered, not the grammar, and a click brings up the popup. | first answer matched; the revision overrides it, and it moves the risk A1 avoided (caret and selection around hidden text) into phase 1, handled in §12 |
| 2 | The first PR's size | **Host plus pills only.** Sparks are the next PR. | matches |
| 3 | What the editor opens in | **A popover anchored to the pill on desktop and tablet, a `PanelSheet` on the phone.** | differs: the recommendation was the sheet at every width |
| 4 | The write path | **C1**, replace only the changed words. | matches |

Nothing is left open for phase 1. Phases 3 to 5 each get their own note before they are built (§9).

## 12. Phase 1 as built

What shipped, in the order an author meets it, and where it differs from the design above.

**The pill is drawn by the engine's own rules.** The Studio page does not carry the deck's CSS, so
`lib/compose/pill-sheet.ts` copies two things out of the live preview frame at runtime: every rule
whose selector names `.lat-pill`, and the current value of every custom property those rules read
(`--pill-*`, `--cat-N-fill`, ...). They go into one constructable stylesheet, the rules inside
`@scope (.cs-pill-scope)` and the tokens on `.cs-pill-scope`, so nothing restyles Compose's own
chrome. The engine writes every pill rule under `article.lattice > section …`, so each drawn pill
sits inside a pair of `display: contents` wrappers with that ancestry. There is no second copy of
the pill's look: a shape or token the engine changes reaches Compose with no edit. The sheet is
rebuilt when the site palette or mode changes, when the preview frame reloads, and when the deck
source changes (a `theme:` edit restyles the preview without touching either of those).

**When the text is hidden.** The span's text is hidden (`display: none`, by an inline decoration)
and a widget draws the pill in its place. The text comes back, with the tag button after it,
whenever the selection touches the span: a caret inside it or at either edge, or a range that
cuts into it. A range that swallows the whole pill draws it selected. That rule is why nothing is
ever edited unseen: typing at the edge of a pill extends its code mark, so the author must see the
braces when they are there. A browser without constructable stylesheets or `@scope`, or a pill the
engine cannot draw here, keeps the text and the tag button, which is the first form of the editor.

**One range, mapped through every edit.** The open editor's range lives in the notation plugin's
state and is mapped through each transaction, so it always names the pill it was opened on. An
earlier version kept the range in React state; the independent checker found that a deletion
before the pill left the range pointing into the wrong bytes, and the next click spliced there.
The fix has three parts: `pillAt` requires the range to start at the pill (`textOffset` 0), the
range is mapped by the plugin and closes when an edit deletes into the pill, and a resync, which
rebuilds the plugin state, closes the editor. Both of the checker's repros are regression tests.

**The insert door declines where it would damage the author's text.** "+ Pill" does nothing, and
says why, inside or against an inline code span (a new code-marked run would merge into it), on a
selection that crosses blocks, in a fence, and in a locked slide.

**The writer.** `editPill` in `lib/core/inline-pills.js` applies one axis at a time, re-parsing
between steps, and reads the result back: it returns null unless the pill reads as the old fields
plus the requested change. It keeps the author's casing and order for every word it does not
touch (named words too). A property test runs it over every readable pill in the shipped decks and
galleries, and the checker fuzzed it with about 2.1 million edits over about 8,700 distinct pills
without a violation.

**Not in phase 1.** The `icon=` axis (an icon-only pill has no label to edit, and the panel says
so), and a crowding warning for a circle or diamond with a long label. Both go in with phase 2.
The pill is drawn in Compose's text size and the Compose font stack; the deck's own fonts are not
loaded in the Studio page, so a theme with a distinctive pill face will differ slightly from the
slide. The slide preview beside Compose is still the exact drawing.

**Verified.** On the real Studio at 1440, 820 and 390, light and dark: the pills drawn with the
deck's own fill and shape, the grammar hidden and back when the caret arrives, every pick landing
in the persisted source with every other byte untouched, undo, "Edit as text", the insert door,
the locked slide's disabled pill, and a literal deck. Not verified: a real phone's touch and
keyboard, and Safari's handling of `@scope` (the fallback is the first form of the editor).

## 13. References

- `engineering/decisions/2026-07-18-compose-prosemirror.md` — the Compose architecture.
- `engineering/decisions/2026-07-19-compose-table-editing.md` — the precedent this note
  copies: clamp the editor to what the format stores, keep the text door.
- `engineering/decisions/2026-09-28-segno-unified-inline-notation.md` — the notation, its
  slots, and decision 20 (Segno is Lattice's one parser).
- `engineering/decisions/2026-09-28-inline-sparks.md`,
  `2026-09-29-inline-icons.md`, `2026-10-09-inline-avatars.md` — the three notations.
- `engineering/decisions/2026-07-18-compose-mobile-keyboard-rail.md` — the phone keyboard
  problem in Compose (its rail was later retired).
- `lib/base/base.docs.md` § Inline pills, § Inline sparks;
  `lib/plugins/avatars/avatars.docs.md`.
- `followups.d/2649-p1-compose-inline-notation-editors.md` — the backlog item this note
  discharges when it merges (delete that file in the same PR as the first implementation, not
  this one, since the item also covers the build).
- #2649 — the Compose audit that measured the gap.
