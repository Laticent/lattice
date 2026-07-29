---
status: shipped
summary: A Studio deck's title lived in two places that never spoke — the persisted deck index (written once by createDeck, then only by Rename) and the deck's own first heading — so a new deck stayed "Untitled deck" in the switcher, header, ⌘K, Share and export filenames no matter what the author typed into it. The index copy is retired as a source of truth: titleFromSource derives every listed title, the ACTIVE deck derives from the live editor buffer so the name tracks as you type, createDeck seeds the starter template's heading with the deck's name, and Rename rewrites that heading via retitleSource + settingsWrite (undoable, visible in the editor) instead of storing a label free to disagree with the cover slide. The index label survives only as the fallback for a heading-less deck and as a mirror (syncDeckTitle, written with each debounced save) for the surfaces that read localStorage without the app — studio.astro's pre-paint instant shell, which now also resolves a USER deck's title, and the backup's per-deck filenames. Knock-ons: the welcome built-in is listed under its own cover heading with a drift test pinning declared title to heading; a "(restored)" backup copy carries the marker in its heading, not an index label that would now be invisible; the demo's starter deck dedupes by a fixed id since the walkthrough now renames it; heading detection skips fenced code, which matters once Rename writes to the span it finds.
---

# A Studio deck's title IS its first heading

**Date:** 2026-07-29 · **Status:** shipped · **Area:** docs-site Studio
(`docs/src/components/studio/studio-store.ts`, `StudioShell.tsx`)

## The report

> Create a new deck in the Studio and you get "Untitled deck". Once you give the
> deck a title it is not reflected in the decks dropdown, or the other places
> where "Untitled" is displayed.

Exactly right, and it was structural rather than a missed refresh.

## What was wrong

A deck's title lived in **two** places that never spoke to each other:

| Where | Written by | Read by |
|---|---|---|
| `lattice-studio-deck-index` → `entry.title` | `createDeck` (once), `renameDeck` | the switcher, the header, ⌘K, Share, export filenames |
| the deck's own `# Heading` | the author, on every keystroke | the slide |

`createDeck()` stamped `"Untitled deck"` into the index and never looked at the
source again. Typing a real `# Q4 Board Pack` into the deck changed the slide and
nothing else, so the label stayed "Untitled deck" for the life of the deck — and
the only way to fix it was a Rename that wrote the *other* copy, leaving the
switcher and the cover slide free to disagree forever.

Two sources of truth for one fact. The fix is to delete one of them.

## The rule now

**A deck's title is the first heading in its source.** One fact, one home — and
the home is the deck itself, which is the copy the author is already editing.

- `titleFromSource(source, fallback)` derives it; `loadDeckList()` applies it to
  every deck, so the switcher can never disagree with the slide.
- The active deck derives from the **live editor buffer**, not from storage, so
  the name updates as you type — no save, no refresh, no rename step.
- `createDeck(title)` seeds the starter template's heading with `title`, so a new
  deck's name and its cover slide agree from birth.
- **Rename rewrites that heading** (`retitleSource`) through the same
  `settingsWrite` path as every other source-touching setting — so it lands in the
  editor and is undoable. It no longer stores a label beside the slide.
- The index label survives as **a fallback and a mirror**: the fallback for a deck
  with no heading at all, and a mirror (`syncDeckTitle`, written with each debounced
  save) for the surfaces that read `localStorage` *without* the app — `studio.astro`'s
  pre-paint instant shell and the backup's readable per-deck filenames.

Everything downstream — the switcher trigger and list, the slim Write/Read header,
⌘K, Share (including the `.md` / `.pdf` / `.lattice` filenames), the feedback
context — reads the one derived value.

## Consequences worth naming

- **The `welcome` built-in is now "Markdown for the boardroom"** in the switcher —
  its own cover heading — where it used to declare "Welcome to Lattice" in
  `decks.ts` and show that instead. A drift test (`studio-store.test.ts`) now fails
  if any built-in's declared title stops matching its heading, since that declared
  title is only the index seed. On a 390px phone the longer name truncates in the
  switcher pill where the old one just fit; the pill is built to truncate and every
  user-named deck already hit this, so it stands.
- **`(restored)` had to move into the source.** `importStudioState` marks a
  diverged backup copy `"<title> (restored)"`; as an index-only label that marker
  would now be invisible and the two copies would sit in the switcher under one
  identical name. It is written into the restored copy's own heading instead.
- **The demo's starter deck dedupes by a fixed id**, not by title. The walkthrough
  types a whole board deck into "My First Deck", which now *renames* it — a title
  match would miss it and accumulate a duplicate on every re-run.
- **Heading detection skips fenced code.** It always should have, but it mattered
  less when the scan was read-only: Rename now *writes* the span it finds, and
  rewriting a `# npm install` line inside a bash block would corrupt a slide.

## Verified

Driven on the real built Studio (`astro preview` + a real Chromium), not a
harness: New deck → type an `# H1` → the trigger, the switcher list, ⌘K, and Share
all track it live; a reload shows the new name in the **pre-paint** shell before
hydration; the menu Rename rewrites the heading in the editor. Screenshotted at
1440 / 820 / 390.

**Known, pre-existing, NOT from this change:** between roughly 820px and 1024px in
the Build stop, the switcher pill's title is squeezed to zero width by the crowded
header. Measured identical for the old short title and the new longer one, so it
predates this work; logged separately rather than pulled into this diff.
