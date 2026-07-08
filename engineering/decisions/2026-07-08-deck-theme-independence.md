---
status: shipped
summary: The deck's own `theme:` front matter is always honored when previewing/exporting on the docs site; the website palette picker only styles the app chrome and un-themed decks. One shared resolver (docs/src/lib/deck-theme.ts) owns the precedence. Color mode stays a shared light/dark axis, except deck-wide (`class: dark`/`class: light`) and per-slide (`_class: dark`/`_class: light`, the new `light` mirroring `dark`) pins win over the site. `light` is a base modifier (not a universal variant) to avoid the divider.light collision; deckClassPropagate drops the deck-wide color-mode token from a slide that pins its own. Studio Inspector → Appearance becomes the deck's color mode (Match site / Light / Dark).
---

# Deck theme + color mode are independent of the website

**Status:** shipping · **Date:** 2026-07-08

## The complaint

> Changing the deck theme shouldn't change the website theme. Changing the website
> theme shouldn't change the deck theme. The deck has `theme:` front matter and that
> should always be respected. If the deck doesn't have a `theme:` then it can adopt
> the website theme. Color mode should be respected by the website and the deck —
> though the deck's ability to explicitly set slides (and the whole deck) to dark
> mode should be respected and not changed based on the website color mode.

## Root cause

The engine already does the right thing: `render(markdown, theme)` honors the deck's
own `theme:` directive **unless** an explicit theme is passed
(`lib/engine/index.js`: `if (theme) globalBase.theme = theme`).

But **every** docs preview surface read the site's `<html data-palette>` /
`data-mode` and passed the palette to the engine as that explicit override. So a
themed deck always rendered in whatever palette the website chrome happened to be
on, and flipping the website palette re-styled a deck that had pinned its own — the
deck palette and the website palette were fused into one global attribute. In the
Studio the same picker also re-tinted the whole app chrome, so the deck theme and
the website theme moved together in both directions.

## The model — two independent axes

**1. Palette.** Priority: the deck's `theme:` front matter → else the site palette.
- The prominent picker (topbar / Inspector) is the **website** theme: it tints the
  app chrome and any deck that declares no `theme:` of its own.
- A deck with `theme:` owns its palette — immune to the website picker; and the deck
  theme never touches the website chrome.

**2. Color mode (light/dark)** — a *shared* axis with explicit per-deck / per-slide
pins layered on top:
- Website light/dark (the topbar Sun/Moon, `data-mode`) is the shared default.
- **Deck-wide** pin: front matter `class: dark` / `class: light` (Studio Inspector
  → **Appearance**: Match site / Light / Dark). A pin is authoritative and ignores
  the site mode.
- **Per-slide** pin: `<!-- _class: dark -->` (existing) and the new mirror
  `<!-- _class: light -->`. A per-slide pin wins over the deck-wide one, so a bright
  slide can sit inside a dark deck and vice-versa.

There is deliberately no "pin light-only-theme" beyond the canvas: a themed deck's
*palette* is pinned while its *mode* still follows the site unless the deck pins that
too. The two axes are orthogonal — `theme: cuoio` in a dark site renders `cuoio-dark`;
`theme: cuoio-dark` (or `theme: cuoio` + `class: dark`) is dark everywhere.

## Implementation

- **`docs/src/lib/deck-theme.ts`** — one pure resolver, `resolveDeckTheme(source,
  {sitePalette, siteMode, isKnownTheme})` → `{palette, mode, pinnedDark, pinnedLight,
  fromDeck}`, plus `pinnedMode()`. Precedence lives in exactly one place; every
  surface calls it and maps the result onto its render inputs. An unknown/misspelled
  deck `theme:` falls back to the site palette (no 404 blanking the preview).
- **Preview surfaces** feed the resolver: the Playground (`playground-engine.ts`),
  the Studio compose preview + Present + slide-overview (`StudioShell.tsx` `preview`
  memo → `DeckPreview`/`PresentOverlay`/`SlideOverview` `paletteOverride` /
  `modeOverride` / `extraTheme`), and — via the same memo — the Share/export path so
  preview and export agree.
- **Per-slide / deck-wide light** — `section.light { color-scheme: light }`
  (`lib/base/base.modifiers.css`), the mirror of `section.dark`. `light` is a base
  modifier (`lib/authoring/lint.js` `BASE_MODIFIERS`), **not** a universal variant,
  so it stays clear of the pre-existing `divider.light` component variant (a manifest
  can't list a universal variant). `lib/core/color-mode.js` is the shared token list.
- **Propagation guard** — `deckClassPropagate` (`lib/integrations/markdown-it/
  plugins.js`) and its runtime mirror (`lib/runtime/index.js`) now drop the deck-wide
  color-mode token from a slide that pins its own, so `class: dark` + `_class: light`
  yields `class="light"`, never `dark light`.
- **Studio Inspector → Appearance** is now the deck's color mode (Match site / Light
  / Dark), writing the deck's `class:` tokens. The topbar Sun/Moon stays the website
  light/dark.

## Why not a dedicated `appearance:` directive

`class: dark` already meant deck-wide dark and already rendered everywhere (preview,
export, CLI). Reusing the `dark`/`light` canvas tokens at both deck (`class:`) and
slide (`_class:`) scope keeps **one** vocabulary and needs no new engine directive; a
separate `appearance:` key would be a second way to say the same thing plus new
plumbing. The Studio "Appearance" control gives it a first-class UI without a new
front-matter contract.

## Why `light` isn't a universal variant

`divider.light` is a long-standing, documented divider variant (the absorbed
`subtopic`). Making `light` a *universal variant* trips the "a manifest can't list a
universal" gate and would force dropping divider's documented bright variant — off-path
component surgery. As a base modifier, `light` is accepted on every component by the
linter, `divider.light` is untouched, and a bright divider simply *is* a light canvas.
