---
status: shipped
summary: >
  Compose's clipboard speaks Markdown. A Markdown paste is parsed the way a deck is opened (slides, layouts,
  formatting) instead of being saved escaped; a copy writes the selection's Markdown to text/plain; a deck file
  dropped on Compose opens as a new deck instead of vanishing. A pasted deck's front matter is set aside, and a
  pasted directive that would fetch from another site is left out. Prior-art survey for the front-matter call.
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

- a run inside one block: its inline Markdown (`Hello **world**`); inside a code block, the code as is;
- anything else inside ONE slide, even all of it: its blocks' Markdown, without the slide's layout comment. A
  text selection pasted elsewhere should add text; a `<!-- _class -->` line would make it a new slide. (A first
  cut included the layout when the selection covered the slide; selecting a one-heading slide's text then
  copied a slide, which the unit suite caught.)
- across slides: each slide with its directives, joined by `---`;
- the whole deck: the deck file, front matter included.

**Paste** (`pasteAsMarkdown` decides, `markdownToSlice` builds):

| Clipboard | Path |
|---|---|
| this session's own HTML (CLIP_ORIGIN) | ProseMirror's HTML path, unchanged (lossless) |
| HTML with structure (`h1`–`h6`, `p`, lists, tables: a web page, Google Docs, Word) | HTML path, unchanged: its structure says more than its text |
| HTML without structure (VS Code's colored `div`s and `span`s) + Markdown text | **Markdown** |
| text only, reading as Markdown (`looksLikeMarkdown`: a heading, list, quote, rule, fence, table row, directive, or inline emphasis, code or link) | **Markdown** |
| ⌘⇧V, a caret in a code block, or text with no Markdown in it | ProseMirror's literal text path |

`markdownToSlice` normalizes the text (BOM, CRLF: `normalizeSourceText`, as every ingest does) and parses it
with `parseDeck`, the reader that opens a deck. Prose with no break and no directive goes in at the caret,
opened so it joins the paragraph there, with the leading and trailing spaces Markdown would trim put back (the
e2e suite caught `start.Then`). Anything with a slide break or a directive becomes whole slides. Prose Compose
cannot round-trip becomes a **locked** slide carrying its bytes as pasted; `emitDeck` now emits `raw` for a
locked slide with no baseline entry, since a locked slide cannot change.

## 3. Two guards

**Remote directives are left out** (`stripRemoteDirectives`). Compose does not show directives, so a pasted one
is content the author never sees, and one pointing at another site reaches the export, which fetches it. That
is the threat CLIP_ORIGIN closes for the HTML path (`2026-08-17-theme-css-is-a-preview-sink.md`). A directive
comment whose value holds `url(`, a scheme or a protocol-relative path is dropped outside fenced code, and the
Studio says how many. Layouts and other directives pass. The Markdown pane shows directives and is where to add
one on purpose.

**Front matter is never applied.** See §5.

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

The pattern: **the destination wins by default, and overriding is offered after the paste.** Every option must
also rule out the decay into a rule plus a `theme: x` heading, which is what Compose would otherwise produce.
Shipped: the front matter is recognized and set aside, the slides take the open deck's look, and the Studio
says the settings were not applied. Whether the message should carry an action ("Open as its own deck" or
"Apply them") is put to the owner.

## 6. Evidence

- Unit: `markdown-clipboard.test.ts` (signals, path choice, remote directives, slices, copy shapes, round trip);
  `deck-drop.test.ts` (a file over Compose is the shell's). Failing arm: reverting the `emitDeck` locked branch
  turns the locked-slide test red.
- E2E: `e2e/compose-markdown-clipboard.spec.ts` on the real Studio, desktop Chromium, Firefox (`gecko`) and
  WebKit (`webkit-tablet`).
