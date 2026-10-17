---
status: proposed
summary: >
  Slide metadata moves out of HTML comments into one Segno record, `@meta{…}`, written on a line of its own.
  `@meta{class=cards, footer="Q3 review"}` replaces `<!-- _class: cards -->` and `<!-- _footer: Q3 review -->`; long
  speaker notes use a ```` ```meta ```` fence that holds the same record. A new host rule reads the records right
  after `lattice_directives` and merges them into the same directive table, so `lattice_directives_apply` and every
  `data-*` output stay unchanged. One reader module replaces 42 hand-rolled readers of specific comment keys and five copies of the
  key list. The comment form is removed (hard cut, with a codemod); the Marp bridge compiles `@meta` back to comments on
  export. Pane markers move in too. Nothing here is built.
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

(written as inline code: `` `@meta{…}` ``). The engine reads it, removes the paragraph, and puts the same
`data-*` attributes on the `<section>` that the comment form puts there today. Nothing renders.

**What this buys, in order of how sure we are:**

1. **One reader instead of 42.** One grammar (`readDirectiveComment`) exists today, and 5 production modules call
   it. 42 other runtime modules re-spell their own reader of a specific key, and the key list is copied by hand in five places
   (§3). A record with a declared slot gives lint, the engine, the Studio drawer and autocomplete the same parse.
2. **Autocomplete and structured editing.** The drawer edits `_class` with a regex today. With a slot spec it edits a
   field of a record, and autocomplete offers field names and values from the same spec.
3. **No second parse path for notes.** Speaker notes are read back out of the rendered HTML today. They become fields
   of the same record.

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
a regex literal or `RegExp(`, then a per-file read; the file lists are in §12.

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

### 4.3 Scope

A `@meta` record applies to **its own slide only**. Of roughly 5,900 directive comments in the corpus, 5 use the
carry-forward form (`<!-- class: … -->`). Deck-wide values live in front matter, which already holds them. A record that
needs the old carry-forward behavior says so: `@meta{footer="Q3 review", carry}`. `theme`, `size`, `lang` and `marp`
stay front-matter only (today's `GLOBAL_ONLY`), and lint says so.

A slide may hold several `@meta` lines; fields merge in source order and a repeated key is a lint error, not a silent
override.

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
directive table. (The fence's exact line grammar is an open item, §10.) A fence is already a block the markdown parser
leaves alone, so a note's prose never meets the comment rules or the `html_inline` guard.

## 5. The engine

### 5.1 One host rule, merged into the existing table

`lattice_meta` is a new core rule registered `.after('lattice_directives')` in `lib/engine/slides.js`. It finds the
paragraphs whose only content is a `@meta` code span (and the `meta` fences), reads each with the shared reader, merges
the fields into `meta.latticeDirectives`, and **removes the tokens**. `lattice_directives_apply` is untouched, so
`data-class`, `data-footer`, pagination and the rest come out exactly as before. A byte-identity test pins every key.

It must run before `lattice_directives_apply` (so `class` still joins the section) and before
`deck_class_propagate` and `lattice_default_component` (so the default layout reads the final class). A runtime mirror
lands in the same change (HARD RULE #1; `renderElement` is called from `lib/runtime/index.js:1137`).

Plugin admission reads classes from **source text** (`deckClassTokens`, `lib/plugins/deck-plugins.mjs:139-167`). It
reads `@meta` through the shared reader (§5.2) or a plugin admitted by a class would stop loading.

### 5.2 One reader

`lib/core/meta-record.mjs` is a pure, fs-free leaf (HARD RULE #7), the way `comment-directive.mjs` is. It exports:

- `scanMetaLines(source)`: the cheap whole-line scan for the raw-text readers (lint, autocomplete, panes, plugin
  admission, `_focusSteps`). Own-line-only (D1) is what makes it a line scan rather than a markdown parse.
- `readMeta(text)`: the Segno record read, bound to the slot spec.
- `writeMeta(text, patch)`: the structured edit the drawer uses.

Every consumer in §3 calls these. The key registry (`lib/core/meta-keys.mjs`) and the manifest's slot spec come from one
place, and a test fails if a fifth copy appears.

### 5.3 Why own-line-only decides the design

Several readers need a slide's class **before** or **without** a markdown parse: `_focusSteps` expands one slide into N
before `lattice_slide`; pane markers split a slide's source; lint and autocomplete scan raw text on each keystroke.
If `@meta` could sit mid-sentence, each would need a full parse. On its own line, `scanMetaLines` is a linear scan that
shares `closedComments`' fence handling.

### 5.4 Pane markers

Pane markers are positional and structural, so they need a rule (D4). `@meta{pane=bar no-title}` on its own line
**starts a pane** at that point, naming its component and modifiers exactly as `<!-- _pane: bar no-title -->` does.
`panes=60/40 stack no-rule` is the layout line. All other keys on any `@meta` line are slide-wide, wherever the line
sits; only `pane` is positional. A line that mixes `pane` with slide-wide keys is a lint error (`meta-pane-mixed`), so a
reader never has to ask which keys follow the position.

`panes.js` already normalizes every authored marker into an internal form (`normalizePaneSyntax`) before any pane rule
runs. That is the seam: the normalizer learns the `@meta` spelling and the carve downstream does not change.

### 5.5 Edge cases

| Case | Behavior |
|---|---|
| Inside a fence (other than `meta`) | literal text, as every pill |
| Not on its own line (mid-paragraph, heading, table cell, list item) | stays code; lint warns `meta-not-own-line` with the fix |
| Header or footer text | not a place for `@meta`; no section to write to |
| Slide with only `@meta` lines | an empty slide; lint warns |
| Unknown key | lint error with a did-you-mean over the registry; the engine ignores it |
| Slide that sets `inline-code-literal` | the line stays literal (the existing escape) |

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
**compiles** it, in the producer, because VS Code runs no engine plugin (bridges note §4.2).

- **Export (Lattice to Marp).** A new pass, `compileMeta`, lives in a shared kernel (`lib/core/meta-record.mjs`'s
  neighbor, called by both `tools/export-marp.js` and the Studio's in-browser producer). Each field becomes
  `<!-- _key: value -->`; `carry` drops the `_`; each `pane` and `panes` line becomes its marker; `note` becomes a plain
  comment. **Where it runs matters.** `tools/export-marp.js` runs `liftImageBgImages` (`:379`), then `bakeSplits` and
  `stripPaneMarkers` (`:386`), then `withRuntimeScriptsReport` (`:395`). The lift needs the `_class` comment in its
  slide part, and `stripPaneMarkers` removes pane markers because Marp would read them as notes. So `compileMeta` runs
  **before the lift**, as the first pass, and the three existing passes then see ordinary comments and behave as today.
  Putting the rewrite inside `withRuntimeScriptsReport` (beside `withoutCodeRecords`, the `@code` precedent) would run
  it too late: the lift would find no comment and pane lines would reach Marp as speaker notes.
- **The trailer rule stays.** The bundle's own `Lattice:` trailer comments are still excluded from notes
  (`marp-bundle-html.js:190-208`). The rewrite emits no comment that matches it.
- **Import (Marp to Lattice).** There is no importer today. This change gives it a defined job: read comments and write
  `@meta`. It is also what the codemod (§9) runs, so the two share one tested path.
- **The bridges note.** D6's transpilation spec lists "directive comments" as its first non-CSS case. §4.1 of that note
  said each such case "needs its own measurement before it moves"; the measurement is §3 here.

## 8. The spec

`spec/LFM-1.1.md` is a draft, so it changes in place; LFM 1.0 stays as ratified history. The changes: §2.1 and §2.4
(directive syntax becomes the record), §3.5 (the note boundary becomes the `note`/`say`/`describe` fields), §5
(degradation: a `@meta` line is visible code in a non-Lattice renderer, and the spec says so rather than claiming
"nothing visible"), §7 (this is Major, so the draft number moves to 2.0). `tools/lfm-conformance.js` and
`spec/conformance` gain cases for the record, the fence, scope and the pane line.

## 9. Migration and order of work

Hard cut (D3), in order. Each step lands as its own commit on one branch (HARD RULE #17).

| Step | Work | Proof |
|---|---|---|
| 1 | `meta-keys.mjs`, `meta-record.mjs`, the slot spec, `lattice_meta`, the runtime mirror, `@meta` accepted **next to** comments | byte-identity test: every key renders the same `<section>` as its comment; bench scenario, same-machine |
| 2 | Lint, autocomplete and `writeMeta` | the corpus comparison from `2026-08-05-one-class-directive-reader.md`, rerun on `@meta` |
| 3 | The codemod (`lattice migrate meta`) over `examples/`, galleries, component docs, `design/`, test fixtures | all 276 decks render byte-identically before and after; PDF page counts unchanged |
| 4 | Remove the comment readers; collapse the five key lists; fix the stale claims in §3 | `build:check`; a test fails on any fifth copy of the key list |
| 5 | The bridge: export rewrite and the shared import path | a real marp-cli render and the VS Code preview of the compiled bundle, both on a demo deck |
| 6 | Spec 2.0 draft and conformance cases | `tools/lfm-conformance.js` |

Steps 1 to 3 can ship while comments still render, which keeps every intermediate commit green. The cut in step 4 comes
only after step 3's byte-identity proof. Pane markers (D4) ride step 1 with their own carve test; they are the largest
single risk because `panes.js` tests comment and marker tokens at about ten sites (`:119,187,358,394-395,429,449,473,562,568-569,614,630`).

**Export changes need your inspection** (CLAUDE.md, QUALITY BAR). Step 5 changes the bytes of an exported Marp bundle;
I will render the demo deck in dark and light mode and send both for sign-off before it merges.

## 10. Open items

- **The fence line grammar.** The §4.4 example uses `key: value` with `|` blocks. Segno has no multi-line value form;
  either the fence is YAML-shaped (a second small grammar) or each line is a Segno record body. Decide in step 1 with a
  measurement of note lengths in the corpus.
- **A pill-only paragraph and `:has(> code:only-child)` rules.** About ninety CSS rules match a paragraph holding only a
  code span. `lattice_meta` removes the token before they could match, but a test must prove it on every slide shape
  (§5.5).
- **Per-keystroke cost of `scanMetaLines`.** Autocomplete calls the class scan on each keystroke today; the line scan
  must not be slower. Measure it in step 2.
- **`followups.d/2348-p3-directive-keys-in-front-matter.md`** (per-slide keys placed in front matter apply to every
  slide) gets a better home here: front matter is deck-wide, `@meta` is per slide, and lint can say so.

## 11. Risks the adversarial trio must test (HARD RULE #25)

This change touches the render kernel, the lint core, the export pipeline and a ratified spec. It earns the full trio
once step 1 exists, applied to what ships. The attacks to run: a `@meta` line that sets a class the plugin admission
cannot see; two `@meta` lines that disagree; `@meta` inside a `split` panel after `split-panels.js` re-emits the HTML;
a note that contains `-->`, a backtick or `@meta{`; and a Marp round trip that changes a deck's computed style.

## 12. Appendix: the reader census, file by file

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
