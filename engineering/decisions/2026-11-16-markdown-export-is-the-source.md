---
status: shipped
summary: >
  Share → Markdown is the deck source, byte for byte: no style, no CSS, no comment, nothing Lattice did not
  write. It used to splice the whole theme stylesheet in, even for a built-in theme (a two-slide deck exported
  as 10,269 bytes where the deck is 116). Saved themes, finishes and components travel in the .lattice project
  file; the Marp bundle still carries them for Marp. Supersedes the Markdown half of the 2026-06-11 and
  2026-06-12 Workbench bridges.
---

# The Markdown export is the source (2026-11-16)

The owner's ruling: "we export the deck to markdown as faithfully and clean as it should be: no style tags, no
html, no css." And, asked separately: the author's OWN content (HTML or a `<style>` they wrote in Source) stays
verbatim. Lattice stops adding; it never strips what the author wrote.

## 1. What shipped before (measured on the real Studio)

A deck of 116 bytes (front matter, a title slide, a two-bullet slide, theme `indaco`) exported as **10,269
bytes**. After the front matter sat a `<style>` holding:

- a `/* Lattice Workbench — embedded theme "indaco" … Generated on export. */` comment;
- the whole minified `indaco` stylesheet, Marp `@theme` and `@size` headers included.

Three splices did it, all left from the Workbench era, when a `.md` was the only way a custom look could leave
the browser:

| Splice | Where | Ran when |
|---|---|---|
| `embedThemeInMarkdown` | `deck-export.js` | ALWAYS: `shareMarkdown` fetched the palette CSS even for a built-in theme |
| `embedFinishInMarkdown` | `share-export.ts` | a saved finish was in use |
| `embedComponentsInMarkdown` | `lib/layout/bridge.js` | a saved component was in use |

## 2. What ships now

- `exportMarkdown(source, name, files)` writes the source as given. With photos, the `.md` sits beside them in a
  `.zip`, as before (the only change to the text is the photo paths the caller points at the zip's files).
- `shareMarkdown(source, name, deckId, saved)` adds nothing. When the deck uses a SAVED theme, finish or
  component, the toast names each and points at the `.lattice` project file, which carries them as packages
  (`2026-09-23-portable-packages.md` §4).
- The Share menu row reads "The deck source, exactly as written".
- `embedThemeInMarkdown` is deleted with its test. `embedFinishInMarkdown` and `embedComponentsInMarkdown` stay:
  the Marp bundle, which is Marp-shaped on purpose, still uses them.

## 3. The tradeoff, stated

A `.md` of a deck that uses a saved look renders without it elsewhere; a built-in theme resolves by name. That
is the price of a clean file, and it is named in the toast with the way around it. The `.lattice` file is the
portable form; the `.md` is the text.

## 4. Evidence

- Real Studio, desktop Chromium: the same 116-byte deck now exports as exactly its 116 bytes (10,269 before).
- Unit: `deck-export.marp.test.ts` (the `.md` is the source byte for byte, with and without photos);
  `share-export.test.ts` (`savedLooksNote`); `studio.local-components.test.tsx` (the Markdown export is handed
  the component's name, the Marp export its CSS).
- E2E: `share-saved-packages.spec.ts` (the `.md` equals the deck, holds no `<style>`/`@theme`/`@import`, and
  the toast points at `.lattice`; the Marp bundle and the `.lattice` round trip still carry both looks).
