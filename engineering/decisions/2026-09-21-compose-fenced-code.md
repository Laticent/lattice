---
status: in-progress
summary: Make fenced code a first-class thing in Compose — today a fence renders through the INLINE-code chip style, so a mermaid block reads as one bordered box per line, its language tag is invisible and unchangeable, there is no way to insert one, and nothing is highlighted. The round-trip is already lossless (prosemirror-markdown parses a fence to `code_block {params}` and emits it byte-exact; `hasLossyConstruct` does not lock a fence slide), so this is entirely a CHROME gap, not the schema surgery the table work was. The design: keep the fence a native ProseMirror textblock (no nested editor — a CodeMirror island inside the one-document model reintroduces the split selection/undo seam Option B was chosen to avoid), give it a mono panel, a language CHIP that is the picker's trigger, a toolbar insert door beside Insert table, and color it with the ENGINE's own highlight.js — the same tokenizer, the same Lattice mermaid/shell grammars, so Compose's colors are the slide's colors. One door covers every fence; the language tag is the only variable, and 142 of the 214 fences we ship are `mermaid`.
---

# Compose fenced code — a fence is a fence, and the tag is the only variable (2026-09-21)

> Status: **confirmed, building** (2026-09-21). The design model below was put
> as three forks and all three recommendations were taken: **A2** (ProseMirror
> block + the engine's highlight.js), **B3** (chip and toolbar, one picker), and
> **one fence door** covering the engine DSLs. The axes and the rejected
> candidates are kept as written, because the reasoning is the record. Sibling precedent:
> `2026-07-19-compose-table-editing.md`, which took the same surface from
> "locked, edit in Markdown" to editable. Parent:
> `2026-07-18-compose-prosemirror.md`.
> This note changes only the Compose editing surface (`docs/src`) plus, on the
> recommendation below, one additive read-only API on the playground engine. It
> does not change the render engine or exported bytes.

## The ask

Compose cannot meaningfully edit a fenced code block. The report, from the
mobile Studio: a `mermaid` fence on a diagram slide renders as a stack of
bordered boxes, one per line. What is wanted is first-class support — pick the
language inline or from the slide toolbar, get syntax highlighting from that
language, and insert a fence from a toolbar button that offers the language
too. Explicitly: **do not complicate it.** The authoring experience must stay as
simple as the rest of Compose.

## What is actually broken, measured

The model is fine. Measured by running the real parser and serializer over a
mermaid slide (`docs/src/lib/compose/deck-markdown.ts`):

```
NODES = heading {"level":2} | code_block {"params":"mermaid"}
RT    = "## A diagram slide\n\n```mermaid\ngraph LR\n  A[…] --> B[…]\n```"
EQ    = true   (byte-exact round-trip)
```

`prosemirror-markdown`'s schema already carries `code_block` with a `params`
attribute, its parser reads the info string into `params`, and its serializer
writes the fence back with the tag. `hasLossyConstruct` (`deck-source.ts`)
deliberately does **not** list fences, so a code slide is never locked — and
`withoutCode` blanks fences before every other detector runs, so a pipe row or a
`$x` inside a fence cannot lock the slide either. Typing inside a fence works
today, and `prosemirror-inputrules` disables input rules inside a `code` block,
so a `- ` or `# ` typed in a sample cannot turn into a list or a heading.

So this is not the table problem. Nothing needs a new schema node, a new
serializer, or a lock to be lifted. Five things are missing, all of them chrome:

1. **No style.** `ComposeView.tsx`'s stylesheet has no `pre` or `code_block`
   rule at all. `.cs-host code` — the INLINE-code chip (background, 1px border,
   padding, radius) — therefore applies to the `<code>` inside `<pre>`. An
   inline box that spans several lines fragments into one box per line, which
   is exactly the screenshot: `graph LR` in its own chip, then each arrow line
   in its own chip. The defect is one missing rule, not a rendering bug.
2. **The language is invisible and unchangeable.** `params` is carried on the
   node and shown nowhere. There is no way to see that a fence is tagged
   `mermaid`, and no way to change it without leaving for the Markdown pane.
3. **No insert door.** No toolbar action, and no ` ``` ` input rule.
4. **No highlighting**, in a surface whose whole job is to show the author what
   the slide will look like.
5. **Two keyboard traps, both worse on touch.** `Tab` is bound by the table and
   list keymaps, both of which return false outside their context, and
   `baseKeymap` does not bind it — so `Tab` inside a fence moves focus out of
   the editor. Leaving a fence that ends a slide is `Mod-Enter` (`exitCode`,
   from `baseKeymap`) and nothing else — undiscoverable on a desktop and
   unreachable on the phone the report came from.

## What a Lattice fence is (the inventory to respect)

Census over every shipped deck — `examples/*.md`,
`test/integration/baseline-decks/*.md`, `lib/components/*/*/*.gallery.md` at
`651aa2b`; re-derive with

```
grep -rhoE '^```[a-zA-Z0-9_+-]*' examples/*.md test/integration/baseline-decks/*.md \
  lib/components/*/*/*.gallery.md | sort | uniq -c | sort -rn
```

**214 fences, every one of them tagged.** By tag:

| tag | count | what it is |
|---|---|---|
| `mermaid` | 142 | an engine DSL — diagrams |
| `js` · `javascript` | 28 | code |
| `text` | 12 | deliberately unhighlighted |
| `anima` | 11 | an engine DSL — motion |
| `python` | 6 | code |
| `bash` · `sh` | 5 | code |
| `functionplot` | 3 | an engine DSL — plots |
| `css` `yaml` `html` `powershell` `console` | 7 | code |

Two facts fall out, and they shape the whole design.

**First: the dominant fence language is not a programming language.** Two
thirds of the fences we ship are `mermaid`, and `anima` and `functionplot` are
Lattice's own DSLs (`lib/integrations/markdown-it/plugins.js`). A picker that
offers a flat list of 192 highlight.js grammars answers the wrong question. The
catalog has to lead with the three engine DSLs, then the languages this deck
already uses, then everything else behind a search field.

**Second: the tag is never optional in practice.** `code.docs.md` says it three
times ("a bare fence renders as undifferentiated mono"), and no shipped deck
disagrees. So the insert door must produce a TAGGED fence, never an untagged one
the author has to remember to fix.

The pieces that already exist and must be reused rather than reinvented
(HARD RULE #15, HARD RULE #1):

- **`lib/core/fence-languages.js`** — the pure kernel: `normalizeInfo` (info
  string → tag, the same normalization markdown-it does), `scanFences`,
  `fenceLanguages`, `missingLanguages`, and the `bash`-vs-`shell` coaching
  finding (a script tagged ```shell measured 2 highlight spans where ```sh
  measured 15). The picker's catalog and its coaching both belong on this.
- **`tools/build-hljs-languages.js` + `docs/src/lib/ensure-hljs-language.ts`** —
  156 per-language grammars (median 1.9 KB) plus `index.json`, which maps every
  ALIAS to its canonical grammar. That manifest is the picker's language list,
  already built, already staged, already alias-resolved.
- **The engine's own highlight.js** — with Lattice's mermaid grammar
  (`registerMermaidHljs`) and augmented shell grammar (`registerShellHljs`)
  registered into it, so the CLI, the export and the browser preview all color a
  fence identically.
- **`slideTakesTable` / `SlideHeadings` / `SlideBlocks`** (`registers.ts`) — the
  established shape for "what does this `_class` render", built from the
  component manifests at the docs-site build and injected as a prop.
- **`TableControls`** — the established shape for a React island that the
  divider pill hosts while the caret is in a particular construct.

## The axes

### Axis A — what edits the fence (the fork that decides the rest)

| | A1 · plain block, styled | **A2 · ProseMirror block + engine highlight.js** | A3 · CodeMirror 6 node view |
|---|---|---|---|
| Highlighting | none | hljs token decorations | Lezer, via `latticeHighlight` |
| Colors match the slide | n/a | **yes, same tokenizer** | no, a second tokenizer |
| `mermaid` | n/a | the engine's own grammar | a second, hand-written grammar |
| One document | kept | **kept** | **broken for the fence** |
| New machinery | one CSS rule | an hljs→ranges walker + a decoration plugin + one engine read API | a nested editor: selection, undo, copy/paste and boundary plumbing |
| Editing behaviors | hand-bound | hand-bound | free (indent, brackets) |

A1 is out on the ask alone — highlighting was asked for.

**A3 is the tempting one and it is the wrong shape here.** The repo already has
three CodeMirror surfaces (`playground/editor.js`, the Studio's `Editor.tsx`,
`CodeField.tsx`), `@codemirror/language-data` is already a dependency, and a
CM-in-PM node view would buy real editor behaviors for free. But Compose's
architecture is a stated position, and it is stated against exactly this:
`deck-doc.ts` opens with *"Because it is one document, selection / copy / undo
span slides natively — the thing N stacked editors structurally could not do."*
A CodeMirror instance inside a fence reintroduces that seam in miniature: the
fence keeps its own undo history, ⌘A inside it means something different, and a
selection that starts in prose and ends in code has to be stitched across two
editors. That is the fragmentation Option B was chosen to avoid, bought back for
a surface where the author is fixing a line, not writing software — the code
component's own wall is fourteen lines.

**A2 keeps the one-document model and makes Compose's colors the slide's
colors.** The fence stays a native textblock, so every guard already written
(`structuralGuard`, `emitDeck`'s identity baseline, the clipboard bridge) keeps
working untouched. Highlighting is a decoration plugin reading spans from the
engine's highlight.js — the same instance, carrying the same Lattice mermaid and
shell grammars, that the export uses. Fences are short and only the edited block
re-highlights, so the per-keystroke cost is small; when the engine has not
loaded yet the fence is plain mono and re-decorates when it arrives.

The editing behaviors A3 would have given free are a handful of bindings, listed
under § The shape that ships.

**Recommendation: A2.**

The one cost to name: A2 needs a read-only `highlightSpans(code, lang)` on the
playground engine API (`lib/playground/index.js`), because there is no
"highlight this string" export today. That is an engine change, so it gets
maker-checker (CLAUDE.md § Maker-checker). It is additive and read-only, and it
is the alternative to standing up a SECOND highlight.js instance inside the docs
bundle — two singletons, two registration paths, and a fresh way for the
preview and the editor to drift (HARD RULE #1).

### Axis B — where the language control lives

The ask offers "inline or from a button on the slide toolbar" without choosing.

- **B1 · toolbar only.** The divider pill's Format group swaps to a language
  select while the caret is in a fence — exactly what it already does for
  tables. Consistent, costs no slide real estate, but the language of a fence
  the caret is not in stays invisible.
- **B2 · inline chip only.** A small `contenteditable=false` tag on the block's
  top-right corner — the shape the "◔ edit in Markdown" badge already uses —
  reading `mermaid`, clicking to open the picker. Every fence's language is
  legible at a glance, and the control is where the thing it describes is.
- **B3 · both, one picker.** The chip is the primary trigger; the pill hosts the
  same React control while the caret is in a fence, for keyboard and touch
  reach.

**Recommendation: B3**, because the second trigger is nearly free — one picker
component, mounted in two places, mirroring how `TableControls` is already both
a pill island and a set of in-table affordances. If that reads as complication,
B2 alone is the honest minimum: the chip is the part that carries information.

### Axis C — the catalog

Not a flat 192-row list. Three groups:

1. **Lattice** — `mermaid` (Diagram), `anima` (Motion), `functionplot` (Plot).
   Named for what they draw, with the tag in the row.
2. **In this deck** — the tags the open deck already uses, from
   `fenceLanguages(source)` on the existing kernel.
3. **Everything else** — searchable, from `playground/hljs/index.json`, which
   already resolves every alias to a canonical grammar, plus highlight.js's
   36-language `common` set. `text` sits here as "plain — no highlighting",
   because twelve shipped fences want exactly that.

Two coaching lines ride the picker, from the kernel rather than reinvented:
`shellFenceFindings`' script-vs-session warning, and a note on a tag with no
grammar on either side (`anima` highlights nowhere; that is fine and should be
stated, not silently monochrome).

### Axis D — the insert door

A `code` icon in the pill's action group, beside Insert table, with the same
mechanics: a no-op inside an existing fence and on a locked slide, hidden while
the caret is already in one (`cs-caret-in-code`, twinning `cs-caret-in-table`),
and withheld where a fence is editorially wrong for the layout — permissive by
default, a small unsuited set (title, quote, picture families), exactly
`slideTakesTable`'s posture and for the same reason: the engine CAN render a
fence there, but offering it produces a mis-set slide.

**The insert must not open a modal.** The layout already knows what fence it
wants — `diagram`'s skeleton is ```mermaid, `code`'s and `compare-code`'s are
```js — so the door inserts a fence tagged from the caret slide's `_class`,
falling back to the deck's most-used tag and then to `text`. The chip lands lit,
one tap from the picker. A `SlideFences` map built from the manifests at the
docs-site build supplies it, in the same shape and by the same route as
`SlideHeadings` and `SlideBlocks`.

### Axis E — does one door cover the engine DSLs?

A fence is a fence; the tag is the only variable. A door labeled "code" that
cannot insert the language two thirds of our fences use is a miss, and a second
"insert diagram" door is a second door for the same construct.

**Recommendation: one door, labeled for the construct rather than the
language** — it inserts a fence, and the picker says which kind. The slide
gallery keeps its own `code` / `diagram` / `compare-code` tiles; those add a
whole SLIDE, which is a different gesture, and they are unaffected.

## The shape that ships

1. **Style** the `code_block` as a mono panel — its own background, one border,
   padding, `white-space: pre`, the deck's mono face, and an explicit reset so
   `.cs-host code` cannot reach inside a `pre` again. This alone fixes the
   screenshot.
2. **The chip** — the language, top-right of the panel, a button that opens the
   picker. `contenteditable=false`, out of the round-trip.
3. **The picker** — one React island, three groups, a search field, the two
   coaching lines. Mounted from the chip and, while the caret is in a fence,
   into the pill's Format slot.
4. **The insert door** — pill action, grammar-gated, layout-defaulted tag.
5. **Highlighting** — a decoration plugin over the engine's `highlightSpans`,
   idempotent and per-block, plain mono until the engine is there.
6. **The keyboard, and the way out.** `Tab` / `Shift-Tab` indent and outdent by
   two spaces inside a fence (and stop leaking focus). `Mod-Enter` keeps
   `exitCode`. An empty line plus `Enter` at the END of a fence exits it, the
   convention every rich editor uses, which is what makes the block escapable on
   a phone with no modifier keys. The panel also gets a trailing paragraph when
   a fence would otherwise be the last block on a slide.

Roughly one PR: a pure catalog module plus its tests, the chrome, the decoration
plugin, and the one engine read API behind maker-checker.

## What this does NOT do

- **No nested editor.** See Axis A.
- **No fence attributes.** ```js {highlight=1,3} is a marp-core syntax
  `normalizeInfo` already discards for language purposes; Compose preserves the
  full info string on the node and edits only the leading tag.
- **No new lock.** Fences never locked a slide and still do not.
- **No new `~~~` support in the door.** markdown-it renders tilde fences
  identically and Compose round-trips a parsed one; the insert door writes
  backticks, as every shipped deck does.
- **No engine or export change.** `highlightSpans` is a read-only view onto the
  highlighter the engine already runs.

## The forks, and what was decided

Put as one round on 2026-09-21; all three recommendations taken.

| Fork | Decided |
|---|---|
| **A** — what edits the fence | **A2** · native ProseMirror textblock, colored from the engine's own highlight.js. Not a CodeMirror node view: the split undo/selection seam is what the one-document model exists to avoid. |
| **B** — where the language control lives | **B3** · the chip on the block AND the pill slot, one picker mounted twice. |
| **E** — the door's reach | **One fence door.** It inserts a fence; the picker says which kind. The slide gallery's own tiles are untouched. |

## Verification

Per HARD RULE #23, every claim below names its surface:

- **Round-trip** — fixture tests over the real shipped fences (all 214, from the
  census above): parse → serialize is byte-exact, and a language change edits
  only the info string.
- **The catalog and the coaching** — pure unit tests on the kernel, no DOM.
- **The surface** — the real Studio in a real browser, not jsdom: insert, type,
  switch language, `Tab`, exit from a trailing fence, and the same on a real
  touch device for the phone the report came from. `tools/screenshot.js` at
  1440 / 820 / 390, both modes.
- **The slide** — a demo deck under `examples/` with its committed PDF, because
  the change alters a surface a human sees (HARD RULE #9).
