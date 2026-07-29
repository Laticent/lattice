---
status: shipped
summary: The follow-up recorded by 2026-07-29-deck-title-is-its-heading, and proposed independently by two lenses of that change's adversarial trio — a `title:` front-matter override, precedence `title:` → first heading → creation label. The heading rule is right up to the point where a deck's shelf name and its cover are different facts ("Board pack — Q4 FY26 (final)" belongs in the switcher and the export filename, not in 90pt on the title slide); without an override the only way to name the deck was to write that name onto the slide. `resolveTitle(source)` becomes the one resolver, returning the raw winning title PLUS where it came from, and `titleFromSource` / `retitleSource` / the pre-paint mirror are all rebuilt on it, so every surface inherits the precedence with no per-call-site change. The load-bearing detail is that `from` is carried, not just the text: Rename edits WHATEVER DETERMINES the title (the `title:` line on an override deck, the heading otherwise) because rewriting the heading on an override deck would appear to do nothing, and display normalization differs between the two (markdown is stripped from a heading, which is rendered markdown, and never from a front-matter scalar, where the characters are literal). `title:` is not a new key — share-export already read it for the HTML `<title>` and the `.lattice` manifest — so this makes one existing directive authoritative rather than adding a second home for the name; the knock-on is that an override deck's exported HTML `<title>` now says the override where it used to say the heading.
---

# A deck's shelf name: the `title:` front-matter override

**Date:** 2026-07-29 · **Status:** shipped · **Area:** docs-site Studio
(`docs/src/components/studio/studio-store.ts`, `StudioShell.tsx`)

## Why, when the heading rule just shipped

[The heading rule](./2026-07-29-deck-title-is-its-heading.md) closed a real bug:
a deck stayed "Untitled deck" in the switcher no matter what you typed into it,
because its name lived in a stored label that nothing kept in step. Deriving the
name from the deck's own first heading deleted the second source of truth.

It also collapsed a distinction that turns out to be real. Two of that change's
three adversarial lenses independently proposed the override, and the reason they
gave is the reason it ships now: **a deck's shelf name and the words on its cover
are not always the same fact.**

> "Board pack — Q4 FY26 (final)" is the right name in the switcher, in ⌘K, and on
> the exported file. It is the wrong thing to set in 90pt across the title slide,
> which should say "Q4".

Under the heading rule the only way to get the first was to write it onto the
slide and accept the second. The override is the missing half.

## The rule

**Precedence: `title:` front matter → the first heading → the deck's creation
label.** One resolver owns it:

```ts
resolveTitle(source): { text: string; from: 'front-matter' | 'heading' } | null
```

`titleFromSource` (display), `retitleSource` (Rename's write), and the pre-paint
mirror are all rebuilt on top of it, so every surface that names a deck — the
switcher, the header, ⌘K, Share, the `.md` / `.pdf` / `.lattice` filenames, the
backup's per-deck filenames, `studio.astro`'s pre-hydration shell — inherits the
precedence without a single per-call-site change.

### Carrying `from` is the load-bearing part

Returning just the text would have been enough for display and wrong everywhere
else. Two behaviors depend on knowing *where* the title came from:

- **Rename edits whatever DETERMINES the title.** On a deck carrying `title:`,
  Rename rewrites the `title:` line and leaves the cover slide alone; on any other
  deck it rewrites the first heading, as before. Rewriting the heading on an
  override deck would appear to the author to do nothing at all — the switcher
  would not move, because the override still wins. The prompt also names its
  target ("this rewrites its `title:` front matter, not the cover slide"), so a
  deck whose shelf name is deliberately not its cover doesn't look like Rename is
  aimed at the slide. It never *creates* an override on a deck that had none:
  renaming a plain deck must not silently grow front matter.
- **Display normalization differs.** A heading is rendered markdown, so
  `# **Q4** Wrap` must list as "Q4 Wrap" — the strip is correct there. A
  front-matter title is a plain YAML scalar that nothing renders, so the same
  strip would eat the literal characters of a name the author typed, turning
  `Q4_final` into `Q4final`. The 60-char display cap still applies to both; the
  raw value is never capped, because Rename writes it back.

### Not a new key

`title:` was already read by `share-export` — for the exported HTML's `<title>`
and the `.lattice` manifest's provenance — as a fallback behind the passed-in deck
title, which meant it almost never won. This change makes that one existing
directive authoritative rather than inventing a second home for the name, which is
the same instinct the heading rule was built on: one fact, one home.

**Knock-on worth naming:** for a deck that carries `title:`, the exported HTML's
`<title>` now says the override where it previously said the cover heading. That
is the intended resolution of a key that was previously almost dead, but it *is* a
change in exported bytes for that population, and it was shown and signed off
rather than slipped in.

## Edges that decide behavior

| Case | Behavior | Why |
|---|---|---|
| `title:` with an empty or whitespace value | ignored; falls through to the heading | a stray key must not blank a deck that has a perfectly good heading |
| a title with `"` or `\` | round-trips losslessly through `setFrontMatter`'s quote/escape and back | without a real round-trip the backslashes compound on every rename (`front-matter.ts` documents this) |
| a multi-line title | flattened to one line | in a heading a newline injects markdown (including a `---` slide break); in front matter it breaks out of the block entirely |
| `title:` nested under another key (e.g. `finish-override:`) | not seen as the deck title | `parseFm` captures nested blocks verbatim and never flattens their children into scalars |
| a deck with neither override nor heading | Rename falls back to the stored label | unchanged from the heading rule |
| the built-in decks | unaffected — none carries `title:` | the drift test pinning each built-in's declared title to its heading still holds |

## Verified

Driven on the **real built Studio** (`astro build` + `astro preview` + real
Chromium), not a harness — ten checks, all passing:

- the switcher pill reads the override while the rendered cover slide still reads
  `Q4`;
- a **reload** paints the override in the pre-hydration shell (no flash of the
  cover heading it was set to replace);
- Rename's prompt names the front matter and prefills the **raw** override; the
  saved source afterward carries the rewritten `title:` with `# Q4` untouched;
- a deck with **no** override still renames its heading, and grows no front matter.

Screenshotted at 1440 / 820 / 390. The unit assertions were **mutation-tested** —
dropping the precedence, the empty-value guard, the strip split, and the
front-matter write branch each kill tests (6 / 1 / 1 / 3 respectively), so none of
them passes vacuously.

**Known, pre-existing, NOT from this change:** at 820px the switcher pill is
squeezed to zero width by the crowded header (#1249) — visible in the 820
screenshot, and unrelated to title length (a 2-char title collapses identically,
measured in the prior change).
