---
status: in-progress
summary: Make LFM tables editable in the Compose rich editor instead of locking them. Today any slide with a `|…|` table is locked read-only ("edit in Markdown") because Compose's round-trip runs on prosemirror-markdown's CommonMark-only serializer, which cannot emit a table. This is the future work the compose-prosemirror doc named (§"editable-and-lossless real schema nodes"). The design: adopt the official `prosemirror-tables` module CONSTRAINED to what GFM can serialize losslessly (rectangular grid + per-column alignment; NO merge/split, NO column-resize — GFM stores neither), keep the table node `_class`-agnostic (the compare-table/obligation-matrix/roadmap binding already lives in the slide's `directives` attr, not the table), carry LFM state markers (`[x] [-] [ ] [/]`) as literal cell text that round-trips byte-stable with an OPTIONAL view-only decoration painting badge chips, and add a dedicated GFM table serializer + a tables-enabled markdown-it parser for Compose — guarded by a round-trip fixture suite drawn from the real gallery decks and a maker-checker pass (round-trip kernel = real blast radius). Only the pipe-row trigger leaves `LOSSY_CONSTRUCTS`; math/HTML/strikethrough/footnote in a cell still lock the slide, so the guard degrades safely. glossary and list-tabular are OUT of scope — they are authored as nested lists, already round-trip losslessly, and are already editable in Compose today.
---

# Compose table editing — LFM tables become editable, not locked (2026-07-19)

> Status: **implemented** (2026-07-19). The design model below was confirmed
> (GFM-plain-plus-LFM scope; state-marker badge decoration in; column-resize
> out; one incremental PR) and then built in three phases — the lossless
> round-trip kernel, the editing chrome, and the LFM badge polish — verified on
> the real Studio surface. This doc names the axes, the candidate moves, and the
> recommendation that shipped. Parent:
> `2026-07-18-compose-prosemirror.md` — this is the "future work" its Known
> Limitations named ("Making these constructs editable-and-lossless (real schema
> nodes) is still future work; today they lock rather than risk a reflow",
> lines 151–152). This doc does not change the render engine or exported bytes;
> it changes only the Compose editing surface (`docs/src`).

## The ask

The Compose rich editor (the WYSIWYG mode of the Studio editor pane) can't edit
tables. A slide whose prose contains a `|…|` row is detected, marked `locked`,
dimmed, and stamped "◔ edit in Markdown" — you must flip to the plain-markdown
CodeMirror mode to touch it. The user wants tables to be a first-class,
editable thing in Compose, and — importantly — **Lattice tables**, not a generic
grid: the tables carry state markers, component classes, and caption lines that a
plain-GFM editor would flatten.

Hand-editing markdown tables is genuinely one of the worst parts of the format
(pipes to align by eye; adding a column means editing every row), so this is
high user value. The whole design turns on one constraint below.

## The one hard constraint: the round-trip is lossless

Compose is not a separate document — it is a **second view of the same
`source` string** the markdown editor writes (HARD RULE #1). Its correctness rests
on a lossless round-trip: markdown → ProseMirror doc → *the same* markdown, byte
for byte on any slice the author didn't touch (`docs/src/lib/compose/deck-markdown.ts`,
`deck-doc.ts` `emitDeck`). It uses `prosemirror-markdown`, whose parser and
serializer are **CommonMark-only** — and CommonMark has no tables. That is the
entire reason tables are on the `LOSSY_CONSTRUCTS` list and locked
(`deck-source.ts:55–61`): the serializer literally cannot emit a `|…|` table, so
letting a table through the round-trip would destroy it.

So "support tables" is really: **teach the round-trip to model a table as real
schema nodes and serialize it back to GFM losslessly** — including the LFM extras
the render engine reads. Everything below serves that.

## What makes a Lattice table a Lattice table (the inventory we must preserve)

From `spec/LFM-1.0.md` §3.2/§5.1/§6, `lib/integrations/markdown-it/plugins.js`
(lines 634–1078), `lib/components/chart/roadmap/roadmap.transform.js`,
`lib/core/below-note.js`, and the four table-component `.docs.md`/`.styles.css`:

1. **The grid** is plain **GFM pipe tables** — cells, a header row, a `---`
   delimiter row, and GFM `:---:` column alignment. There is *no* Lattice-specific
   table parser; every Lattice behavior is a post-parse transform gated on the
   slide's `_class`.
2. **`_class` binds the grid to a component** — `compare-table`,
   `obligation-matrix`, `roadmap` (`<!-- _class: … -->` plus modifier tokens).
   Crucially, in Compose that directive **already lives on the slide node's
   `directives` attr** (`deckToDoc`), edited through the existing per-slide
   settings UI — *not* inside the table.
3. **State markers in cells** — `[x] [-] [ ] [/]`, optionally with trailing text
   (`[x] Signal taxonomy`). `[-]`/`[/]` are LFM's *only* non-GFM-clean syntax
   (§5.1). The engine turns them into stoplight spans at render time
   (`obligationMatrixBadges`, `roadmap` status cells) — in the *source* they are
   just literal characters at the start of a cell.
4. **A trailing paragraph = the caption / legend / footnote** — a `<p>`
   immediately after the table becomes a `.below-note` at render time
   (`lib/core/below-note.js`). In the source it is just an ordinary paragraph
   after the table.
5. **GFM column alignment used semantically** — marker columns are centered with
   `:---:`. There is no alignment syntax beyond GFM's.
6. **Inline-code chips** in headers/cells (`Foundation \`Q2 2026\``) — ordinary
   markdown inline code; nothing table-specific.
7. **A `<!-- _focus: row N / col N -->`** per-table highlight directive — lives in
   `directives`, like `_class`.

**Out of scope — and already handled:** `glossary` (`- Term` / `  - Definition`)
and `list-tabular` (`1. Name` / `   - value`) *render* as tables but are
**authored as nested lists**. They already round-trip losslessly and are already
editable in Compose today. They are not `|…|` tables and this work does not touch
them.

The load-bearing realization from the inventory: **almost all of the "Lattice"
in a Lattice table lives outside the grid** — in the slide's `directives`
(`_class`, `_focus`), in render-time transforms (state spans, below-note, the
header spectrum rail, first-column emphasis), or in ordinary markdown inline
(code chips). What Compose actually has to newly model is small: **the grid, its
column alignment, and literal marker text in cells.** Everything else it already
carries or never needs to.

## Design axes and the recommended move

**Axis A — Node model: reuse or hand-roll?**
Reuse **`prosemirror-tables`** (the official ProseMirror module — same
maintainer). It ships the table schema nodes (`table`/`table_row`/`table_cell`/
`table_header`), the `tableEditing` plugin (cell selection, Tab navigation,
auto-append row), and the row/column commands (add/delete before/after, delete
table). Hand-rolling a table node would reinvent exactly this (HARD RULE #15 —
don't reinvent; reuse). **→ Adopt `prosemirror-tables`.**

**Axis B — How much of prosemirror-tables do we allow?**
prosemirror-tables also supports **merged cells** (colspan/rowspan) and
**column resizing** (pixel `colwidth` attrs). **GFM can serialize neither.** If
we enabled them, the editor would offer affordances whose results *silently
vanish* on the next round-trip — a broken-window UX (HARD RULE #18) and a
losslessness break. **→ Constrain to GFM-expressible tables: rectangular grid +
per-column alignment only. Disable merge/split; do NOT enable `columnResizing`.**
This is the central design decision — the editor's capabilities are clamped to
what markdown can store, so what you see always survives the trip.

**Axis C — Where do LFM state markers live?**
The cell text is `[x] Signal taxonomy`. Two moves:
- **(v1, recommended) Literal inline text.** The cell holds plain inline
  content; `[x]` is just characters the author types. Round-trips trivially
  (it's text in a cell), zero new schema, and it matches exactly what the source
  and the markdown mode show. The pretty stoplight badge appears where it already
  does — at render time, in the preview.
- **(v1 polish, recommended if cheap) A view-only decoration.** A ProseMirror
  plugin paints a badge chip over a leading `[x] [-] [ ] [/]` in a cell while the
  underlying text stays literal — the *same decoration pattern* Compose already
  uses for slide collapse. No schema change, no serializer change, fully lossless;
  it just makes Compose feel WYSIWYG for the four markers.
- **(later) A real inline marker node** with a picker. More schema + a serializer
  rule; only worth it if authors want click-to-set markers. Deferred.
**→ Markers are literal cell text; add the view-only badge decoration as a fast-follow.**

**Axis D — Column alignment.**
GFM alignment is core and must round-trip. prosemirror-tables is
markdown-agnostic, so we add an **`align` attr** to the cell spec, read it from
the markdown-it token on parse (markdown-it emits `style="text-align:center"`),
render it in the editor, and emit the delimiter row from it on serialize. A small
per-column align control (left/center/right) lives in the table toolbar. **→ Add
a cell `align` attr wired through parse, view, serialize, and one toolbar control.**

**Axis E — The caption paragraph.**
The slide is `block+`, so a `table` node followed by a `paragraph` node is
already legal and the paragraph already round-trips. The below-note is applied by
*position* at render time — Compose needs to do nothing structural. **→ Captions
work for free; add a small "add caption" affordance under the table for
discoverability (optional).**

**Axis F — The lock's fate.**
Remove **only** the pipe-row trigger from `LOSSY_CONSTRUCTS`
(`deck-source.ts:56`). Keep every other trigger. So a table whose cell contains
`$math$`, block HTML, `~~strike~~`, or a footnote ref still locks the whole slide
(the existing detectors — `sourceHasMath`, the HTML/strikethrough/footnote
regexes — still fire on the cell text). The guard degrades safely: we only unlock
tables we can prove we round-trip. **→ Delete one regex; keep the safety net.**

**Axis G — The parser + serializer (the risky code).**
- *Parser:* Compose's parser is `defaultMarkdownParser` (CommonMark). Build a
  Compose-local `MarkdownParser` on a `markdown-it` with `table` enabled plus
  token→node handlers (`table_open`/`thead`/`tbody`/`tr`/`th`/`td`), reading
  alignment from the token attrs. Enable **only** tables — strikethrough,
  tasklists, etc. stay locked for now.
- *Serializer:* prosemirror-markdown has **no** table serializer, so we write one
  in `deck-markdown.ts` (`table`/`table_row`/`table_cell`/`table_header` nodes)
  emitting GFM pipe syntax. This is the single riskiest piece — the GFM footguns
  are a literal `|` in a cell (escape `\|`), empty cells, inline marks inside
  cells, and computing the delimiter row width + alignment. **→ Guard it with a
  round-trip fixture suite** built from the *real* gallery tables (compare-table
  with an empty cell, obligation-matrix with `[-]` + centered columns, roadmap
  with marker+text + inline-code headers), and run a **maker-checker** pass on the
  round-trip kernel (real blast radius per the MAKER-CHECKER rule).

## Recommended shape, in one paragraph

Add `prosemirror-tables`; extend `deckSchema` with its four nodes plus a cell
`align` attr; build a tables-enabled Compose parser and a GFM table serializer,
proven by a gallery-derived round-trip fixture suite; clamp the editor to
rectangular + per-column-align tables (no merge, no resize); keep the table node
`_class`-agnostic (component binding stays in the slide `directives` UI); carry
state markers as literal cell text with an optional view-only badge decoration;
let the caption ride as the following paragraph; and remove only the pipe-row
trigger from `LOSSY_CONSTRUCTS` so math/HTML/etc. in a cell still lock. glossary
and list-tabular are untouched.

## What the experience looks like

Click into a cell and type. **Tab** / **Shift-Tab** walk across cells and append
a new row when you run off the end. The table controls live in the slide's **own
context-sensitive divider bar** — the same bar that offers the prose registers
(H1/insight/note) becomes the *table* bar when the caret is in a table: quick
**+Row / +Column** inline, plus a **`⋯` overflow menu** holding the
less-frequent ops (align a column left/center/right, insert-before, delete
row/column/table). There is **no separate floating toolbar** — one
context-sensitive surface — and on mobile the inline quick-adds collapse into the
`⋯` so the bar stays compact (space was the explicit constraint). Insert a
brand-new table from the gallery (a `compare-table` slide ships a starter grid).
On `obligation-matrix`/`roadmap` slides the four state markers show as small badge
chips (the decoration) instead of raw `[x]`. Under it all, Compose is still
emitting clean GFM into the same `source`, so the markdown mode and the final
render never diverge — the two editors stay perfectly in sync.

> **Chrome revision (2026-07-19, post-review):** the first cut used a separate
> floating toolbar anchored over the table; on review that was a redundant second
> toolbar. It was folded into the existing context-sensitive divider bar with a
> `⋯` overflow, per the direction "the toolbar on the divider is already context
> sensitive and we should use it … on mobile we need a `⋯` for less-frequent
> functions."
>
> **Chrome revision 2 (2026-07-19, post-merge):** the hand-rolled `⋯` popover was
> replaced with the real shadcn **`DropdownMenu`** (Radix — native focus/arrow-key/
> Escape/outside-click a11y, no bespoke close logic), the trigger became a **table
> icon** instead of `⋯`, and every menu item carries a lucide icon, in a menu wide
> enough not to wrap (`w-48`). The controls are now a small React island
> (`table-controls.tsx`) mounted into a divider-bar slot (owner-keyed), so the
> trigger is a genuine `DropdownMenuTrigger` — resolving the trio's reuse finding
> (HARD RULE #15) properly rather than restyling a bespoke popover. Pure commands
> moved to `lib/compose/table-commands.ts` (shared, no circular import).
>
> **Follow-up: the on-deck trio (2026-07-19).** Three items the original design
> named but deferred, landed together (one PR, HARD RULE #17):
> - **Marker picker (Axis C "later").** On a stateful slide
>   (`obligation-matrix`/`roadmap`) the table island leads with four state-marker
>   chips (`[x]` pass · `[-]` partial · `[ ]` to-do · `[/]` skip). Clicking one
>   sets/replaces the marker at the caret cell's start via `setCellMarker`
>   (`currentCellMarker` reads it back); the cell's own rendered badge
>   (`stateMarkerPlugin`) shows the live state, so the chips carry no pressed-state.
>   Class-awareness comes from the slide's `directives` (`_class`), read through
>   `slideClassOf` — no new schema, still literal cell text (Axis C invariant holds).
> - **Insert-table affordance (Axis E / phase 2 "insert a brand-new table").** A
>   pill-actions button (`insertStarterTable`) drops a 2×2 GFM grid at the caret —
>   replacing an empty paragraph in place, else after the caret's block. Hidden when
>   the caret is already in a table (`.cs-caret-in-table`), so no dead button /
>   doubled table icon.
> - **Decoration-cache perf (the logged residual above).** `stateMarkerPlugin` now
>   memoizes its `DecorationSet` by `state.doc` identity, so a caret-only update
>   (the common keystroke) skips the whole-doc marker rescan — the scan runs only on
>   a real doc change. Behavior-identical (the cache is per-view, keyed on the
>   immutable doc object). A one-off manual timing put the full scan at well under a
>   millisecond on a synthetic 100-slide deck, so this was never a hot path; the memo
>   just removes the per-update rescan and retires the "revisit with a decoration
>   cache" residual. (Docs-site editor code, not the engine, so it's outside the
>   `npm run bench` harness — no committed baseline.)
>
> **Trio hardening (2026-07-19, this PR).** The three follow-ups went through the
> full adversarial trio (red team · Munger inversion · independent checker,
> HARD RULE #25). Fixes folded before merge:
> - **`setCellMarker` measured the marker off `textContent` and inserted with
>   `insertText`** — two bugs the red team reproduced. `textContent` skips inline
>   atoms, so a cell leading with an image diverged char-count from document
>   position and the range deleted the image; and `insertText` inherits inclusive
>   marks, so a marker set on a bold cell serialized `**\[x\] …**`, which the engine
>   never renders. Both fixed by measuring off the cell's leading *text* node and
>   inserting an explicitly unmarked node (regression-tested).
> - **The badge decoration was class-blind and painted header cells** (Munger
>   inversion) — Compose showed stoplight chips the export won't produce (on
>   non-stateful tables and in `<th>`). `stateMarkerPlugin` now descends only
>   stateful slides and decorates `table_cell` only, so Compose's badge matches the
>   engine exactly. `STATEFUL_CLASSES` is now the single source of truth for *both*
>   the picker and the decoration (documented as the pipe-table subset of the spec's
>   five marker-bearing components — the other three carry markers in lists, not
>   cells, so they are correctly out of a table picker's scope).

## Phasing (one branch → one PR, HARD RULE #17)

1. **Lossless foundation** — schema nodes + `align` attr, Compose parser, GFM
   serializer, round-trip fixtures, remove the pipe-row lock. Tables become
   editable as plain grids; markers are literal text. *This is the whole
   correctness story; it ships behind the existing Compose surface with no new
   chrome.*
2. **Editing chrome** — table toolbar (row/col/align/delete), Tab keymap, the
   insert-table register/affordance, portrait-safe styling parity with the
   rendered `compare-table`.
3. **LFM polish** — the state-marker badge decoration; a class-aware toolbar
   (a marker picker on obligation-matrix/roadmap); the "add caption" affordance.

Each phase is independently valuable and verifiable on the real Studio surface
(HARD RULE #23 — build the docs, open the actual Playground/Studio, edit a real
table slide; not a jsdom harness).

## Risks and how the design retires them

- **Serializer corruption** (the big one) — retired by the gallery-derived
  round-trip fixture suite + maker-checker on the kernel; any table we can't prove
  round-trips stays locked (Axis F keeps the net).
- **Silent capability leaks** (merge/resize the author does but GFM drops) —
  retired by clamping the editor to GFM-expressible tables up front (Axis B).
- **Cell content we don't model** (math/HTML in a cell) — retired by keeping the
  other `LOSSY_CONSTRUCTS` detectors live (Axis F).
- **Scope creep into list-authored tables** — glossary/list-tabular are explicitly
  out; they already work.

### Adversarial-trio hardening (2026-07-19)

The shipping code went through the full trio (red team · Munger inversion ·
independent checker, HARD RULE #25). It confirmed the kernel/caching/guard/XSS
posture is sound, and surfaced fixes that landed before merge:

- **Entity-encoded HTML in a cell** (`&lt;img onerror…&gt;`) slipped the lock (it
  keys on a literal `<`) and decoded to live markup in the export on the next
  edit. Now locked — a new `LOSSY_CONSTRUCTS` entry catches entity-encoded tags
  everywhere (also closes the same pre-existing gap in plain prose).
- **Borderless tables** (GFM allows omitting the outer pipes) with inline HTML
  past the first cell weren't locked — the HTML rule anchored on a leading pipe.
  Now the rule matches a tag on any line that also carries a pipe, either order.
- **Merged cells via paste** bypassed the Axis-B clamp (that clamp was toolbar-
  only). A `transformPasted` now strips `colspan`/`rowspan`/`colwidth` so a pasted
  merged cell can't enter the doc and serialize to a corrupted grid.
- **Locked-table dead controls** — the divider bar offered table controls on a
  *locked* table slide, where every command is silently eaten by the structural
  guard. The table branch now gates on `!locked` (the register footgun, #18).
- **Chrome polish** — Tab now genuinely appends a row at the last cell
  (`prosemirror-tables`' `goToNextCell` does not); the `⋯` menu is keyboard-
  operable (focus-in, Escape restores editor focus) with accessible delete labels;
  `⋯` toggles instead of flickering; the menu clamps to the viewport.

Residual/non-blocking, logged not fixed: the marker/active-slide decorations walk
the whole doc per keystroke (same order as the pre-existing plugins — revisit with
a decoration cache if a very large deck janks); GFM-standard ragged-row truncation
is render-equivalent (matches how the engine itself parses).

## Open decisions to confirm before implementation

1. **State-marker rendering in v1** — literal `[x]` text only, or literal text
   **plus** the view-only badge decoration? (Recommend: include the decoration —
   it's cheap, reuses the collapse-decoration pattern, and it's the difference
   between "a grid editor" and "a Lattice table editor.")
2. **Column resize** — confirm we **omit** it (GFM has no column widths, so a
   resize can't be saved). (Recommend: omit; revisit only if we ever add a
   width-carrying table variant.)
3. **Ship phase 1 alone first, or land 1–3 as one PR?** (Recommend: one branch,
   incremental commits, one PR when the feature reads as whole — phase 1's
   lock-removal shouldn't ship without at least minimal insert/edit chrome, or a
   user could unlock a table with no way to add a row.)

## References

- Parent: `engineering/decisions/2026-07-18-compose-prosemirror.md` (lines 147–152)
- Round-trip core: `docs/src/lib/compose/deck-markdown.ts`, `deck-doc.ts`, `deck-source.ts`
- Editor UI: `docs/src/components/studio/ComposeView.tsx`
- LFM standard: `spec/LFM-1.0.md` §3.2 (state markers), §5.1 (non-GFM-clean), §6
- Table transforms: `lib/integrations/markdown-it/plugins.js` (634–1078),
  `lib/components/chart/roadmap/roadmap.transform.js`, `lib/core/below-note.js`
- Table components: `compare-table`, `obligation-matrix`, `roadmap` `.docs.md` / `.styles.css`
- Module to adopt: `prosemirror-tables` (schema nodes, `tableEditing`, row/col commands)
