---
status: shipped
summary: A Studio deck's title lived in two places that never spoke — the persisted deck index (written once by createDeck, then only by Rename) and the deck's own first heading — so a new deck stayed "Untitled deck" in the switcher, header, ⌘K, Share and export filenames no matter what the author typed into it. The index copy is retired as a source of truth: titleFromSource derives every listed title, the ACTIVE deck derives from the live editor buffer so the name tracks as you type, createDeck seeds the starter template's heading with the deck's name, and Rename rewrites that heading via retitleSource + settingsWrite (undoable, visible in the editor) instead of storing a label free to disagree with the cover slide. The index label survives only as the fallback for a heading-less deck and as a mirror (syncDeckTitle, written with each debounced save) for the surfaces that read localStorage without the app — studio.astro's pre-paint instant shell, which now also resolves a USER deck's title, and the backup's per-deck filenames. Knock-ons: the welcome built-in is listed under its own cover heading with a drift test pinning declared title to heading; a "(restored)" backup copy carries the marker in its heading, not an index label that would now be invisible; the demo's starter deck dedupes by a fixed id since the walkthrough now renames it; heading detection skips fenced code, which matters once Rename writes to the span it finds. Hardened after the HARD RULE #25 adversarial trio, which moved the design: the index row now separates the deck's creation/rename LABEL (never overwritten as you type — an earlier cut destroyed it on the first keystroke) from a single-writer `derived` mirror read only by the pre-paint shell, and from a `restored` provenance tag; Rename round-trips the RAW heading via headingText (prefilling with the display title truncated cover headings at 60 chars and stripped their emphasis); the demo dedupes by that stable label again (a fixed deck id made re-running a tour silently destroy a kept deck with its checkpoints, chat and comments); a restored backup copy is stored byte-faithful (writing the marker into its heading corrupted restored content four ways); the scanner skips HTML comments and handles CRLF (a regression that reintroduced the bug for Windows imports); retitleSource flattens its title so a newline cannot inject a slide break. A `title:` front-matter override, proposed independently by two lenses, is recorded as the follow-up rather than adopted here.
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
  editor and is undoable. It no longer stores a label beside the slide. What it
  round-trips is `headingText` — the **raw** heading, not the display title, because
  the display title is stripped of markdown and capped at 60 characters and Rename
  *writes its result back into the deck*.

### The index row keeps three fields, and only one is a name

The stored index is not simply retired — the distinction it was badly serving turns
out to be real, and collapsing it entirely is what produced the worst defects found
in review (below). `IndexEntry` now separates them explicitly:

| field | written by | read by | is it a name? |
|---|---|---|---|
| `title` | a deliberate act only — create, import, restore-copy, an explicit Rename on a heading-less deck | the heading-less fallback; the demo's dedupe; the e2e specs | the deck's **creation/rename label** |
| `derived` | every debounced save (`syncDerivedTitle`) | `studio.astro`'s pre-paint shell, and nothing else | no — a single-writer **cache** |
| `restored` | a backup restore that laid this copy beside a diverged deck | `loadDeckList`, which appends the tag for display | no — **provenance** |

`title` is deliberately **not** overwritten as the author types. It is the only record
that a deck was ever explicitly named; an earlier cut of this change mirrored the
derived title straight over it, which destroyed that record silently and irreversibly
on the user's first keystroke after upgrade. Backup filenames derive from the source
too (`packWorkspace`), so nothing user-facing depends on the mirror.

Everything downstream — the switcher trigger and list, the slim Write/Read header,
⌘K, Share (including the `.md` / `.pdf` / `.lattice` filenames), the feedback
context — reads the one derived value.

## What the adversarial pass changed (HARD RULE #25)

The trio — red team, Munger inversion, independent checker — ran against the first
cut of this change and found defects severe enough that the design moved. Recorded
because the *shape* of the mistake is instructive: every one came from collapsing
"the deck's shelf name" and "the words on its cover" into a single fact, and then
letting a DISPLAY value flow into a WRITE.

| Found | Was | Now |
|---|---|---|
| Re-running a guided tour silently destroyed a kept deck — source, every checkpoint, chat, and comments, unconfirmed | the demo deduped by a **fixed deck id**, so renaming no longer lifted a deck out of the demo slot | dedupes by the stable creation **label** again; an explicit Rename moves that label, so renaming is once more how a newcomer protects the deck the tour left them |
| Rename permanently truncated a >60-char cover heading, and stripped its emphasis | the prompt prefilled with the display title and wrote that back | prefills and compares against `headingText` — the raw heading |
| Backup restore rewrote the restored deck's content three ways (markdown stripped, truncated mid-word, a lone surrogate on an astral character), and on a heading-less cover it rewrote a *body* slide | the `(restored)` marker was written into the copy's heading | the copy is stored **byte-faithful**; the marker is the `restored` display tag |
| Rename rewrote a heading inside an `<!-- HTML comment -->`, destroying an authored note and naming the deck something no slide said | comments were not skipped | `scanFirstHeading` skips comment spans as well as fences |
| CRLF (Windows-authored) decks derived no title at all — a regression against the old regex, which reintroduced the reported bug for that population | `.` does not match `\r`, so every heading line ended in one | the scanner strips the `\r` and the splice preserves it |
| A title containing a newline would inject markdown, including a `---` slide break | no sanitization | `retitleSource` flattens to one line |
| The pre-paint shell preferred a stale index label over the correct built-in title | index first | `derived` → the built-in's declared title → the creation label |

Two agents independently proposed a **`title:` front-matter override** — precedence
`title:` → first heading → label — as the design that would have made Rename additive
instead of a rewrite, and would let a deck carry a shelf name distinct from its cover.
`front-matter.ts` already has the machinery and `share-export.ts` already reads a
`title:` key. That is the right follow-up, and deliberately not this change: the ask
here was that the title *track the H1*, which this does, and the override is a
feature on top rather than a correction.

**Shipped as that follow-up:**
[`2026-07-29-deck-title-front-matter-override.md`](./2026-07-29-deck-title-front-matter-override.md).
`resolveTitle` now owns the precedence and carries *where* the title came from, so
Rename edits the override on a deck that has one and the heading on a deck that
doesn't.

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

**Known, pre-existing, NOT from this change** (both logged, not fixed here):

- Between roughly 768px and 1024px in the Build stop, the switcher pill's title is
  squeezed to zero width by the crowded header (#1249). Title length is not the
  cause: measured at 820px, a 26-char title, an 18-char title, and a **2-char**
  title all collapse to 0px, so the threshold is a property of the fixed control
  cluster, not of the name. (The 2-char measurement was added after review called
  the original two-point comparison unproven.)
- `demo.spec.ts`'s "REAL deck Inspector" spec fails on `origin/main` (#1250),
  confirmed by rebuilding and running the same spec against `origin/main`, this
  branch as first committed, and this branch with the fixes — red in all three.
  It is nightly-only, which is why the per-PR gate never showed it.
