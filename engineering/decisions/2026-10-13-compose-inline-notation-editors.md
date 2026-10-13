---
status: in-progress
summary: Give Compose point-and-click editors for the inline notation (pills, sparks, avatars) so non-technical authors never type `{SHIPPED, c2}` or `~{12 14 17, end}`. One shared editor host (a popover on desktop and tablet, a sheet on the phone), one drawn chip as the door, controls generated from Segno's own slot schemas, and a write path that replaces only the words the author changed. Charts and diagrams follow as later phases on the same host.
---

# Compose inline notation editors — point and click, never type the syntax (2026-10-13)

> Status: **decided; phase 1 built** (2026-10-13). The owner confirmed four forks in §11, then
> **revised the first one the same day**: Compose shows the pill as the slide draws it, not a chip
> beside its grammar. A first build of that (decorations over text) failed on a real iPhone, and the
> owner chose the sustainable form instead: **the pill is one inline object in the document**, with
> deck-wide Undo and Redo. §11 records the answers, and §12 says what phase 1 built and how.

**The answer first.** *(This section is the first draft. It said a small chip beside each pill,
spark and avatar; §11 and §12 record why the shipped form is the drawn object itself, one node in the
document.)* Compose should draw every pill, spark and avatar as the slide draws it. A tap opens one
shared editor with the controls that notation allows: shape
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
  text inside an editable range is where caret, selection and IME bugs live. The owner's revision
  of 2026-10-13 chose this look (§11): show what is rendered, not the grammar. Built first as
  decorations over the text, it failed on a real iPhone (§12) and was replaced by A5.
- *A5. The object IS the node.* The pill is one atom inline node in the document, carrying its
  source text verbatim and writing back the exact code span it came from. A tap selects it and
  opens the editor, an arrow key steps over it, Backspace takes all of it, and nothing in the page
  has a caret inside it. **Chosen** (§11, row 5): it gives A2's look without hiding text inside an
  editable range, and it makes the next kind (a spark, an avatar) a registry entry.
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

| 5 | After the first real-phone test (same day) | The decoration build was rejected as janky: a tap put the caret in the pill, which showed its text and raised the keyboard, and iOS's own undo was greyed out. The owner asked for a sustainable, holistic solution and chose **A5, the inline object node with a registry of kinds**, **a deck-wide Undo and Redo pair in Compose's chrome**, and **reworking the open PR in place**. | matches the recommendation on all three |

Nothing is left open for phase 1. Phases 3 to 5 each get their own note before they are built (§9).

## 12. Phase 1 as built

**Why there is a rework.** The first build drew each pill with decorations over its text. On a real
iPhone the same day, a tap put the caret inside the pill, which showed its `{…}` text and raised the
keyboard; the editor did not hold; and iOS's own undo was greyed out, because ProseMirror's edits are
not in the browser's undo stack. Three symptoms with one cause: the pill was text that was dressed up,
so every touch behavior was a patch on text editing, and each new kind (a spark, an avatar) would have
repeated it. The design model that replaced it, in five axes: what a pill IS in the document (an
object, not a text span), what a tap does (select it and open its editor), where undo lives (one
visible pair for the deck), how the next kind plugs in (a registry), and how an author reaches the text
(an explicit "Edit as text").

**What shipped.**

- **The node** (`docs/src/lib/compose/inline-object.ts`). One atom inline node, `inline_object`, with
  one attribute, `src`: the code span's text verbatim. It writes back through the same backtick fencing
  the `code` mark uses, so it adds no bytes of its own. It knows nothing about pills, so a new kind
  needs no schema change. The schema widens `heading` to admit it, because prosemirror-markdown's
  heading takes only `text | image` and a pill in a heading (`examples/inline-pills.md` has one) was
  pushed out into its own paragraph on write. The corpus test found that, not a review.
- **Paste cannot forge one.** An object survives a paste only from this editor (the per-session
  provenance token, as a slide's directives and a comment's text do), and only when its `src` is one
  braced line with no backtick. A foreign `<code data-inline-object>` stays plain code. A source with a
  line break is written back on one line whatever built the node, because a line break would end the
  code span and let what follows parse as deck structure.
- **One rule keeps text and objects in step** (`normalizeObjects`): a code-marked run the engine's
  kernel reads as an object is a node, and anything else is text. It runs when the kernels load, after
  a resync, and as an edit completes a span the author was typing. It skips a span the selection
  touches (so "Edit as text" works and typing at an edge is never edited unseen), a locked slide, a
  deck or slide set to `inline-code: literal`, and adjacent spans that merged into one run. Other marks
  (bold, italic) stay on the node. It does not run after an undo or redo, so it cannot cost the author
  their redo stack.
- **Opening a deck rewrites nothing.** The load and resync passes are silent: they change how a slide is
  represented, not what it says, so Compose re-points its emit baseline at the new slide nodes
  (`rebaselineSlides`) and keeps every cached byte. Without that, an untouched slide would be
  re-serialized the first time any slide changed. A test runs every deck, gallery and baseline in the
  repo: the emitted deck is byte-identical with and without the objects. Measured at the time of
  writing: 116 kernel-readable pills in 7 decks, 112 converted in 6 (4 more sit in a literal deck).
  Sparks and avatars are not objects yet, so they are not in those numbers.
- **Two pills never touch.** Two code spans cannot touch in Markdown: `` `{A}``{B}` `` is ONE span, so a
  pill beside another (reached by tapping "+ Pill" right after Done, or by deleting the text between two)
  was written as one span and both stopped being pills on the next load. The same rule that makes
  objects keeps a single space between an object and a neighboring object or code span, "+ Pill" adds
  it, and the serializer adds it as a last resort. Inside the author's own code span, "+ Pill" declines.
  A mark between the two (`**`{A}`**`{B}`: the closing `**` sits between the backticks) already keeps
  them apart, so no space is added there. The caret stays before a space put in at it, so typing code
  just before a pill stays in the code span. One known rough edge: Backspace on the separating space
  puts it straight back and leaves an empty step in the undo history.
- **The edit-time pass is narrow on purpose.** It looks only at the slides the author changed or moved
  through, so it cannot give an untouched slide new nodes (a slide with new nodes is re-serialized, not
  re-emitted from its cached bytes). It does not run after an undo or redo until the author makes a
  change of their own: a pass there is a new edit in the history and a plain click would clear the redo
  stack. The load and resync passes ignore the selection, because a fresh state's selection sits at the
  start of the document, where a pill would otherwise stay text and convert, unsilenced, on the first click.
- **The registry** (`OBJECT_KINDS` in `inline-objects.ts`): how to read, draw and edit one source, and
  its accessible name. The editor host (`InlineObjectEditor.tsx`) looks the kind up and hands the
  matching panel the fields (`PANELS`); a spark or an avatar adds an entry to each and nothing else.
- **The open editor is a position, validated against what sits there.** Plugin state holds the node's
  position, maps it through every transaction, and closes when the node is gone or the selection
  leaves it. A pick replaces the node and re-selects it, because a replaced node is a deleted one to the
  selection's mapping. **Done** puts the caret after the object, because a selected node would be
  replaced by the next keystroke. A pick first closes the open history group, so it undoes alone and
  not together with the typing before it. On a touch device the editor lowers the keyboard when it
  opens.
- **Deck-wide Undo and Redo** sit first in the slide bar, driving the one history, disabled when there is
  nothing to do. They never take focus, so no keyboard rises.
- **The bar on a narrow pane.** At 390px the widest bar (a caret in body text: history, the Format
  group, four insert doors, settings) was about 320px against 266px between the slide's two end caps.
  Measured, not guessed. Scrolling hid the insert doors and covering the caps hid delete, and an Insert
  menu on its own still left the bar about 50px too wide, so the bar wraps below a pane width of 520px:
  history and the doors on row one, the contextual Format group on row two. Row two is reserved on every
  slide, so switching the active slide moves nothing (every bar measured 70px tall, before and after).
  Wide panes keep the single row.
- **The pill follows the deck's color scheme, not the page's.** The deck's tokens are `light-dark(a, b)`,
  which resolves from the `color-scheme` of the element using it, and the Studio themes through
  `data-mode` while its own `color-scheme` stays `light`. With the real mode toggle the preview's pill was
  `rgb(0, 114, 37)` and Compose's was `rgb(210, 220, 189)`. The sheet now copies the preview frame's
  `color-scheme` onto the pill scope, and a test uses the real toggle.
- **The pill's look** is still borrowed from the preview frame at runtime (`pill-sheet.ts`: the engine's
  `.lat-pill` rules and the tokens they read, in one `@scope`d stylesheet), so there is no second copy
  to drift. Until the sheet is ready, an object shows its source in the code face and is still one
  tappable thing.

**A second checker pass, on the fixes, found five more:** typing code before a pill threw the caret out
of the span; the gap pass added a space where a mark already separated two pills; "+ Pill" and a paste
could create objects in an `inline-code: literal` deck or slide (the door now declines and says why, and
a stray object goes back to its code span); the narrow bar's first row changed width between slides; and
a deck that pins `color-scheme: only dark` was dropped by the sheet's allow-list. All fixed with
mutation-checked tests except the Backspace rough edge above, which is documented.

**What the independent checker found, and what changed.** A checker with no stake in the build ran the
diff and broke three promises with concrete inputs: two pills touching wrote one code span (the existing
test certified the bug); a pill at the caret on load stayed text, then converted unsilenced on the first
click and rewrote its slide (a `* one` list became `- one`) with a phantom undo step; and a plain click
after an undo cleared the redo stack. All three are fixed above, each with a test that fails when the fix
is removed (mutation-checked). It also found the editor's "was driven on a real phone" claim had no
artifact behind it, and that claim is gone.

**Not in phase 1.** The `icon=` axis (an icon-only pill has no label to edit, and the panel says so), a
crowding warning for a circle or diamond with a long label, and a pill in a locked slide (the slide
keeps its text; drawing it there needs the structural guard's agreement). The pill is drawn in
Compose's font, not the deck's. The slide preview beside Compose is still the exact drawing.

**Verified.** On the real Studio: the spec drives tap, pick, Done, Edit as text, the insert door,
Undo and Redo, the literal deck and the locked slide (10 tests on desktop), alongside the stress and
fenced-code specs that exercise the same bar (34 in all). At 390px with touch enabled, light and dark,
the sheet, the two-row bar and the Undo and Redo buttons were driven and photographed. The unit tests
include the corpus byte check and the regressions for stale positions. **Not verified:** a real phone's
touch and keyboard (this was emulation, not a device), and Safari's `@scope` (the fallback shows the
source in the code face).

## 12b. Phase 2 as built (sparks, the icon axis, the crowding warning)

**What shipped.**

- **A kind and a panel, nothing else.** `sparkKind` joins `OBJECT_KINDS` and `SparkPanel` joins `PANELS`. The
  node, the paste guard, the serializer and `normalizeObjects` did not change: the `~` sigil was already in the
  node's source test and in `normalizeObjects`' first-character test, and `kindOf` asks each kind's `read`, so
  `~{12 14 17}` is a spark and `{12 14 17}` is nothing. Opening the shipped decks still writes no bytes (the
  corpus byte-identity test now converts sparks as well as pills).
- **The writer** (`editSpark`, `lib/core/inline-sparks.js`) is shaped like `editPill`: it parses the span with
  Segno, replaces or appends or drops only the words that change, and accepts the result only if the kernel's own
  `interpret` still reads it as a spark (a field-by-field comparison follows as a backstop that no tested input reaches). It takes several axes in one call, so a
  panel can switch to bars and clear the end dot a bar cannot carry in a single write (otherwise the engine's
  refusal would leave no path from a line with markers to a bar). The spark's `data` axis takes an array or the
  data text; the panel sends the author's own tokens with one cell changed, so `+17.50` stays `+17.50`.
  `read` returns the fields plus `dataText`, a copy the caller may change.
- **The panel** offers only what the data takes: trend types for a trend, ratio types for a ratio, marks only on
  line, area and step. A "Shows" switch changes a trend to a share of a total and back (it writes a sample, because
  nothing converts one into the other). A bad number is shown and never written. A refusal from the writer is
  shown with the "Edit as text" exit, never swallowed.
- **The door** ("Insert spark", slide bar) puts `~{12 14 13 17 21}` after the caret's word with a space, leaves a
  selected word as it is, and opens the editor. `insertBlocker` takes the noun, so its messages say "spark".
- **The sheet** copies `.lat-spark` rules from the preview frame as it does `.lat-pill` rules, so a spark in Compose
  is the slide's drawing in the deck's tokens.
- **`icon=` on a pill** is a named item in `editPill` (`icon` joins the axis list). The kernel's reader decides
  whether the icons plugin knows the name, so an unknown name is a null and never a pill that quietly stops being
  one; taking the icon off an icon-only pill is refused, because nothing would be left to show. The panel opens
  `IconGrid` from a row, and the host holds the editor open while the grid is up (`holdOpen`), because focus
  moving into the grid is not the author leaving.
- **The crowding warning** uses the linter's own check: `pillIsCrowded` in `lint-core.js` now backs both
  `pill-shape-crowded` and the panel (`kernels.pill.crowded`), so the two cannot disagree.

**Where the next doors go (measured, not decided).** At 390px, with touch emulation, the slide bar's first row is
266px wide (the width between the slide's end caps) and now holds undo, redo, table, code, pill, spark and slide
settings: eight 28px buttons, with about 10px of padding left. A fifth door does not fit on row one. The avatar,
chart and diagram doors therefore cannot each take a button. Recommendation for phase 3: one "Insert" menu that
holds pills, sparks, avatars, charts and diagrams, so the bar keeps only the doors used every day. That is a
decision for the owner, recorded in `followups.d/`.

**Known fidelity gaps.** A number-cell edit writes the series with single spaces (`~{12  14  17}` becomes
`~{12 14 18}`), and the ratio boxes show parsed numbers, so `72.50/80` is written back as `72.5/80` on an edit.
Every other word keeps its bytes.

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
