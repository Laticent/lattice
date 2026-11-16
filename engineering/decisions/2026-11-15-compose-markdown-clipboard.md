---
status: shipped
summary: >
  Compose's clipboard speaks Markdown. A Markdown paste is parsed the way a deck is opened (slides, layouts,
  formatting) instead of being saved escaped; a copy writes the selection's Markdown to text/plain; a deck file
  dropped on Compose opens as a new deck instead of vanishing. Pasted slides land between slides, never splitting
  one. A Markdown paste is rendered through the engine and refused whole if it would load anything from another
  site. A pasted deck's front matter is applied key by key (the owner's ruling). Prior-art survey; trio findings.
---

# Compose's clipboard speaks Markdown (2026-11-15)

The owner's report: pasting a deck's Markdown into Compose, or dropping a `.md` file on it, does not work, and
copying out of Compose should give the Markdown. The deck is its Markdown; Compose is a view onto it, so the
markup of the view is not what anyone copies for.

## 1. Audit: what happened before (measured on the real Studio, Chromium, `compose-default`)

| Gesture | Result | Cause |
|---|---|---|
| Paste Markdown (`text/plain`) | Literal paragraphs, then **saved escaped**: `\- \*\*Revenue\*\* up 12%`, `\---`, `\<!-- \_class: big-number -->`. A `# Heading` pasted into a heading saved as `# # Quarterly plan`. Slide breaks and layouts lost. | No `clipboardTextParser`: ProseMirror splits plain text into paragraphs, and the serializer escapes what would otherwise read as syntax. |
| Copy from Compose | `text/plain` held the visible words only: no `#`, no `**`, no `---`, no directives. `text/html` was rich and round-tripped inside Compose. | ProseMirror's default `clipboardTextSerializer` is `textBetween`. |
| Drop a `.md` file on Compose | Nothing, and no message. | `deck-drop.ts` listed `.ProseMirror` as a zone that owns its drops, but ProseMirror reads only text from a drop: it cancelled the event and inserted nothing. |

Source (CodeMirror) was fine throughout: a paste is text, and a dropped file's text is inserted.

## 2. The model

`docs/src/lib/compose/markdown-clipboard.ts`, one plugin, appended after every plugin whose `handlePaste` moves
the selection first (the note plugin).

**Copy** (`sliceToMarkdown`, the `clipboardTextSerializer`). `text/html` is untouched, so Compose to Compose
stays lossless (directives ride the CLIP_ORIGIN bridge) and a paste into a document or an email keeps its
formatting. `text/plain` carries the Markdown, by what is selected:

- a run inside one block: its inline Markdown (`Hello **world**`) when it has formatting, and the bare text when
  it has none, so `-3% churn` does not reach a title field as `\-3% churn`; inside a code block, the code as is;
- anything else inside ONE slide, even all of it: its blocks' Markdown, without the slide's layout comment. A
  text selection pasted elsewhere should add text; a `<!-- _class -->` line would make it a new slide;
- across slides: each slide with its directives, joined by `---`;
- the whole deck: the deck file, front matter included. In a one-slide deck, selecting all of it is the deck.

A locked slide copies as its exact bytes (`raw`); the serializer would write its strikethrough as `\~\~`.

**Paste** (`pasteAsMarkdown` decides, `markdownToSlice` builds, `placeSlides` places):

| Clipboard | Path |
|---|---|
| this session's own HTML (CLIP_ORIGIN) | ProseMirror's HTML path, unchanged (lossless) |
| HTML with structure (`h1`–`h6`, `p`, lists, tables: a web page, Google Docs, Word) | HTML path, unchanged: its structure says more than its text |
| HTML without structure whose words match `text/plain` (VS Code's colored `div`s and `span`s) | **Markdown** |
| HTML without structure whose words do NOT match | HTML path: a page's copy handler can set the two independently, and the HTML is what the author saw |
| text only, reading as Markdown (`looksLikeMarkdown`: a heading, list, quote, rule, fence, table row, directive, or inline emphasis, code or link; not `__x__`, which is far more often `__init__`) | **Markdown** |
| plain paste (ProseMirror's own test: Shift held, not Shift+Insert), a caret in a code block, or text with no Markdown in it | ProseMirror's literal text path |
| a caret in a table cell, with Markdown that is more than inline text | literal text path: blocks or slides there split the table |

`markdownToSlice` normalizes the text (BOM, CRLF: `normalizeSourceText`, as every ingest does) and parses it with
`parseDeck`, the reader that opens a deck.

- **One paragraph** is inline text: it joins the caret's paragraph, with the edge spaces Markdown trims put back.
- **Several blocks** (a heading and bullets) are a CLOSED slice: each keeps its type and the caret's paragraph is
  split around them. An open slice folded the heading into the paragraph (`First para.Heading`).
- **Slides** (a break, a directive, or prose Compose cannot round-trip, which becomes a locked slide carrying its
  bytes) go BETWEEN slides (`placeSlides`): after the caret's slide, before it when the caret is at its very
  start, and in place of it when it is an empty slide with no layout. Inserted at the caret, they split the slide
  and the tail kept its layout: a big-number slide became two. Slide tools add pasted slides after the current
  one. A break at the very start or end of the text adds no empty slide; a paste of `---` alone adds one.
- `emitDeck` emits `raw` for a locked slide with no baseline entry, since a locked slide cannot change.

The Studio says when a paste did more or less than the text alone suggests: settings applied (named, with Undo
to take them back), prose that became a locked slide, a paste the structural guard refused.

## 3. The paste is checked before it lands

A Markdown paste is new content from outside, and Compose shows neither directives nor more than a raw block's
first lines, so a pasted reference to another site is one the author never sees, in every preview and export
(HARD RULE #22). The first cut stripped remote directive comments with a pattern over the source. The red team
bypassed it six ways: a nested comment the single pass rebuilt, record directives (`<!-- {footer=…} -->`),
fence lines markdown-it does not read as fences, unquoted `src=` in a footer, and raw HTML blocks. A pattern
cannot be made to agree with the renderer; `remote-ref.js`'s header lists eleven more spellings.

So the paste gets the gate Insert gives a sample slide (`gallery-gate.ts` `galleryRemoteRefs`): the text, front
matter aside, is **rendered through the engine**, alone and as inserted after a slide, and the markup is read
with the spine's `remoteRefsInHtml`, along with reference definitions and Mermaid fences. Any address at all, or
a check that cannot run, **refuses the paste whole** with a message and inserts nothing. Markdown that loads
from another site goes in through Source, where the author sees it. Every raw block the paste built also meets
`isRawBlockText`, the gate a pasted raw block meets on the HTML path.

The check is asynchronous (the engine renders the text), so the paste lands a moment after ⌘V; the
transaction is built from the editor's state at that moment.

## 4. A file dropped on Compose opens as a new deck

The owner's ruling (2026-11-15), matching the shell's rule from `2026-10-05-reopenable-exports.md` §6 that a
drop always opens a new deck. `.ProseMirror` leaves `OWN_DROP_ZONES`; the plugin returns true from
`dragenter`/`dragover`/`drop` for a drag carrying `Files`, so ProseMirror does not cancel it and the shell's
funnel takes it with its usual sniffing, caps and refusals. A text drag carries no `Files` and stays the
editor's.

## 5. Front matter in a paste: what other tools do

The owner asked for this to be researched before choosing ("we don't want to astonish people"). A pasted text
that starts with `---\ntheme: …\n---` into an existing deck:

| Tool | What it does |
|---|---|
| PowerPoint | Paste Options chip: *Use Destination Theme* (the default for plain Ctrl+V) or *Keep Source Formatting* |
| Google Slides | Paste chip: match the theme (default if ignored) or *Keep original styles* |
| Word | Conflicting styles: *Use Destination Styles* by default; Paste Options button on by default |
| Slidev (`src:` import) | Front matter merged key by key; the main entry's keys win |
| Marp | Front matter only at the top; a repeated global directive takes the last value |
| Obsidian, Typora, Bear, Notion | Front matter only at the top of a file; mid-document it decays into a rule, a setext heading and a rule |
| Keynote | Pasted slides bring their own theme (forum reports; users complain) |

Sources: Microsoft and Google support pages, sli.dev and Marpit docs, Obsidian forum; several defaults come
from third-party tutorials, and Keynote's from forum reports only.

The pattern in those tools: the destination wins by default, and overriding is offered after the paste. Every
option must also rule out the decay into a rule plus a `theme: x` heading, which Compose would otherwise produce.

**The owner's ruling (2026-11-16) goes the other way: a pasted deck's front matter is respected.** The use case
is real (bring a deck's look along with its slides), and the deck is Markdown, so the settings are part of what
was pasted. Shipped (`mergeFrontMatterBlocks`, `front-matter-merge.ts`, loaded on the first paste that carries
settings so it costs no startup bytes):

- an ENTRY is a column-0 key line and everything after it up to the next one (an indented body, a list written at
  column 0, blank lines inside a nested map or block scalar); only the comments and blanks directly above the next
  key move to that key;
- each top-level key the paste carries (bare or quoted) replaces the deck's entry whole, in place, keeping the
  deck's comment above it; a key only the paste carries is added; a key only the deck carries keeps its bytes;
- values are compared, not text: a one-line value by the engine's own `frontMatterScalar` (a trailing comment or
  extra spacing is not a change, and the deck keeps its line), a block value by its exact lines (inside `style: |`
  a `#` is CSS and indentation is structure); a key the paste repeats counts once, by its last value;
- any column-0 key YAML would read (`$schema:`, `x.y:`) is an entry of its own, and the notes after the last key
  are the block's, so replacing a key never deletes a key or a comment beside it;
- the block always closes with `---` on its own line, whatever the pasted text ended with;
- **settings or slides?** A leading `---` block is settings (`isSettingsBlock`) when at least one key is one the
  engine knows (`lib/core/deck-settings.js`, with the plugins' registers and the `_` keys) and no line is
  Markdown: every line is a key (known or not), an indented line, a list item, a comment or a blank, and none is a
  heading. Otherwise it is slides copied from the middle of a deck, starting at a break: the text is rebuilt so its
  closing `---` stays a break rather than a setext underline. "Goal: ship Q3" names no setting, and a heading
  marks a slide. The one ambiguity, a heading-shaped YAML comment (`# brand deck`) anywhere in the block, resolves
  toward the visible
  failure: those settings paste as slide text the author can see and undo, where the opposite reading lost a slide
  without a word;
- the merge rides the same transaction as the slides, so one Undo takes back both;
- the Studio names the keys it changed ("Applied the pasted deck's settings (theme, paginate)"), and says so when
  the pasted settings are the ones the deck already has;
- settings with no slides apply the settings and add no slide;
- the network check reads the front matter too, since it is applied. A `style:` key holds CSS, which can fetch,
  so it refuses the paste, and the message names the construct rather than claiming a fetch; Source is the way in.

The first cut set the settings aside, following the survey; the owner read that as the wrong default for a
Markdown tool.

## 6. The adversarial trio (2026-11-15)

Red team, Munger inversion and an independent checker ran on the first commit. Every finding was fixed before the
merge ask: the source-pattern strip replaced by the render gate (§3); slides placed between slides; closed slices
for blocks; table cells; plain-text copy of unformatted runs; `__x__`; a paste of `---` alone; locked slides
copied as bytes; plain-paste detection read from ProseMirror (Shift+Insert is not plain; a stale Shift no longer
sticks); no notice for a paste the guard refused; a drag that carries HTML beside its file stays ProseMirror's.

**The keys are read by the shared reader (2026-11-16).** After three review rounds each found the private splitter
misreading front matter in a new way, the owner pointed at the existing work: `keyGroups`
(`lib/core/front-matter-groups.js`) already reads a front-matter body's top-level keys for the Marp-bundle exporter,
the runtime's merge, the settings-block fold and the legend. The paste merge and `isSettingsBlock` now read keys with
it (HARD RULE #15), and its one real gap was fixed in place for every caller: a list at its key's own column. That
was a live Marp-export bug: the stray `- lead` made Marp reject the bundle's whole front matter (measured with
marp-core 4.4.0: no footer, no page numbers, no `invert`). A first cut also followed a quoted value or a flow map that
continues at column 0; the checker on 31c16ce9 measured that Marp rejects both shapes anyway, and that tracking an
open quote let one apostrophe (`title: 'Tis the season`) swallow every key after it, in the Marp bundle split and the
legend. It was taken out, with tests at both callers.
The longer-term home is Segno's front-matter island (followups.d/3042-p1), which is blocked on its own export
sign-off.

Review rounds on this half: a maker-checker review of the first cut (a run of slides starting at `---` lost its
first slide), the card's grader (the first fix still passed any "Word: text" line), and a second checker (column-0
lists dropped, nested maps cut at a blank line, plugin keys refused, text compared instead of values, repeated keys
not idempotent, a closing `---` read as a setext underline), and a third (the value comparison stripping `#` and
indentation inside block values, a trailing comment and unknown key lines deleted with the last key). Every finding
has a unit test that fails on the code before its fix. Measured on the repo's 444 decks with front matter: 4 test
fixtures carry a heading-shaped comment mid-block and would paste as slide text.

## 7. Evidence

- Unit: `markdown-clipboard.test.ts` (signals, path choice, slices, placement, copy shapes, round trip, the plugin
  with a stubbed check: lands, refuses, refuses when the check cannot run); `deck-drop.test.ts`.
- E2E: `e2e/compose-markdown-clipboard.spec.ts` on the real Studio with the real engine check: desktop Chromium,
  Firefox (`gecko`) and WebKit (`webkit-tablet`). Failing arms: with the refusal disabled, both remote-paste tests
  go red; with slides inserted at the caret, the mid-slide test goes red.
