---
status: proposed
summary: >
  Slide metadata moves out of ad-hoc directive comments into one typed record carried by an HTML comment:
  `<!-- {layout=cards, footer="Q3 review"} -->`, with `@meta{…}` accepted as the long form. Fields reuse the
  front-matter register names. Long text uses `key: |` lines inside the same comment. `note` is the speaker note and
  `reader` is a labeled reader note; plain comments stay speaker notes. A source door compiles authored records to one
  internal form (`<!-- lat-meta: {…} -->`) on the same line numbers before any other engine step reads the source, so
  everything downstream is unchanged. Authored directive comments (`<!-- _class: … -->`) stop being read (hard cut,
  with a codemod and a loud lint), and the Marp bridge compiles records back to Marp comments on export. Order of work:
  consolidate the readers over the comment grammar first (needed under any syntax), then the door, then the cut. The
  spelling was chosen after a bake-off of seven candidates (`2026-10-17-meta-syntax-bakeoff.md`). Nothing is built.
builds-on:
  - 2026-10-14-plugin-inline-door.md
  - 2026-09-28-segno-unified-inline-notation.md
  - 2026-10-15-bridges-and-two-hosts.md
  - 2026-08-05-one-class-directive-reader.md
  - 2026-10-17-meta-syntax-bakeoff.md
---

# Slide metadata as one typed record in a comment (2026-10-17)

Status: proposed. The owner's decisions are in §2. Nothing is built. Siblings: the inline door (`@kind{…}`), Segno, the
bridges note (D6 promises a transpilation spec; this note is the first thing that spec must carry),
`2026-08-05-one-class-directive-reader.md`, which fixed the same disease for `class` alone, and the syntax bake-off
(`2026-10-17-meta-syntax-bakeoff.md` and its directory), which chose the spelling.

## 1. The answer

An author sets a slide's metadata with one comment that holds a typed record:

```
<!-- {layout=content, finish=ledger, headline=left, rule=short, eyebrow=bar, footer="Q3 review"} -->
```

`@meta{…}` is accepted as the long form and means the same thing: `<!-- @meta{layout=content} -->`. The field names
are the front-matter register names (`finish`, `headline`, `rule`, `eyebrow`, `lift`, …), so a deck-wide setting and a
per-slide override use the same words. A source door compiles the comment to the engine's internal form, and the engine
puts the same `data-*` attributes on the `<section>` that the old comments put there. Nothing renders.

Long text goes inside the same comment, on `key: |` lines after the record:

```
<!-- {layout=list-steps, footer="Clips · 5 steps, past the hall budget of 3", stress-slide=yes}
note: |
  This slide clips on purpose: it is the one the demo is about.
  Lint warns ("capacity-scale"); the Studio rings it.
reader: |
  Five steps do not fit at 1.5x; the export lists this page under OVERFLOW.
-->
```

**What this buys, in order of how sure we are:**

1. **One reader instead of 42.** One grammar (`readDirectiveComment`) exists today, and 5 production modules call it. 42
   other runtime modules re-spell their own reader of a specific key, and the key list is copied by hand in five places
   (§3). A record with a declared slot gives lint, the engine, the Studio drawer and autocomplete the same parse.
2. **Typed fields, autocomplete and structured editing.** `layout`, `variant`, `finish` and the rest are checked against
   the catalog and the register tables; a typo gets `'quite' is not a variant of cards; did you mean 'quiet'`. The drawer
   edits one field instead of regex-editing a class string.
3. **Notes get kinds.** `note` is the speaker note and `reader` is a labeled reader note, so the engine can tell them
   apart. That is the property the 2026-07-03 analysis found missing (§4.4).
4. **Invisible everywhere.** A comment shows nothing on the slide in any Markdown renderer. This is the one thing
   the other bake-off candidates could not give together with a typed record.

**What it does not buy: speed.** A comment is one `html_block` token and a record needs a Segno parse on top
(real directives cost 1,789 ns per span in `test/benchmark/baseline.json`). Phase 1 adds a bench scenario and the claim
stays "no slower than comments, within the variance band" (HARD RULE #19) until the numbers say otherwise.

**What it costs:**

- **A Major spec change.** LFM 1.0 is ratified and specifies `_class` as a comment; removing it is Major under
  `spec/LFM-1.1.md` §7. We are not GA, and the owner accepts this (§2).
- **Real Marp reads the record comment as a speaker note.** Measured with `@marp-team/marp-core`: an uncompiled
  `<!-- @meta{…} -->` leaks about 111 characters per slide into the notes that `--pdf-notes` and `--pptx` carry. The
  bridge must compile it in both producers (§7).
- **A comment cannot contain `-->`.** A note or footer that does needs an escape (`--\>`), which is untested (§10).
- **"Marp is already native Lattice markdown (no import)"** (`2026-06-14-presentation-import.md`) stops being exactly
  true. The bridge carries it in both directions (§7).

## 2. Decisions (owner, 2026-10-17)

| # | Decision | Chosen |
|---|---|---|
| D1 | Where may a record appear? | **Own line only.** A comment that opens on its own line, 0 to 3 spaces in, outside a fence, and not inside a list or blockquote. |
| D2 | Long text (multi-paragraph notes) | **Inside the same comment**, on `key: |` lines after the record. (An earlier draft used a ```` ```meta ```` fence; the carrier change makes it unnecessary.) |
| D3 | Existing `<!-- _class: … -->` comments | **Hard cut with a codemod.** Authored directive comments stop being read; a lint error and a build warning catch the old form. Only the Marp importer reads them. |
| D4 | `_pane` markers | **In scope.** Pane markers become `pane=` records (§5.4). |
| D5 | Spelling | **A comment carries the record.** `<!-- {…} -->` is canonical, `<!-- @meta{…} -->` is accepted. Chosen by the owner after the bake-off (below). |
| D6 | Field names | **The front-matter register names**, with no new semantics. Dark and light stay universal variants (`universal=dark`). Per-slide `finish`, `headline`, `rule`, `eyebrow`, `lift`, `spectrum-trim` override the deck's. |
| D7 | Notes | **`note` is the speaker note; `reader` is a reader note**, labeled in the notes channel on export. Plain comments with no record **stay speaker notes** (Marp-faithful). Private working notes stay in the comments layer. |
| D8 | Reader-note export | **Labeled in the notes channel**: PPTX and PDF carry the speaker note, then a `Reader:` paragraph; the HTML player keeps them separate (speaker view shows speaker only, read view shows the reader note under the slide). |

**How D5 was reached.** The bake-off scored seven spellings (comments with a consolidated reader; inline code with and
without backticks; a ```` ```meta ```` fence; a reference definition; a `<meta>` tag; and this one) on parser pains,
rendering outside Lattice, jank, authoring size and correctness, validation and completion, house style, the Marp
bridge and speed. Totals ran 88.0 to 93.0, a tie broken by rubric judgments. The pre-registered rule "a candidate must
beat the control by 10 points" turned out to be unreachable (the control scored 90.1), and the results note says so.
What the numbers did show: the comment carrier is invisible in every renderer with a typed record, and the one-line
form places correctly 9 of 9; its two costs are `-->` and the Marp note leak. The owner took the carrier on those terms.

## 3. What the audit found (2026-10-17, against `main` at `ff03320`)

**Reader census, hand-checked (2026-10-17).** The rule: a tracked `.js`/`.mjs`/`.ts`/`.tsx` file under `lib/` or
`docs/src/`, outside tests, vendored code and generated bundles (1,114 files), whose code (not only a doc comment)
matches or scans HTML comments. 61 files qualify. Reading each hit by hand splits them:

| Group | Files | What they do |
|---|---|---|
| Re-spell their own reader of a specific key or directive shape | 42 | `_class`, `_pane`, `_focusSteps`, `_lens`, `tier`, `header`/`footer`, notes and the rest |
| The shared scanner | 1 | `class-directive-scan.mjs`, which reads through the shared grammar |
| Only strip, skip, tokenize or escape comments | 18 | `closed-comments.js`, `split-panels.js`, `html-player.js`, `flowchart-html.js`, `slide-class-spans.js` (which reads through the grammar and holds no comment regex in code) and 13 more |

Only the 42 are migration work. The 18 stay as they are, because real prose comments still exist and still need
stripping. The earlier figure of "about 61 readers" counted all three groups. The method is a grep for `<!--` inside
a regex literal or `RegExp(`, then a per-file read; the file lists are in §14.

**One grammar, narrow adoption.** `readDirectiveComment` (`lib/core/comment-directive.mjs:59`) is the engine's grammar.
Five production modules call it (`slides.js`, `lint-core.js`, `class-directive-scan.mjs`, `auto-split.js`, `slide-class-spans.js`). The rest re-spell it:

| Surface | Where | Reads |
|---|---|---|
| Render: `lattice_directives` | `lib/engine/slides.js:157-187` | every `KNOWN_DIRECTIVES` key from `html_block` and `html_inline` tokens; consumes the token |
| Render: `lattice_directives_apply` | `slides.js:190+` | `APPLIED_DIRECTIVES` become `data-*`, `--*`, class, pagination, header and footer meta |
| Render: `_focusSteps` expansion | `lib/integrations/markdown-it/plugins.js:158,177-206` | runs **before** `lattice_slide` |
| Render: panes | `lib/core/panes.js`, `lib/core/pane-spec.js` | `_pane`, `pane`, `panes`, `_class`; shared with lint |
| Render: split panels | `lib/core/split-panels.js:238-260` | drops and re-emits every comment in **rendered HTML** |
| Lint and autocomplete | `lib/authoring/lint-core.js`, `lib/core/class-directive-scan.mjs` | own regexes for `_focus*`, `paginate`, `class`, `header`, `footer`, `_debug`; autocomplete runs per keystroke |
| Notes | `lib/authoring/notes-core.js` | key-list copy (`:328`), reads **rendered HTML** (`:555`), then `strip*FromSource` re-reads the source |
| Studio | `slide-directives.ts`, `slide-notes.ts`, `slide-say.ts`, `slide-descriptions.ts`, `comment-block.ts`, and more (not counted) | key-list copy (`DIRECTIVE_KEYS`), in-place regex edits |
| Marp bridge | `lib/core/marp-bundle.js` | passes every comment through verbatim; Marp turns non-directive comments into speaker notes |

**Five hand-kept key lists:** `lib/engine/directives.js:38`, `lib/authoring/notes-core.js:328`, `docs/src/components/studio/slide-directives.ts:17`, `docs/src/playground/grammar-vocab.js:12`, and `lib/packages/slide-facts.mjs:73` (`FACT_DIRECTIVES`, pinned to `APPLIED_DIRECTIVES` by a unit test), plus
a partial one in `split-slide.ts:29`).

**Stale claims found on the way** (HARD RULE #18, on the path, fixed in Phase 4): `directives.js:5,165` calls
`parseCommentDirectives` the engine's parser, but it has no production caller; `notes-core.js:16-20` says notes flow
through Marp, which is retired as a render path.

**How much is used.** Across `examples/`, the gallery decks and component docs: `_class` about 4,000, `_footer` about
1,600, `_paginate` 156, `_header` 155, `_pane` 86, speaker-note comments a few dozen, `_focus` 17, `_track` 12. A codemod
covers all of it mechanically.

**Why this cannot be an ordinary plugin kind.** An inline kind receives its own text and returns HTML; it cannot see the
slide, and an empty return leaves the raw span visible (`plugins.js:1503-1509`). The dispatcher
(`lattice_inline_pills`, `plugins.js:1438`) also runs after classes are set, and the default layout is picked from those
classes. `@meta` therefore needs a host core rule (§5.1). It still gets a manifest and slot spec, so the editor tools
treat it like any other kind.

## 4. The record

### 4.1 Grammar

A **record comment** is an HTML comment whose first content is a Segno record, either bare or named:

```
<!-- {layout=content, footer="Q3 review"} -->          canonical
<!-- @meta{layout=content, footer="Q3 review"} -->     long form, same meaning
```

- **The opener line carries the `{`.** `<!-- {` or `<!-- @meta{` on the comment's first line, never a bare `<!--`. The
  bake-off found that a bare opener cannot be flagged when the comment sits inside a list or blockquote (placements 7 of
  9, against 9 of 9 for the one-line form), because nothing on that line says it is a record. This rule restores 9 of 9.
- **Bare braces are safe.** Of 6,460 comments in the examples, gallery, component docs and design notes, none starts
  with `{`. A prose comment like `<!-- {TODO} -->` parses as one unnamed item, and the reader reports it.
- **No clash with pills.** `{…}` in inline code is the pill syntax. A record comment is not an inline-code span, so the
  two never meet.
- **Wrapped records.** Segno does not accept a raw newline inside braces, so the reader joins wrapped lines until the
  braces balance (outside quotes) before parsing. This is a reader step, not a grammar change, and it is not built.
- **Bare values may contain spaces.** `class`-style values need no quotes; a value with a comma, `=`, brace or bracket
  is quoted (`footer="Q3, review"`), with `\"` for a quote.
- **Names are kebab-case.** Segno folds record names to lowercase, so `focusSteps` is written `focus-steps`
  (the bake-off found `focusSteps` came back as `focussteps`). The bridge maps them back to Marp's camelCase.

### 4.2 Keys

One registry, one file (`lib/core/meta-keys.mjs`, §5.2), replaces the five lists. The typed fields come from the
catalog and the register tables, and the codemod fills them (97.3% of the 4,017 class words in the corpus place
cleanly; the rest are mostly `finish-*` tokens and flagged for review):

| Key | Was | Notes |
|---|---|---|
| `layout`, `variant`, `universal`, `modifiers` | the words of `_class` | typed against the catalog; `variant` must belong to the layout |
| `finish`, `headline`, `rule`, `eyebrow`, `spectrum`, `spectrum-trim`, `spectrum-card`, `lift`, `stamp`, `tone`, `corners` | register tokens in `_class` (`finish-ledger`, `head-left`, `lifted`) | the same keys and values front matter uses |
| `header`, `footer`, `paginate` | `_header`, `_footer`, `_paginate` | text and flags |
| `bg`, `color`, `lang`, `style`, `theme`, `size` | the Marp-native set | same values as today |
| `focus`, `focus-style`, `focus-steps`, `build`, `debug`, `lens`, `track` | the Lattice-only set | same values |
| `note` | a plain speaker-note comment | the speaker note |
| `reader` | new | the reader note (§4.4) |
| `say`, `describe` | `say:`, `describe:` comments | narration and accessible description |
| `pane`, `panes` | `_pane`, `panes` | positional (§5.4) |
| `stress-slide`, `tier`, `gallery-authored`, `color-mode` | tooling pragmas (83 files carry `stress-slide`) | registry keys with a flag or enum type; the door emits their existing comment form, so the tools that read them are unchanged. The codemod must not turn `<!-- stress-slide -->` into a `note` |
| `carry` | the absence of `_` | flag; see §4.3 |

### 4.3 Scope

A record applies to **its own slide only**. Of roughly 5,900 directive comments in the corpus, 5 use the carry-forward
form (`<!-- class: … -->`). Deck-wide values live in front matter, which already holds them. A record that needs the old
carry-forward behavior says so: `{footer="Q3 review", carry}`.

`theme`, `size`, `lang` and `marp` are front-matter only. **Today nothing enforces that**: `GLOBAL_ONLY`
(`lib/engine/directives.js:90`) is defined and exported with no caller, and `theme` and `lang` apply per slide. Corpus
use is zero, so making lint enforce it is a small, deliberate tightening, stated here rather than assumed.

A slide may hold several record comments, adjacent or not. The door reads each on its own and merges in source order. A
repeated key is a lint error; the engine's behavior stays last-wins, as the comment readers are. The codemod merges
all of a slide's directives into **one** record.

### 4.4 Notes

| Field | Audience | Reaches |
|---|---|---|
| `note` | the presenter | PDF text annotation, PPTX presenter notes, the player's speaker view |
| `reader` | whoever opens the exported file | a labeled paragraph after the speaker note in PPTX and PDF; the player's read view under the slide |
| `say` | spoken narration | as today |
| `describe` | assistive technology | PPTX `descr`, tagged-PDF `/Alt`, HTML `aria`, as today |
| a plain comment | the presenter | the speaker note, as today (Marp-faithful) |
| private working notes | the author | the comments layer in the `.lattice` file, never PDF or PPTX |

**Why this is now safe to build.** `2026-07-03-author-reader-notes-deferred.md` deferred a reader note because the
engine had no notion of note kind: every non-directive comment was the speaker note, so a `_reader:` comment would have
been exported as one. A record names its fields, so `reader` is a known key that never falls through to the speaker-note
channel. The 2026-07-04 follow-up rejected a three-way split because no export carries three labeled channels; this
design does not ask for three. Private stays a comment-layer concern, and `reader` rides the one notes channel, labeled.

A value that needs line breaks or blank lines goes on `key: |` lines inside the comment (D2); a short note stays in the
record (`note="Open cold."`). Several `note` lines are several paragraphs.

## 5. The engine

### 5.1 The door: compile record comments to the internal form before anything else reads the source

The first draft put a new core rule after `lattice_directives`. The review refuted that placement (§13.1): at least four
engine steps read **source text or early tokens** before any core rule runs (`liftImageBgImages` at
`lib/engine/index.js:537,606,971` and `lib/core/bg-image.js:177`; `lattice_focus_steps`, `plugins.js:177`; the pane
gate `mayHavePanes`, `pane-spec.js:164`; plugin admission, `deck-plugins.mjs:139`), and a rule after `lattice_directives`
also loses spot-versus-carry precedence, because that rule has already merged them (`slides.js:170`).

So the design is a **door**, the same idea as `normalizePaneSyntax` (`panes.js:473`), at engine entry:

1. `compileMetaSource(source)` (in `lib/core/meta-record.mjs`) finds authored record comments, reads each with the shared
   reader, and **replaces it, on the same line numbers**, with one internal comment per slide region:
   `<!-- lat-meta: {"class":"cards","footer":"Q3 review"} -->`. Same line count means no `token.map` shift. A `>` inside a
   value is written `\u003e`, so no value can end the comment.
2. `lattice_directives` (`slides.js:157`) reads `lat-meta` in its existing loop. Spot, carry and last-wins precedence are
   exactly what they are today, because it is the same loop. `lattice_directives_apply` and every `data-*` output are
   untouched.
3. Everything that read a comment before now reads `lat-meta`: bg-image lift, focus steps, the pane gate and normalizer,
   plugin admission.
4. **Authored directive comments stop being read.** The key set the engine accepts from authored text is empty;
   `lat-meta` is accepted only from the door and from the engine's own producers. The door neutralizes any authored
   `<!-- lat-meta` so the channel cannot be forged. An authored `<!-- _class: x -->` is a lint **error**
   (`legacy-directive-comment`) and a build warning, so a writer (human or LLM) who keeps using the old form never
   gets a silent wrong layout.
5. The engine's own producers (focus steps write `_focus` at `plugins.js:216`; the pane normalizer writes `_class` and
   markers at `panes.js:476-522,620`; pane source is built at `engine/index.js:533`) write `lat-meta`, through the same
   writer. This is the internal channel that survives the cut. A comment reader **does** remain inside the engine; what
   is cut is the *authored* directive form.

Because the carrier is already a comment, the door is smaller than it was for any other spelling: it changes what is
inside a comment the engine already finds, and it never has to guess at CommonMark structure.

### 5.2 One reader

`lib/core/meta-record.mjs` is a pure, fs-free leaf (HARD RULE #7). It exports:

- `scanMetaSource(source)`: the line scan used by the door, lint, autocomplete and the Studio. It extends
  `class-directive-scan.mjs`, which already tracks fences per line. (`closedComments` has **no** fence logic, contrary to
  the first draft.)
- `readMeta(text)`: the Segno record read, bound to the slot spec.
- `writeMeta(text, patch)`: the structured edit the drawer uses.
- `compileMeta(source, target)`: the door (target `internal`) and the Marp bridge (target `marp`, §7).

The key registry (`lib/core/meta-keys.mjs`) and the manifest's slot spec come from one place, and a test fails if a sixth
hand-kept copy of the key list appears (today there are five).

### 5.3 What counts as an own-line record

The door and `scanMetaSource` agree on one narrow shape, because they run on raw text and must not disagree with
CommonMark: a line indented 0 to 3 spaces that opens `<!-- {` or `<!-- @meta{`, outside any fence or indented code
block, and not inside a list item or blockquote. The record's braces close on that line or on a later line of the same
comment (§4.1). Lines after the record, up to `-->`, are `key: value` and `key: |` lines. A comment that opens with
`<!--` alone and puts the record on the next line is **not** a record: lint reports it (`meta-opener-bare`) with the fix.
A record in a list, blockquote or other container gets `meta-not-own-line`.

### 5.4 Pane markers

`<!-- {pane="bar no-title"} -->` on its own line starts a pane at that point, naming its component and modifiers as
`<!-- _pane: bar no-title -->` does. `<!-- {panes="60/40 stack no-rule"} -->` is the layout. The door **splits** a record that mixes
`pane` with other keys: `pane` becomes an internal `lat-pane` marker at that line (the form `normalizePaneSyntax`
already produces), and the other keys become `lat-meta`. So the carve downstream is unchanged, as the first draft claimed
but did not earn, and a note stays where it is: `panes.js:606-628` copies spot directives onto every pane page and keeps
notes on page 1, and the split preserves that. The `meta-pane-mixed` lint is dropped; mixing is legal.

### 5.5 Edge cases

| Case | Behavior |
|---|---|
| Inside a fence or an indented code block | literal text, not read |
| Opener is a bare `<!--` with the record on the next line | not a record; lint `meta-opener-bare` |
| In a list, blockquote, heading or table cell | not read; lint `meta-not-own-line` |
| A plain comment (no leading `{` or `@meta`) | the speaker note, as today |
| A comment starting `{` that does not parse (`<!-- {TODO} -->`) | a visible diagnostic, never a silent drop |
| `-->` in a value or a note | cannot be written; use the `--\>` escape (§10) |
| Slide with only a record comment | an empty slide; lint warns |
| Unknown key | lint error with a did-you-mean; the door drops it |
| Deck or slide sets `inline-code: literal` | the door still runs, because it works on source before the inline dispatcher |
| Repeated key | lint error; engine is last-wins |
| Authored `<!-- _class: x -->` | lint error `legacy-directive-comment`; ignored by the engine after the cut |

## 6. The tools that get better

- **Autocomplete.** After `<!-- {` the editor offers keys from the registry, then values from the key's type (class
  names from the catalog, `paginate` words, etc.). This needs the slot-parameter completion that does not exist yet:
  `inlineCodeCompletions` (`lint-core.js:3355`) offers kind names, icon names and hard-coded pill and spark words, but nothing driven by a kind's slot spec.
- **Lint.** One check against the slot replaces the per-key regexes. `unknown-class`, `paginate` and `_focus` checks read
  fields, not text.
- **Deck settings and the drawer.** `writeMeta` patches one field; nobody regex-edits a comment.
- **Compose.** `comment-block.ts` becomes a field editor. Compose for inline kinds (inline-door step 4) is not built;
  `@meta` is its first customer.

## 7. The Marp bridge

Marp reads directives only from comments and front matter, and it turns **any** other comment into a speaker note. So an
uncompiled record comment is not a directive to Marp: it is a note. Measured with `@marp-team/marp-core`, an
uncompiled `<!-- @meta{layout=content, footer="Q3"} -->` shows nothing on the slide and leaks about 111 characters per
slide into the notes that `--pdf-notes` and `--pptx` carry. The bridge therefore **compiles** records in the producer,
because VS Code runs no engine plugin (bridges note §4.2).

- **One compile, first, in both producers.** `compileMeta(source, 'marp')` runs **before** `liftImageBgImages`.
  `tools/export-marp.js` already orders lift (`:379`), `bakeSplits` and `stripPaneMarkers` (`:386`), then
  `withRuntimeScriptsReport` (`:395`). The Studio producer does not: `deck-export.js:280` runs
  `liftImageBgImages(stripPaneMarkers(bakeSplits(...)))`, the lift last, which is the bug the CLI comment at
  `export-marp.js:372-378` describes. This change fixes the Studio order too, so both producers share one pass list.
- **Shape.** Each field becomes `<!-- _key: value -->` (camelCase for Marp: `focus-steps` is `_focusSteps`); the typed
  fields recombine into one `_class` comment (`layout`, `variant`, registers as their tokens); `pane` and `panes` become
  their markers; `note` becomes a plain comment; `reader` becomes a plain comment starting `Reader:` after the speaker
  note, so Marp's notes channel carries both, labeled; pragmas become their own comment form.
- **Escaping, because a record is richer than a comment.** Segno quoting admits `: ` and `#`; a Marp comment value is
  YAML-ish. The compile quotes values that start with a YAML-significant character, **errors** on a `-->` that survived
  to this point in a directive value (`meta-comment-unsafe`, a build error, never a silent truncation), and rewrites
  `-->` in a note to `-- >`. A value that holds markup must not be able to end the comment and leak into the body
  (HARD RULE #22 stays satisfied).
- **The trailer rule stays** (`marp-bundle-html.js:190-208`); the compile emits no comment matching `Lattice:`.
- **Import (Marp to Lattice).** There is no importer today. The importer reads directive comments and writes records. It
  is what the codemod runs, so the two share one tested path.
- **The bridges note.** D6's transpilation spec lists "directive comments" as its first non-CSS case; §3 here is its
  measurement.

## 8. The spec

`spec/LFM-1.1.md` is a draft, so it changes in place; LFM 1.0 stays as ratified history. The changes: §2.1 and §2.4
(directive syntax becomes the record comment), §3.5 (the note boundary: `note`, `reader`, `say`, `describe`, and plain
comments as speaker notes), §5 (degradation: a record comment shows nothing in a non-Lattice renderer, so the "nothing
visible" claim holds; Marp reads it as a speaker note, and the spec says so), §7 (this is Major, so the draft number
moves to 2.0). `tools/lfm-conformance.js` and `spec/conformance` gain cases for the record, the `|` blocks, scope, the
pane line and the `--\>` escape.

## 9. Migration and order of work

Reordered by the review (§13.2): consolidation comes first because it is needed under any syntax. One branch, one commit
per step (HARD RULE #17).

| Step | Work | Proof |
|---|---|---|
| 1 | **Consolidate over comments.** `meta-keys.mjs` (one registry, five lists collapse), `scanMetaSource` / `readMeta` / `writeMeta` over the **existing comment grammar**, and migrate the 42 readers onto them. Slot-driven completion. The three internal producers write one internal form | the corpus comparison from `2026-08-05-one-class-directive-reader.md`, rerun for every key; `build:check`; a test fails on a sixth key-list copy |
| 2 | **The door.** `compileMetaSource`, `lat-meta` read in the `lattice_directives` loop, record comments accepted **next to** authored directive comments, wrapped-record joining, the `--\>` escape, `reader` and the notes channel | byte-identity: every key renders the same `<section>` as its comment, including `_class: image` + `![bg]`, adjacent records, `inline-code: literal` decks, panes and focus steps; a pin on rule order; a bench scenario, same-machine (#19) |
| 3 | Lint, autocomplete, drawer and Compose on records; `legacy-directive-comment` lint | the keystroke bench for `scanMetaSource` |
| 4 | **The bridge**, both producers, one pass list | a real marp-cli render and the VS Code preview of a compiled demo deck; `-->` and `: ` value tests; the reader note shows labeled in PPTX notes |
| 5 | **The codemod** (`lattice migrate meta`) over `examples/`, galleries, component docs, `design/`, fixtures. The galleries go in a **separate post-review commit** (HARD RULE #8) | all 276 decks render with identical class sets and pixels; page counts unchanged |
| 6 | **The cut.** Authored directive comments stop being read; the changelog fragment leads with `**Breaking:**` (HARD RULE #10); a per-feature demo deck `examples/meta.md` (HARD RULE #9) | `build:check` |
| 7 | Spec 2.0 draft and conformance cases | `tools/lfm-conformance.js` |

Steps 1 to 5 ship with authored comments still read, so every commit is green. **Step 1 delivers the reader, registry,
completion and structured edit with no syntax change**, and steps 2 to 7 are a syntax layer over a single door.

"Shouldn't change rendering" is measured as **the same class set and the same pixels** (owner, 2026-10-17): the engine
builds the class string from typed fields, so word order can change while the set does not. Proof is `tools/pixel-check.js`
and PDF page counts across all 276 decks.

Pane markers (D4) ride step 2 behind the door's split (§5.4); they remain the largest single risk (`panes.js` tests
comment tokens at about ten sites: `:119,187,358,394-395,429,449,473,562,568-569,614,630`).

**Export changes need your inspection** (CLAUDE.md, QUALITY BAR). Step 4 changes the bytes of an exported Marp bundle; I
will render the demo deck in dark and light mode and send both for sign-off before it merges.

## 10. Open items

- **The `-->` escape.** A comment cannot contain `-->`. The proposed escape is `--\>` in a value or note, unescaped on
  read. It is untested; the bake-off showed that without an escape this candidate fails the lossless-notes gate (G1).
- **Wrapped-record joining.** The reader joins lines until the braces balance, outside quotes. Segno itself rejects a raw
  newline in braces (checked). Build it in step 2 and fuzz it.
- **Reader-note labeling.** The PPTX and PDF label is `Reader:` after the speaker note. Confirm how PPTX notes pages show
  it and whether the player's read view needs a new slot.
- **`--strip-notes` and `reader`.** `--strip-notes` scrubs speaker notes before sharing a source. A reader note is meant to
  ship, so it should survive `--strip-notes`; decide that explicitly and test it. `stripNotesFromSource`
  (`notes-core.js:816`) must also strip `note` fields from source records, or private notes ship verbatim in exported source.
- **`note` is not an applied directive** (`directives.js:96`). It must not become a `data-note` attribute; the door
  routes `note` and `reader` to the note channel only.
- **The `key: |` block grammar** inside the comment. Reuse the line grammar the bake-off measured (`key: value`, a JSON
  string when quoted, `|` for blocks); a second grammar next to Segno is the cost, and a measurement of note lengths in
  the corpus should decide whether blocks are needed at all.
- **Per-keystroke cost of `scanMetaSource`.** Measure in step 3.
- **Studio file count** is stated as "not counted" in §3.
- **`followups.d/2348-p3-directive-keys-in-front-matter.md`** gets a better home here: front matter is deck-wide, a
  record is per slide, and lint can say so.

## 11. Verification this change owes (HARD RULE #25)

The full adversarial trio has run once, on the first-draft design (§13), and an independent checker audited the
bake-off harness. It owes a second pass on what ships, after step 2 exists, with these attacks first: `_class: image`
with `![bg]`; a value containing `-->`, `--\>`, a backtick, a brace or `@meta{`; two records on adjacent lines; a
record in a list, blockquote and indented block; `inline-code: literal`; a pane slide with a mixed record; focus steps
with `class` set; `--strip-notes` with a `reader` field; the Studio and CLI export orders; and a Marp round trip that
changes a deck's computed style or leaks a note.

## 13. Adversarial review (2026-10-17)

Three agents read this note and the code: a red team (hostile and accidental input, ordering, security), a Munger
inversion (why it fails in a year), and an independent checker (coherence and fit with the repo). They shared no
conclusions.

### 13.1 What changed because of it

| Finding | Source | Disposition |
|---|---|---|
| A rule after `lattice_directives` cannot see precedence; `bg-image`, focus steps, the pane gate and plugin admission read source or early tokens | checker, red team | Replaced by the door (§5.1). `_class: image` + `![bg]` was run: the lift matched the comment and ignored `@meta{class=image}` |
| Adjacent `@meta` lines merge into one paragraph the rule skips; 1,116 of 3,876 directive comments sit directly above another | red team | The door reads source lines, not paragraphs; the codemod merges a slide's directives into one line (§4.3) |
| The engine writes directive comments itself (focus steps, panes); the hard cut would break them | red team, checker | Internal producers write `lat-meta`; authored comments are what is cut (§5.1 items 4 and 5) |
| `inline-code-literal` contradiction | red team, checker | The door runs on source before the inline dispatcher (§5.5) |
| Notes: `--strip-notes` leak or loss; `note` as a `data-` attribute | red team | Open items, §10 |
| Marp compile-back corrupts values containing `: `, `#` or `-->` | red team | Escaping rules, §7 |
| Studio export order differs from the CLI (lift last) | checker | One pass list for both, §7 |
| Mixed pane and note records; focus steps drop other keys | red team | The door splits records (§5.4); `lat-meta` is read by its own key |
| `GLOBAL_ONLY` is unenforced; `closedComments` has no fence logic; `stress-slide` missing | checker | Corrected in §4.2, §4.3, §5.2 |
| Hard rules #8, #9, #10 unaddressed | checker | In §9 steps 5 and 6 |
| Step order: reader migration must precede the codemod; bridge before codemod | checker | §9 reordered |
| Scanner and CommonMark disagree on backticks, wrapping, lists, indented blocks | red team | One narrow own-line shape (§5.3) |

Attacks that held: HTML and CSS injection through footer and note (the same exposure as comment values today, through
`quoteDeclValue` and `realDeclValueIsSafe`, `slides.js:533-541`); the `\@meta` escape; `split: headings` pull-back; ReDoS.

### 13.2 What the checker confirmed

`readDirectiveComment` has 5 production callers; the census holds (43 key-aware, 18 strip-only, 61 total); rule order
puts a rule `.after('lattice_directives')` before `_apply`; header and footer meta is set in `_apply`; the `meta` fence
name is unclaimed; `---` inside a fence is safe because splitting works on tokens.

### 13.3 The objection the design did not answer, and how it was settled

The inversion's verdict was **reconsider at the root**: the benefits the note named (one reader, one key list,
autocomplete, structured edits) come from consolidation and need no new syntax; the repo had already cured this disease
for `class` without touching syntax (`2026-08-05-one-class-directive-reader.md`).

That objection stands as far as it goes, and it shaped the plan: **step 1 is consolidation over the existing comment
grammar**, needed under any syntax, and the syntax layer sits on a single door. What it did not decide is the
owner's wish for a typed record and for note kinds, which comments with loose directives cannot give. The owner chose
(D5) to proceed with a typed record and, after a seven-candidate bake-off (`2026-10-17-meta-syntax-bakeoff.md`), to
carry it in a comment. The trade the inversion named is accepted knowingly: a Major spec break, and every writer and model
trained on `<!-- _class: … -->` must learn the record, which the `legacy-directive-comment` lint makes loud instead of
silent.

## 14. Appendix: the reader census, file by file

Key-aware (43; the shared scanner `lib/core/class-directive-scan.mjs` is the one not re-spelling):

- `docs/src/components/studio/Editor.tsx`
- `docs/src/components/studio/PresentOverlay.tsx`
- `docs/src/components/studio/StudioShell.tsx`
- `docs/src/components/studio/coach/coach-core.ts`
- `docs/src/components/studio/editor-complete.ts`
- `docs/src/components/studio/lint.ts`
- `docs/src/components/studio/pane-pages.ts`
- `docs/src/components/studio/pane-probe.ts`
- `docs/src/components/studio/present-sections.ts`
- `docs/src/components/studio/present/rehearsal.js`
- `docs/src/components/studio/slide-directives.ts`
- `docs/src/components/studio/split-slide.ts`
- `docs/src/lib/code-packages/door.ts`
- `docs/src/lib/compose/comment-block.ts`
- `docs/src/lib/compose/deck-doc.ts`
- `docs/src/lib/compose/deck-source.ts`
- `docs/src/lib/compose/pane-model.ts`
- `docs/src/lib/compose/registers.ts`
- `docs/src/lib/lente/tags.ts`
- `docs/src/lib/single-slide-render.ts`
- `docs/src/playground/slide-context.js`
- `lib/authoring/lint-core.js`
- `lib/authoring/notes-core.js`
- `lib/authoring/prose-budgets.js`
- `lib/authoring/review-core.js`
- `lib/conformance/kinds/component.contract.js`
- `lib/core/auto-split.js`
- `lib/core/bg-image.js`
- `lib/core/chart-narration.js`
- `lib/core/class-directive-scan.mjs`
- `lib/core/marp-bundle-math.js`
- `lib/core/pane-spec.js`
- `lib/core/panes.js`
- `lib/core/resolve-motion.mjs`
- `lib/core/slide-speech.js`
- `lib/diagnostics/slice-equivalence-core.mjs`
- `lib/engine/directives.js`
- `lib/exemplars/tier-filter.js`
- `lib/integrations/markdown-it/plugins.js`
- `lib/layout/bridge.js`
- `lib/layout/gate.js`
- `lib/packages/rename.js`
- `lib/playground/index.js`

Only strip, skip, tokenize or escape (18):

- `docs/src/components/studio/architect-agent.ts`
- `docs/src/lib/caret-probe.ts`
- `docs/src/lib/deck-outline/deck-outline.ts`
- `docs/src/lib/playground-controller.ts`
- `lib/authoring/fact-check-core.js`
- `lib/components/chart/_chart-family/mark-detail.js`
- `lib/core/closed-comments.js`
- `lib/core/flowchart-html.js`
- `lib/core/heading-split-core.mjs`
- `lib/core/live-author-html.js`
- `lib/core/pane-css.js`
- `lib/core/prose-code.js`
- `lib/core/slide-class-spans.js`
- `lib/core/split-panels.js`
- `lib/export/html-player.js`
- `lib/forms/cell/masthead/masthead.transform.js`
- `lib/packages/code-door-core.mjs`
- `lib/plugins/chart-family/chart-family.dispatch.js`
