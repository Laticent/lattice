---
status: in-progress
summary: >
  An audit of what Compose can and cannot do with point and click, and the first slice of the fix. Compose edited two
  inline kinds (pills, sparks) and the code fence's options. Avatars and icons were raw code chips, an image was a broken
  picture with no way to choose a Library photo, a slide with a checklist or math was locked, and the slide bar had no
  room for another button. This slice adds avatar and icon editors, drawn from one schema-driven writer that any plugin
  with a slot spec can reuse; draws images and adds a Library photo picker and an image panel; and replaces four door
  buttons with one Insert menu that also writes diagrams, equations and plots. State-marker lists, inline math and plugins
  installed from a package are measured and left for the next slice.
---

# Compose: point and click for every plugin (2026-10-21)

Status: the first slice is built and driven on the real Studio (§8). Parents: `2026-10-13-compose-inline-notation-editors.md`
(the pill and spark editors this extends), `2026-09-21-compose-fenced-code.md` (the code fence), `2026-10-14-plugin-inline-door.md`
(the `@kind{…}` grammar), `2026-10-16-media-plugins.md` (images).

## 1. The answer

Compose's audience is mouse-first. They should click a thing on the slide and get a panel of choices, as they do for a pill.
The audit found the pill editor is the only inline kind with that treatment besides the spark. Of the ten things an author
can put on a slide, three had a panel; the rest were raw code, a broken picture, or a locked slide.

This slice ships:

1. **A schema-driven record writer** (`lib/core/segno-edit.js`). It changes one word of any `{…}` record from the slot spec
   the reader already compiles, and refuses a write that does not read back as asked. Avatars and icons use it today; an
   installed plugin that declares a slot spec gets the same writer with no parsing code of its own (§4).
2. **Avatar and icon editors** in the same panel host as pills and sparks (§3).
3. **Images**: Compose draws a Library photo instead of a broken image, an Image door opens a photo picker, and a tap opens a
   panel for the photo, its description and a background's side (§6).
4. **One Insert menu** in place of four buttons. It names every insert, says why one is unavailable where the caret is, and
   adds Diagram, Equation and Plot as doors with a working starter (§5).

It does not ship, and §7 says why and what each costs: inline math, state-marker lists, plugins installed from a package,
adding a photo from the picker, and a scene starter.

**How the ask was read.** The ask named "the poll feature" and "the note feature" as the quality bar. No poll feature exists in
the tree, so this note reads "poll" as the pill editor (the speech-to-text slip is the likeliest) and "note" as the slide note
and comment chips. The bar taken from them: one panel, one change per click, nothing else in the file moves, undo is one step,
and a refusal says so. If "poll" meant something else, say so, and §9 is where to change it.

## 2. The audit, measured

Driven on the real Studio (Chromium, the built site) with one deck holding every notation.

| Authoring surface | What Compose did before | What it does now |
|---|---|---|
| Pill `{LIVE, c2}` | drawn; panel (shape, color, size, icon) | unchanged |
| Spark `~{12 14 17}` | drawn; panel | unchanged |
| Avatar `!{Ada Okafor}` | a boxed code chip | drawn; panel (name, tile, size, shape, frame, every trait) |
| Icon `^{database}` | a boxed code chip | drawn; panel (icon grid, color, size, frame, look, corners, spoken name) |
| Code fence | language chip and options panel | unchanged; the Insert menu adds a tagged fence door |
| Mermaid, math, `functionplot` fences | code with a language chip; the author wrote the fence and its body by hand | doors write the fence with a working body, selected for replacing |
| Image `![alt](asset:name)` | a broken-image mark; no picker | drawn; picker; panel |
| `![bg right](…)` | an inline picture | a labeled background, with a side control |
| Table | controls in the bar | unchanged |
| ~~Notes (`say`, `describe`, `note`)~~ | read-only panel | **Shipped 2026-10-22.** Opening a note puts its words in a live field with the caret in it (`ComposeView.tsx` `buildCommentPanel`); Remove is the one other control, and a locked slide shows plain text. Ctrl/Cmd+Enter or leaving the field writes, Escape restores. `writeNote` (`comment-block.ts`) replaces only the words and keeps every byte around them: the opener, closer, channel prefix, the space or line break after the opener and before the closer, and the hanging indent of later lines (the field shows the words through `editableNote`, line breaks kept and that indent set aside; the joined reading form `readableNote` is only for a locked slide or a note inside a quote or list). Slide controls write half-typed words before they act, because they keep focus in the field; Undo and Redo do not, so they step the history as it stands. On a touch screen (`pointer: coarse`) a note opens for reading: the field is not focused, so the on-screen keyboard does not rise on every tap, and a tap on the words starts writing (the owner's call, 2026-10-23). Tapping another note's pill, or the open note's own pill, writes the open note first, since a tap on a touch screen may not blur the field; words the note refuses keep it open with the reason, as folding does. Switching decks while a note is half typed does not write it: the editor is torn down for the new deck, and a write there could land in the wrong deck (`followups.d/2861-p2`). Remove on a folded slide leaves the caret out of the slide's hidden text. A note may be rewritten into a tooling pragma (`lint disable …`), which export then reads as a pragma, the same as typing it in Markdown. On the note channel it refuses a directive (`footer:`, `class:`), a panes marker, a registered marker (`stress-slide`) and a second `<!--`; on every channel it refuses `-->`, a channel change and an empty note. Inside a quote or list a note stays one line. The panel is built once per opening and is not rebuilt by its own writes or by edits above it (a rebuild destroys the focused field, which blurs it and can write twice or into the wrong note); it finds its note through the plugin's mapped open position. An outside change (a sync, an AI edit) that arrives while the caret is in the field or on Remove waits until the caret leaves the note and the panel, and then lands. Any local edit the author makes first discards it: a note write, Remove, or typing in the slide. The author's edit wins, the rule the body text already follows (D2, `pendingResyncRef`); merging the two is a sync design question, not a note-panel one. Escape and Remove return the caret to the note's place on the slide, because a click on a pill never moves the editor's selection. Each channel has its own drawn icon (speech, eye, folded note). The owner question (should notes edit in the panel?) was open while the owner was away, so it was decided on the reversible side and then simplified at the owner's request: no Edit button, one click to type. The Insert menu's **Motion** item opens the Library on its scenes (a scene is a slide, so it cannot go at the caret) | Done |
| Chart data, legend, anima | text | unchanged (§7) |

**What still locks a slide.** Compose locks a slide whose prose it cannot round-trip, and the author is sent to Markdown.
Measured over the 321 decks in `examples/` and `test/integration/baseline-decks/` (2,965 slides):

| Cause | Slides locked |
|---|---|
| A state-marker list item (`- [x] done`) | 40 |
| Inline math (`$x^2$`) | 30 |
| Block HTML at the start of a line | 21 |
| Strikethrough, a footnote, other | 6 |
| Total | 96 (3.2%) |

**The slide bar.** At 390 px the bar's first row is 266 px wide and held eight 28 px buttons. The bar already had no room
for a fifth door, and the list of things to insert had reached ten.

**A trap the audit hit.** A first run showed every pill as a code chip. The page loads its authoring kernels from the playground
engine bundle (`docs/public/playground/esm/lint.js`), which `npm run playground:build` makes and `npm run build:e2e` does not. A
kernel change needs `npm run authoring-core:build` and `npm run playground:build` before the site is rebuilt; the symptom is
`[compose] the pill editor could not load its kernels`. Recorded in `engineering/gotchas/studio-playground.md`.

## 3. Avatars and icons are inline objects

A pill, a spark, an avatar and an icon are one atom node, `inline_object`, whose `src` is the code span verbatim
(`inline-object.ts`). The registry `OBJECT_KINDS` (`inline-objects.ts`) holds a reader, a drawer, an editor and an accessible
name per kind. Two rows and two panels were the whole addition; the node, the paste guard, the serializer, undo and the open-editor
state did not change. The `^` sigil joined the node's source test, so `^{database}` is an object.

- **Drawing.** Compose copies the engine's `.lat-avatar` and `.lat-icon` rules from the preview frame into the same scoped sheet
  as pills (`pill-sheet.ts`). The drawings themselves live in each plugin's data script, which the engine bundle does not carry.
  An object that cannot be drawn asks for the data once per plugin every ten seconds (`ensureObjectData`), then every object
  repaints. A failed load would otherwise repaint and ask again in a loop, which is why the cooldown exists.
- **Opening a deck writes nothing.** The silent pass converts a span into a node without emitting. The corpus byte test
  (`inline-objects.test.ts`) now covers avatars and icons: 93 avatars in 2 decks and 47 icons in 1 deck convert, and every
  deck emits identical bytes.
- **The avatar panel** draws a large preview, then the name, the tile color, size, shape and frame, and a collapsed "Face and
  clothes" section with gender and every trait. The name picks every trait the author did not write, so each trait's first chip is
  "From name" and says what the name picked (read from the same span with that word removed, never from the current value).
  The color-like traits (skin, hair color, eye color, top) show swatches from the plugin's own palette.
- **The icon panel** opens the same grid the pill's `icon=` axis uses, and holds the editor open while it is up.
- **Everything is drawn from the schema** (`kernels.avatar.SPEC`, `kernels.icon.SPEC`): a trait or option the vocabulary gains
  appears with no edit. `AvatarPanel.test.tsx` counts the chips against the schema.
- **The default word is one chip.** `md` is the default size: it is the first chip ("Standard"), is not listed twice, and picking
  it removes the word. A `md` the author wrote out shows as the same chip.

## 4. The writer, and why it is generic

`editPill` and `editSpark` are careful per-notation writers and stay as they are. Writing a third and fourth by hand repeats
the part that is hard: finding which word fills which axis. Segno's own `read` already answers that. For each word it
understood, it returns the parameter, the canonical value and the word's offsets (`spellings`). `editRecord` uses those offsets
to replace, add or remove one word without knowing the vocabulary, finds a plain-text value as the Nth unnamed item or by name,
and then reads the result back through the slot. A result that is not the old fields plus exactly the requested change returns
null. A null means "I would rather not touch it", never a guess.

What it promises, and what pins each promise (`test/unit/core/segno-edit.test.js`, 23 tests):

- an edit that says what the span already says returns the span byte for byte, over every shipped avatar and icon;
- every vocabulary word lands and changes no other field, over every shipped avatar;
- the author's spelling of every other word survives (case, spacing, order, an alias such as `db`);
- a reserved character in a label or name is quoted and reads back whole;
- two words for one parameter, an unknown parameter, a value outside the vocabulary and a non-record are refused;
- a batch where one change is refused writes nothing from the batch;
- the read-back refuses a write the slot would read differently, and one that changes a field nobody asked about. Both are
  mutation-checked: removing the read-back fails them. No real input reaches either, so each test hands the writer a slot that lies.

**Why this matters beyond two kinds.** A plugin installed from a package declares an inline kind's `slot` in its manifest as data
(`plugin.schema.json`, "Compose read it without running code"). That is exactly the input `editRecord` and a generic panel need.
§7 names the missing seam (drawing a kind the host cannot run).

## 5. One Insert menu

The four icon buttons (table, code, pill, spark) became one `Insert` button holding ten items in two groups: "Add to the slide"
(Table, Code, Diagram, Equation, Plot, Image) and "Add to a line of text" (Pill, Spark, Avatar, Icon). Each item has a plain
hint. An item that cannot work where the caret is stays in the list, is disabled, and says why in place of its hint ("A table
does not suit this layout", "The cursor is already in a code block", "This slide is edited in Markdown, so … cannot be added
here"). The old doors hid a button or did nothing; an author could not tell a missing feature from a blocked one.

- **It is a React island** mounted into the active slide's bar slot, as `TableControls` is, so it is the shadcn dropdown with
  arrow keys, typeahead and Escape. Each item runs the command its old button ran, so there is one write path.
- **Diagram, Equation and Plot** write a tagged fence with a body that works at once (`flowchart LR …`, `E = mc^2`,
  `{ "data": [{ "fn": "x^2" }] }`). The body is selected, so the first keystroke replaces it. The starters are data in the fence
  catalog (`fence-catalog.ts`, `starter`), and a test holds each to its body grammar. Motion has none: an empty Anima scene draws
  nothing, and scenes come from the scene library.
- **A finding worth keeping.** The first build moved focus to the text, then ran the command. The pill editor opened and closed
  within 23 ms: the menu was still closing, it moved focus around, and the editor read that as the author leaving. The cause was
  found with a focus and event trace on the real Studio, not by reasoning. The fix: the item waits in a ref until the menu has let
  go of focus (`onCloseAutoFocus`), the menu has no exit animation so that is one frame, then focus goes to the text and the
  command runs. Recorded in the gotchas.
- **Keyboard.** Enter opens the menu on the first item, the arrow keys walk the list, Enter chooses, and focus ends in the text.
  A test walks it. (Two arrow keys pressed in one frame can be swallowed by Radix's roving focus; the test waits for focus to move
  between presses, as a typist does. This is not a change to the menu.)
- **Specs that pressed the old buttons** now go through `insertVia` (`docs/e2e/compose-insert.ts`). Two assertions changed in
  meaning, not only in locator: "the table door is withheld on a title slide" is now "the menu says a table does not suit it",
  and "the spark door declines inside the author's code" is now "the Spark item is disabled and says so".

## 6. Images

Compose had no image support of its own. A markdown image is prosemirror-markdown's inline `image` atom, which Compose drew as a
bare `<img src="asset:harbor">` the browser cannot load.

- **Drawing** (`image-node-view.ts`). A Library photo is drawn from the Studio's own name-to-URL map (`media-urls.ts`), the one
  the preview renders with, and redraws when the Library changes. An image embedded as a data URI is drawn as it is (png, jpeg,
  gif, webp, avif only: any other data type could be markup). Everything else (a web address, `sample:` art, a relative file) is a
  stand-in that says what it is. **Compose fetches nothing the author did not put in the deck's own bytes.** The slide preview
  beside it draws the real picture under the Studio's own web-image setting, and an e2e test asserts no request to a web image host
  leaves the editor.
- **Backgrounds.** `![bg right:40% blur](…)` is labeled "Background · Right side". Its alt text is a directive, not a description.
- **The photo picker** (`PhotoPicker.tsx`) lists the photos the open deck may name as thumbnails, searchable by name, in a sheet
  shaped like the icon grid. Until now the only way to put a Library photo on a slide was to type `![](asset:` and read a
  completion menu. An empty Library says so and offers to open the Library.
- **The image panel** (`ImagePanel.tsx`): which photo (Replace opens the picker), the description, and, for a background, three
  placement chips. A placement pick writes only the side word and keeps the share and every other word (`bg right:40% blur` to
  `bg left:40% blur`). Remove takes the image and the paragraph it was alone in.
- **The door** puts the photo in a paragraph of its own after the caret's block, never splitting a line, and opens the panel on
  it. A new photo's description is the Library's own description when it has one, else the name (`team-photo` to `Team photo`),
  as the Markdown editor's completion does. A description the author already wrote stays when the photo is replaced.
- **Same open-editor state as pills.** `objectsKey` now opens on an inline object or an image. The open state carries the alt
  text, because an alt-only edit leaves `src` alone and the panel must still redraw (a unit test pins it).
- **A locked slide takes no image edit.** `editImage` and `removeImage` check the lock themselves, not only through the guard.

## 7. What did not ship, ranked, with the cost

| Gap | Measured or known | Cost to close | Recommendation |
|---|---|---|---|
| ~~State-marker lists lock the slide~~ | 40 of 96 locked slides | **Shipped 2026-10-22.** No new node was needed: the serializer's `paragraph` rule un-escapes a list item's leading marker (the table cell's `unescapeLeadingMarker`), the lock keeps only `[X]`, and a click on the chip flips `[ ]` and `[x]`. A corpus test holds every shipped marker slide to the same marker count and no escaped marker | Done |
| ~~Inline math `$…$` locks the slide~~ | 30 of 96 | **Shipped 2026-10-22** (`docs/src/lib/compose/raw-block.ts`). The Compose tokenizer installs the engine's own `mathInlineRule` and `mathBlockRule` at the places the math plugin installs them, so both draw the same boundary. The span is an `inline_math` atom and the `$$` block a `raw_block` of kind `math`; each carries its source verbatim. Drawn as MathML from the engine's KaTeX (`window.__latticeKatex`, exposed by `lattice-katex.js`), so the editor needs no KaTeX stylesheet or fonts; the TeX source shows until it loads | Done |
| ~~Block HTML locks the slide~~ | 21 of 96 | **Shipped 2026-10-22.** A `raw_block` of kind `html` carries the lines verbatim (markdown-it's own `html_block` rule, called with `html` on for that one call) and is drawn as a labeled box. Compose never renders the author's HTML. **Top level only**, for the reason `comment-block.ts` gives: inside a list item, a modeled block turns a tight list loose. HTML at a line start inside a list or quote, and inline tags that lead a line, still lock the slide (`withoutModeledBlocks` masks only what is modeled) | Done |
| ~~Plugins installed from a package~~ | no shipped example yet; the canary harness only | **Shipped 2026-10-22.** `kernels.record` (`lib/authoring/inline-editors.js`) compiles a kind's `slot` and writes through `editRecord`; `pluginKind` (`inline-objects.ts`) is one generic kind over the Studio's installed plugins (`setPluginKindProvider`), and `PluginKindPanel.tsx` draws the controls from the spec. The drawing seam stays open by design: the host cannot run the plugin's code, so the span shows its source in the code face and stays one tappable object. Real Studio: `e2e/compose-plugin-kind.spec.ts` | Done |
| ~~Add a photo from the picker~~ | the Library already imports, with a format dialog | **Shipped 2026-10-22.** The import loop moved to `media-import-batch.ts`; the Library and the picker both call it, and the picker saves to the shared shelf behind the same format dialog and picks the new photo | Done |
| Chart data, legend, anima | chart rows are text; 28 chart classes | `2026-10-14-chart-authoring-uniform-model.md` has the plan | Its own slice |
| ~~Notes (`say`, `describe`, `note`)~~ | read-only panel | **Shipped 2026-10-22**, edit in place; see §7 | Done |

### 7b. Known limits of the math and HTML atoms

- A slide with an escaped dollar (`\$5`) stays locked. The serializer writes `\$` back as `$`, and next to a math span one bare `$` changes what the engine draws (the checker's repro: `Price \$5. Area $\pi r^2$.` came back as a KaTeX error). Escaping every `$` would rewrite every currency figure an author touches.
- ~~Compose joins a soft line break inside a paragraph into a space~~ **Fixed 2026-10-22.** The parser reads a soft break as a `hard_break` node with `soft: true`; the serializer writes it back as a bare newline, except where that would split the paragraph (first or last child, next to another break), where it writes the backslash form, which draws the same `<br>`. After the paragraph is written, `guardParagraphLines` reads each line after a break as written and asks a markdown-it built like the engine's (commonmark, raw HTML, tables) whether the paragraph is still one paragraph. A line that would end it (`- b`, ` ---`, `01) b`, `<div>`, a table delimiter row under a piped header) gets one backslash before its first marker; an interior blank line becomes a backslash break, which draws the same `<br>`; a line still not saved joins the one above with a space, which is how every soft break was written before. A line that opens no block, such as `<b>x</b>` or `**<div>x**`, is never touched, and an escape that guards nothing (`\= b`) writes bare, as a mid-line one always has. The first line gets the same check against Compose's own tokenizer (so `1\) b` no longer reads back as a list); every line is unindented first, because a leading tab stops at a different column inside a list or a quote than at the probe's column 0; and each probe reads only the line above, so a 2,000-line paragraph serializes in about 40 ms. Where Compose does not model HTML and `$$` blocks (anywhere but the top level), a line that opens one is the author's markup read as text, so the guard writes it, and the rest of its paragraph, as it came, as main always did; at the top level the same text is a literal and stays escaped. A comment indented under a list item is one such line: it is written back as it came and stays hidden, so its slide stays editable (a lock tried here leaked through a quote and over-locked an indented top-level note, and was dropped). Five independent checker passes shaped this: the first two versions escaped node by node and kept missing what marks, expelled whitespace and node boundaries put at a line start. A corpus test holds every unlocked shipped slide to the same document and the same engine-rendered `<br>` count (`deck-markdown-soft-break.test.ts`).
- ~~A heading that spans two lines is dropped on edit~~ **Fixed 2026-10-23 (#2861).** A heading could not hold a line break, so a setext heading (`a` / `b` / `===`) failed to parse and vanished from its slide on any edit. A heading now admits `hard_break`; the `heading` serializer writes a level 1-2 heading that holds one in the setext form when every line is real text and the result reads back as the same heading (`isSetextHeading`: a last line `|b` over `---` is a one-column table), and otherwise writes one ATX line with the break as a space. The trailing-`#` escape is kept, except on an empty heading, whose only `#` run is its marker. #2861 first shipped its own `soft_break` node for paragraphs; that was dropped for #2875's design when the two met, and only the heading rule was carried over.
- A block atom pasted into a list item turns a tight list loose (the comment atom does the same).
- Typing a digit straight after a math span makes the engine read the dollars as text (`$x$2`): the engine's own closing guard.
- The preview is MathML, so it shows the shape of a formula, not the slide's typesetting. The slide preview beside Compose draws the real thing.
- Typing `$x$` in Compose makes plain text, which becomes a math atom on the next load. There is no input rule yet.

## 8. Verification

Each claim names its surface (HARD RULE #23).

- **The real Studio, Chromium, built site** (`npm run build:e2e`, `astro preview`): the new specs `compose-insert-menu`,
  `compose-avatar-icon-editor` and `compose-image` (25 tests), plus the existing `compose-pill-editor`, `compose-spark-editor`,
  `compose-fenced-code`, `compose-stress`, `compose-panes`, `compose-state-markers`, `compose-code-record` and
  `compose-chart-record`. 82 passed on the desktop project in the last full run. The keyboard test waits for focus to move between presses and ran four
  times over with no flake. One older spec, "copying a pill to another slide pastes the exact span", fails about one run in sixteen
  under three parallel workers (the caret walks before the kernels have turned the span into a pill); it passes alone eight runs in
  a row, and it now waits for the pills first, which did not remove the rare failure. Not caused by this change as far as measured,
  but not measured on `main` either.
- **Touch emulation at 1440, 820 and 390 px** (`@parity`, the three `*-touch` projects): a tap on an avatar, a tap on an image and
  the Insert door each pass at every width. This is Chromium touch emulation, not a device.
- **Screenshots** at 1440 and 390 px of the Insert menu, the avatar panel with its face section, the image panel and the picker.
- **Unit, jsdom** (docs: 276 files, 4,384 tests before the new ones; the new files add the avatar, icon, image, picker, insert
  and shared-control suites): every panel writes one change per pick, the schema drives the controls, and a refused write is shown.
- **Node** (`test/unit/core/segno-edit.test.js`): the writer, over the shipped corpus.
- **Mutation checks**, each reverted: dropping the "what the name picks" read, dropping the default-word handling, dropping the
  writer's read-back, and dropping the locked-slide check each fail a named test.
- **Not verified, and not claimed:** iOS Safari or any real device (touch, the sheet's animation, the keyboard); Firefox and WebKit
  engines for the new surfaces; the exported PDF (no export path changed, so the export sign-off does not apply); Safari's
  `@scope`, where the pill sheet falls back to showing the source in the code face.

## 8b. Independent review, and what it changed

A checker and a red team read the uncommitted diff (HARD RULE #25). Every finding below is fixed in this change, each with a test.

- **High, a pasted image forged deck structure.** A pasted `<img alt="a&#10;&#10;---&#10;&#10;b">` wrote a slide boundary, and a
  `title` carrying `<!-- _backgroundImage: url(https://evil/…) -->` wrote a directive the export fetches. prosemirror-markdown's
  image takes its attributes raw and its serializer never escapes a line break. The hole predates this change, and this change put
  it on the path (HARD RULE #18), so it is closed here: a pasted image takes only a source with no whitespace, quote, bracket or
  control character, its alt and title are folded to one line, and the serializer keeps every attribute on one line whatever built
  the node, so a slide the author did not touch still writes the upstream bytes. Each guard is mutation-checked.
- **Drawing disagreed with the engine.** `asset:constructor` drew `function Object() { … }` as a URL; names are matched without
  regard to case; `asset:team-photo.jpg` read as an asset with no name ("Photo not in this Library: null"); AVIF and `jpg` data
  URIs drew as pictures the engine prints as text. All four now follow the engine's rules.
- **A description starting with `bg` became a background.** A Library caption (a model can write one) or the author's own words
  turned the photo into a slide background. A description is now written as a sentence in that case; only the placement chips
  write the directive.
- **The Insert menu.** It took focus into the text on every close, even after a click into another field: now only when an item was
  chosen. Unavailable items could not take focus, so their reason could not be heard: they stay focusable, announce `aria-disabled`,
  and decline a choice. The Image item was offered inside a code block: it now asks the same blocker the door does.
- **Typed text lost on dismiss.** A name or description typed and then dismissed with Escape, a click outside or a swipe was dropped
  (the panel unmounts with no blur). It is written on unmount, as it is on blur.
- **Smaller.** A refused Remove (a locked slide) shows why and keeps the panel; `!{name=Ada}` can be renamed; a control character
  in a name is refused (it would not survive a reload); an avatar door with a selection it cannot use as the name goes in after it
  instead of deleting it; the picker's thumbnails load lazily; the corpus test now asserts that avatars and icons convert.
- **Tests that could not fail** (a locked-slide check with nothing clicked, a selection test with no selection) now click and select.

## 9. Decisions put to the owner

Taken on a reversible default, because the owner was away; each is one commit to undo.

1. **The Insert menu replaces the four door buttons** (the 2026-10-13 note left it as a recommendation for the owner). Alternative:
   keep the buttons on a wide pane and use the menu only on a narrow one. Cost of that: two ways to do one thing, and the specs and
   the tour guides would pin both.
2. **"Poll" read as the pill editor** (§1).
3. **A background's panel edits only its side**, not the share or the other keywords. The engine does not honor a declared share
   (`followups.d/2739-p4`), so a share control would promise what the slide does not do.
4. **The Library photo picker has no upload**, so a new author with an empty Library is sent to the Library first. *(Reversed 2026-10-22: the picker now adds a photo; see §7.)*
5. **Motion has no insert door.** *(Reversed 2026-10-22: the Insert menu's Motion item opens the Library on its scenes; see §7.)*

## 10. References

- `engineering/decisions/2026-10-13-compose-inline-notation-editors.md`: the inline objects, the registry, the sheet.
- `engineering/decisions/2026-10-14-plugin-inline-door.md`: `@kind{…}`.
- `engineering/decisions/2026-10-16-media-plugins.md`: images as records.
- `engineering/decisions/2026-09-21-compose-fenced-code.md`: the fence doors.
- `lib/core/segno-edit.js`, `lib/plugins/avatars/avatars.inline.js`, `lib/plugins/icons/icons.inline.js`: the writer and its two users.
- `docs/src/components/studio/`: `InsertControls.tsx`, `AvatarPanel.tsx`, `IconPanel.tsx`, `ImagePanel.tsx`, `PhotoPicker.tsx`,
  `object-controls.tsx`, `image-node-view.ts`; `docs/src/lib/compose/image-objects.ts`.
