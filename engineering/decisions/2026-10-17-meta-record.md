---
status: proposed
summary: >
  Slide metadata moves out of HTML comments into one Segno record, `@meta{…}`, written on a line of its own, with a
  ```` ```meta ```` fence for long notes. A source-level DOOR compiles authored records into one internal comment form
  (`<!-- lat-meta: {…} -->`) before any other engine step runs, on the same line numbers; the engine's own producers
  (focus steps, panes) write that internal form too. So `lattice_directives` and everything after it are unchanged, and
  nothing downstream ever sees a `@meta` paragraph. Authored directive comments stop being read (hard cut, with a
  codemod and a loud lint), and the Marp bridge compiles `@meta` back to comments on export. Order of work: consolidate
  the readers over the existing comment grammar first (needed under any syntax), then add the door, then the cut.
  An adversarial review (red team, inversion, checker) changed the engine design and the order; §13 records it, and its
  strongest objection (the benefits come from consolidation, not syntax) is put to the owner as D5. Nothing is built.
builds-on:
  - 2026-10-14-plugin-inline-door.md
  - 2026-09-28-segno-unified-inline-notation.md
  - 2026-10-15-bridges-and-two-hosts.md
  - 2026-08-05-one-class-directive-reader.md
---

# `@meta{…}`: slide metadata as one record, not HTML comments (2026-10-17)

Status: proposed. The owner's decisions are in §2. Nothing is built. Siblings: the inline door (`@kind{…}`), Segno,
the bridges note (D6 promises a transpilation spec; this note is the first thing that spec must carry), and
`2026-08-05-one-class-directive-reader.md`, which fixed the same disease for `class` alone.

## 1. The answer

An author sets a slide's metadata with one record on a line of its own:

```
@meta{class=columns ratio-55-45, footer="Q3 review", paginate=false}
```

(written as inline code: `` `@meta{…}` ``). A source door compiles it to the engine's internal comment form, and the
engine puts the same `data-*` attributes on the `<section>` that the comment form puts there today. Nothing renders.

**What this buys, in order of how sure we are:**

1. **One reader instead of 42.** One grammar (`readDirectiveComment`) exists today, and 5 production modules call
   it. 42 other runtime modules re-spell their own reader of a specific key, and the key list is copied by hand in five places
   (§3). A record with a declared slot gives lint, the engine, the Studio drawer and autocomplete the same parse.
2. **Autocomplete and structured editing.** The drawer edits `_class` with a regex today. With a slot spec it edits a
   field of a record, and autocomplete offers field names and values from the same spec.
3. **One authoring surface for notes.** Notes, `say` and `describe` become fields of the same record, and a note may
   contain `-->`, which a comment cannot. (Withdrawn from the first draft: "no second parse path for notes". Notes
   still reach exports through the existing extractor, which reads rendered HTML; the door only changes how they are
   written. §13.)

**What it does not buy: speed.** A comment is one `html_block` token. A `@meta` line is a paragraph, an inline token, a
code span and a Segno record parse (real directives cost 1,789 ns per span in `test/benchmark/baseline.json`). The
cost is small but it is not a win. Phase 1 adds a bench scenario and the claim stays "no slower than comments, within
the variance band" (HARD RULE #19) until the numbers say otherwise.

**What it costs:**

- **A Major spec change.** LFM 1.0 is ratified and specifies `_class` as a comment; removing it is Major under
  `spec/LFM-1.1.md` §7. We are not GA, and the owner accepts this (§2).
- **Degradation.** On GitHub or in VS Code's built-in preview, a comment shows nothing and a `@meta` line shows as
  literal code. LFM §5 requires directives to "degrade to nothing visible". The spec section changes (§8).
- **The claim "Marp is already native Lattice markdown (no import)"** (`2026-06-14-presentation-import.md`) stops being
  true. The bridge carries it in both directions (§7).

## 2. Decisions (owner, 2026-10-17)

| # | Decision | Chosen |
|---|---|---|
| D1 | Where may `@meta` appear? | **Own line only.** Same rule as a comment today: it opens its own line, outside a fence. |
| D2 | Speaker notes, `say`, `describe` | **Inline plus fence.** Short values inline; long ones in a ```` ```meta ```` fence with the same record body. |
| D3 | Existing `<!-- _class: … -->` comments | **Hard cut with a codemod.** The engine stops reading directive comments. Only the Marp importer reads them. |
| D4 | `_pane` markers | **In scope.** Pane markers become `@meta{pane=…}` (§5.4). The recommendation was to defer them; the owner chose to include them, and §9 lists the cost. |

| D5 | Does the hard cut proceed? | **Open.** The inversion review argues every user-visible benefit comes from consolidation, not syntax (§13.3). Put to the owner with a recommendation: consolidate first, then decide the cut on a trial. |

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

`@meta{…}` is the inline door's `@kind{…}` shape with `kind = meta`, read by Segno unchanged. Bare values may contain
spaces, so `class=columns ratio-55-45` needs no quotes; a value with a comma, `=`, brace or bracket is quoted
(`footer="Q3, review"`). `\@meta{…}` shows the literal text, as for every other kind.

### 4.2 Keys

One registry, one file (`lib/core/meta-keys.mjs`, §5.2), replaces the five lists. Spelling follows the comment keys so
the codemod is a rename, not a redesign:

| Key | Was | Notes |
|---|---|---|
| `class` | `_class` | the slide's layout and modifiers |
| `header`, `footer` | `_header`, `_footer` | text |
| `paginate` | `_paginate` | `true`, `false`, `skip`, `hold` |
| `bg`, `color`, `lang`, `style`, `theme`, `size` … | the Marp-native set | same values as today |
| `focus`, `focusStyle`, `focusSteps`, `build`, `debug`, `lens`, `track` | the Lattice-only set | same values |
| `note`, `say`, `describe` | note comments, `say:`, `describe:` | prose; long forms use the fence (§4.4) |
| `pane`, `panes` | `_pane`, `panes` | positional (§5.4) |
| `carry` | the absence of `_` | flag; see §4.3 |
| `stress-slide`, `tier`, `galleryAuthored`, `color-mode` | tooling pragmas (83 files carry `stress-slide`) | registry keys with a flag or enum type; the door emits their existing comment form, so the tools that read them are unchanged. The codemod must not turn `<!-- stress-slide -->` into a `note` |

### 4.3 Scope

A `@meta` record applies to **its own slide only**. Of roughly 5,900 directive comments in the corpus, 5 use the
carry-forward form (`<!-- class: … -->`). Deck-wide values live in front matter, which already holds them. A record that
needs the old carry-forward behavior says so: `@meta{footer="Q3 review", carry}`.

`theme`, `size`, `lang` and `marp` are front-matter only. **Today nothing enforces that**: `GLOBAL_ONLY`
(`lib/engine/directives.js:90`) is defined and exported with no caller, and `theme` and `lang` apply per slide. Corpus
use is zero, so making lint enforce it is a small, deliberate tightening, stated here rather than assumed.

A slide may hold several `@meta` lines, and they may sit on adjacent lines. The door reads each line on its own and
merges in source order. A repeated key is a lint error; the engine's behavior stays last-wins, as the comment readers are.
The codemod merges all of a slide's directives into **one** line.

### 4.4 Notes and the fence

Short notes inline: `@meta{note="Open cold. Pause two seconds."}`. A note with paragraphs goes in a fence:

````
```meta
note: |
  Open cold. Hold two seconds before the first word.

  Then the second paragraph.
say: Thank the room.
```
````

The fence body is the same record, with one field per line. Both spellings feed one reader and produce the same
directive table. (The fence's exact line grammar is an open item, §10.) The door replaces the fence with a comment of the same
line count, so a note's prose never meets the `html_inline` guard.

## 5. The engine

### 5.1 The door: compile `@meta` to the internal form before anything else reads the source

The first draft put a new core rule after `lattice_directives`. The review refuted that placement (§13.1): at least four
engine steps read **source text or early tokens** before any core rule runs (`liftImageBgImages` at
`lib/engine/index.js:537,606,971` and `lib/core/bg-image.js:177`; `lattice_focus_steps`, `plugins.js:177`; the pane
gate `mayHavePanes`, `pane-spec.js:164`; plugin admission, `deck-plugins.mjs:139`), and a rule after `lattice_directives`
also loses spot-versus-carry precedence, because that rule has already merged them (`slides.js:170`).

So the design is a **door**, the same idea as `normalizePaneSyntax` (`panes.js:473`), at engine entry:

1. `compileMetaSource(source)` (in `lib/core/meta-record.mjs`) finds authored `@meta` lines and ```` ```meta ```` fences,
   reads each with the shared reader, and **replaces it, on the same line numbers**, with one comment per slide
   region: `<!-- lat-meta: {"class":"cards","footer":"Q3 review"} -->`. Same line count means no `token.map` shift. A `>`
   inside a value is written `\u003e`, so no value can end the comment.
2. `lattice_directives` (`slides.js:157`) reads `lat-meta` in its existing loop. Spot, carry and last-wins precedence are
   exactly what they are today, because it is the same loop. `lattice_directives_apply` and every `data-*` output are
   untouched.
3. Everything that read a comment before now reads `lat-meta`: bg-image lift, focus steps, the pane gate and normalizer,
   plugin admission. A `@meta` paragraph never reaches markdown-it, so adjacent lines, `token.map`, the ~90
   `:has(> code:only-child)` rules and `inline-code-literal` decks stop being questions.
4. **Authored directive comments stop being read.** The key set the engine accepts from authored text is empty;
   `lat-meta` is accepted only from the door and from the engine's own producers. The door neutralizes any authored
   `<!-- lat-meta` so the channel cannot be forged. An authored `<!-- _class: x -->` is a lint **error**
   (`legacy-directive-comment`) and a build warning, which answers the review's loudest worry: a writer (human or LLM)
   who keeps using the old form must not get a silent wrong layout.
5. The engine's own producers (focus steps write `_focus` at `plugins.js:216`; the pane normalizer writes `_class` and
   markers at `panes.js:476-522,620`; pane source is built at `engine/index.js:533`) write `lat-meta`, through the same
   writer. This is the internal channel that survives the cut. It means a comment reader **does** remain inside the
   engine. What is cut is the *authored* comment form.

The runtime mirror (HARD RULE #1) is the same pure leaf, bundled into the playground engine; there is no inline-kind
call to mirror, because `@meta` never reaches the inline dispatcher.

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
CommonMark (a red-team finding): a line indented 0 to 3 spaces whose whole trimmed content is one code span
`@meta{…}`, outside any fence or indented code block, and not inside a list item or blockquote. A backtick inside a value
needs a double-backtick span, which the scanner counts. A record is **one line**; long values use the fence. Anything else
stays code, and lint warns `meta-not-own-line` with the fix.

### 5.4 Pane markers

`@meta{pane=bar no-title}` on its own line starts a pane at that point, naming its component and modifiers as
`<!-- _pane: bar no-title -->` does. `panes=60/40 stack no-rule` is the layout. The door **splits** a record that mixes
`pane` with other keys: `pane` becomes an internal `lat-pane` marker at that line (the form `normalizePaneSyntax`
already produces), and the other keys become `lat-meta`. So the carve downstream is unchanged, as the first draft claimed
but did not earn, and a note stays where it is: `panes.js:606-628` copies spot directives onto every pane page and keeps
notes on page 1, and the split preserves that. The `meta-pane-mixed` lint is dropped; mixing is legal.

### 5.5 Edge cases

| Case | Behavior |
|---|---|
| Inside a fence (other than `meta`) or an indented code block | literal text |
| Not on its own line, or in a list, blockquote, heading or table cell | stays code; lint warns `meta-not-own-line` |
| Header or footer text | not a place for `@meta` |
| Slide with only `@meta` lines | an empty slide; lint warns |
| Unknown key | lint error with a did-you-mean; the door drops it |
| Deck or slide sets `inline-code: literal` | the door still runs, because it works on source before the inline dispatcher; `@meta` is the only way to set a class on a literal slide after the cut |
| Repeated key | lint error; engine is last-wins |
| `\@meta{…}` | not a record; the door skips a backslash-escaped line and the inline escape shows the literal text |

## 6. The tools that get better

- **Autocomplete.** After `` `@meta{ `` the editor offers keys from the registry, then values from the key's type (class
  names from the catalog, `paginate` words, etc.). This needs the slot-parameter completion that does not exist yet:
  `inlineCodeCompletions` (`lint-core.js:3355`) offers kind names, icon names and hard-coded pill and spark words, but nothing driven by a kind's slot spec.
- **Lint.** One check against the slot replaces the per-key regexes. `unknown-class`, `paginate` and `_focus` checks read
  fields, not text.
- **Deck settings and the drawer.** `writeMeta` patches one field; nobody regex-edits a comment.
- **Compose.** `comment-block.ts` becomes a field editor. Compose for inline kinds (inline-door step 4) is not built;
  `@meta` is its first customer.

## 7. The Marp bridge

Marp reads directives only from comments and front matter, so `@meta` must not reach Marp as written. The bridge
**compiles** it in the producer, because VS Code runs no engine plugin (bridges note §4.2).

- **One compile, first, in both producers.** `compileMeta(source, 'marp')` runs **before** `liftImageBgImages`.
  `tools/export-marp.js` already orders lift (`:379`), `bakeSplits` and `stripPaneMarkers` (`:386`), then
  `withRuntimeScriptsReport` (`:395`). The Studio producer does not: `deck-export.js:280` runs
  `liftImageBgImages(stripPaneMarkers(bakeSplits(...)))`, the lift last, which is the bug the CLI comment at
  `export-marp.js:372-378` describes. This change fixes the Studio order too, so both producers share one pass list.
  Putting the rewrite inside `withRuntimeScriptsReport` would run it too late.
- **Escaping, because a record is richer than a comment** (red-team finding). Segno quoting admits `-->` and `: `; a
  comment value cannot. The compile writes `_key: value` with YAML quoting when the value has `: `, a leading `#` or
  another YAML-significant start, **errors** on `-->` in a directive value (`meta-comment-unsafe`, a build error, never a
  silent truncation), and rewrites `-->` in a note to `-- >`. A value that holds markup must not be able to end the
  comment and leak into the body (HARD RULE #22 stays satisfied).
- **Shape.** Each field becomes `<!-- _key: value -->`; `carry` drops the `_`; `pane` and `panes` become their markers;
  `note` becomes a plain comment; pragmas become their own comment form.
- **The trailer rule stays** (`marp-bundle-html.js:190-208`); the compile emits no comment matching `Lattice:`.
- **Import (Marp to Lattice).** There is no importer today. The importer reads comments and writes `@meta`. It is what
  the codemod runs, so the two share one tested path.
- **The bridges note.** D6's transpilation spec lists "directive comments" as its first non-CSS case; §3 here is its
  measurement.

## 8. The spec

`spec/LFM-1.1.md` is a draft, so it changes in place; LFM 1.0 stays as ratified history. The changes: §2.1 and §2.4
(directive syntax becomes the record), §3.5 (the note boundary becomes the `note`/`say`/`describe` fields), §5
(degradation: a `@meta` line is visible code in a non-Lattice renderer, and the spec says so rather than claiming
"nothing visible"), §7 (this is Major, so the draft number moves to 2.0). `tools/lfm-conformance.js` and
`spec/conformance` gain cases for the record, the fence, scope and the pane line.

## 9. Migration and order of work

Reordered by the review (§13.2): the first draft moved lint and autocomplete before the other ~40 raw-text readers, put
the codemod ahead of the bridge, and let the byte-identity proof fail on `bg-image`. **Consolidation comes first because
it is needed under any syntax.** One branch, one commit per step (HARD RULE #17).

| Step | Work | Proof |
|---|---|---|
| 1 | **Consolidate over comments.** `meta-keys.mjs` (one registry, five lists collapse), `scanMetaSource` / `readMeta` / `writeMeta` over the **existing comment grammar**, and migrate the 42 readers onto them. Slot-driven completion. The three internal producers write one internal form | the corpus comparison from `2026-08-05-one-class-directive-reader.md`, rerun for every key; `build:check`; a test fails on a sixth key-list copy |
| 2 | **The door.** `compileMetaSource`, `lat-meta` read in the `lattice_directives` loop, `@meta` and the fence accepted **next to** authored comments | byte-identity: every key renders the same `<section>` as its comment, including `_class: image` + `![bg]` (the case that broke the first draft), adjacent lines, `inline-code: literal` decks, panes and focus steps; a pin on rule order; bench scenario, same-machine (#19) |
| 3 | Lint, autocomplete, drawer and Compose on `@meta`; `legacy-directive-comment` lint | the keystroke bench for `scanMetaSource` |
| 4 | **The bridge**, both producers, one pass list | a real marp-cli render and the VS Code preview of a compiled demo deck; `-->` and `: ` value tests |
| 5 | **The codemod** (`lattice migrate meta`) over `examples/`, galleries, component docs, `design/`, fixtures. The galleries go in a **separate post-review commit** (HARD RULE #8) | all 276 decks render byte-identically; page counts unchanged |
| 6 | **The cut.** Authored comments stop being read; the changelog fragment leads with `**Breaking:**` (HARD RULE #10); a per-feature demo deck `examples/meta.md` (HARD RULE #9) | `build:check` |
| 7 | Spec 2.0 draft and conformance cases | `tools/lfm-conformance.js` |

Steps 1 to 5 ship with comments still read, so every commit is green. **Step 1 delivers the reader, registry, completion
and structured edit with no syntax change**, and steps 2 to 7 are a syntax layer over a single door. That is why D5 can
wait for evidence (§13.3).

Pane markers (D4) ride step 2 behind the door's split (§5.4); they remain the largest single risk
(`panes.js` tests comment tokens at about ten sites: `:119,187,358,394-395,429,449,473,562,568-569,614,630`).

**Export changes need your inspection** (CLAUDE.md, QUALITY BAR). Step 4 changes the bytes of an exported Marp bundle; I
will render the demo deck in dark and light mode and send both for sign-off before it merges.

## 10. Open items

- **The fence line grammar.** Either the fence is YAML-shaped (a second small grammar, which cuts against "one
  grammar") or each line is a Segno record body. Decide in step 2 with a measurement of note lengths in the corpus.
- **The notes carrier.** The door emits notes as existing comment forms; `-->` is written as `--&gt;` and the extractor
  (`noteBodiesFromHtml`) un-escapes it. `stripNotesFromSource` (`notes-core.js:816`) and `--strip-notes` must also strip
  `@meta` note fields and `meta` fences from source, or private notes ship verbatim in exported source. Both need a test.
- **`note` is not an applied directive** (`directives.js:96`). It must not become a `data-note` attribute; the door
  routes it to the note channel only.
- **Per-keystroke cost of `scanMetaSource`.** Measure in step 3.
- **Studio file count** is stated as "not counted" in §3.
- **`followups.d/2348-p3-directive-keys-in-front-matter.md`** gets a better home here: front matter is deck-wide,
  `@meta` is per slide, and lint can say so.

## 11. Verification this change owes (HARD RULE #25)

The full adversarial trio has run once, on this design (§13). It owes a second pass on what ships, after step 2
exists, with these attacks first: `_class: image` with `![bg]`; a value containing `-->`, a backtick, a brace or `@meta{`;
two records on adjacent lines; a `@meta` in a list, blockquote and indented block; `inline-code: literal`; a pane slide
with a mixed record; focus steps with `class` set; `--strip-notes`; the Studio and CLI export orders; and a Marp round
trip that changes a deck's computed style.

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

### 13.3 The objection the design does not answer: consolidation is not syntax

The inversion's verdict was **reconsider at the root.** The note diagnoses duplication (42 readers, five key lists) and
prescribes a syntax change, but `2026-08-05-one-class-directive-reader.md` already cured that disease for `class`
without touching syntax. Which claimed benefits need the new syntax?

| Benefit | Needs `@meta`? |
|---|---|
| One reader instead of 42; one key list | No. A registry plus a shared reader over comments |
| Autocomplete and structured edit | No. Slot-driven completion works on the cursor context `<!-- _` as well as `` `@meta{ ``; `writeDirective` equals `writeMeta` |
| Notes may contain `-->` | Yes, but an additive ```` ```notes ```` fence covers it with no cut |
| Metadata as a first-class kind with a manifest | Yes, but that is conceptual uniformity, not something an author sees |
| Per-slide scope as the default | No. A lint can flag the 5 carry-forward uses |

Costs that only the syntax change carries: a Major spec break; degradation on GitHub, the VS Code preview and other
renderers (about 5,900 directive comments become visible code); the loss of "native Marp markdown, no import"; and the
muscle memory of every writer and model trained on `<!-- _class: … -->`, which the legacy lint (§5.1 item 4) mitigates
but does not remove.

This is the owner's call (D5). **Recommendation: do step 1 now, because it is needed under either syntax and ships every
user-visible benefit above except `-->` in notes. Then build the door (step 2), which makes the syntax a thin layer, and
decide the cut (step 6) on a trial: a small set of real decks authored by people and by agents in `@meta`, measured for
authoring errors and for how often the legacy form is still written.** The reordered plan keeps that option open at no
extra cost.

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
