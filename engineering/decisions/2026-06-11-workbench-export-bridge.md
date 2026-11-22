---
status: shipped
summary: Export bridge carrying Workbench library themes into the Drawing Board and through every export; components deferred
---

# Workbench export bridge — library themes reach the Drawing Board (themes slice)

> **Superseded in part (2026-11-16).** The Markdown export no longer embeds anything: it is the deck source, byte
> for byte (`2026-11-16-markdown-export-is-the-source.md`). Saved looks travel in the `.lattice` project file; the
> Marp bundle still carries them for Marp.


**Date:** 2026-06-11
**Status:** shipped (themes end-to-end; components deferred)
**Branch:** `claude/workbench-export-bridge`
**Follows:** `2026-06-09-drawing-board-asset-import.md` (the asset model),
`2026-06-10-design-studio-themes-layouts.md` (the two studios + the library).

## The gap this closes

The Workbench library (`lattice-workbench` IndexedDB, `assets` store) persists a
crafted theme, but the asset was an *island*: reusable only back in the Theme
Studio. A deck in the Drawing Board could not pick a library theme, and nothing
a library theme styled could leave the browser. The Faculty-2 PR named this the
deliberate next slice — the **export bridge**.

This slice carries **themes** the whole way: pick a library theme in the
Drawing Board → it registers with the in-browser engine and renders live →
its `theme:` directive persists in the deck source → every export carries the
palette. Components are the harder follow-on (a local component must vendor its
`styles.css` + class across all three render paths) and are out of scope here.

## Decisions

1. **Per-deck persistence rides the deck's `theme:` front matter — no DB schema
   change.** The Drawing Board already treats `theme:` as the single source of
   truth (`syncThemeControls` reads it; `applyTheme` writes it via
   `__dbConfig.writeFrontMatter`). A library theme is just another value that
   directive can hold. The only unlock needed: admit library theme names into
   the `PALETTES` vocabulary the propagation guards check. This beats a
   `deck.theme` column (no migration, and the choice travels with an exported
   `.md` for free).

2. **Markdown export is self-contained: embed the theme CSS as a Marp global
   `<style>` block, keep the `theme:<name>` directive.** A library theme is not
   in `marp.config.js` `themeSet`, so a bare directive renders palette-less for
   a CLI consumer (the `themeSet` gotcha). We keep the directive (so a Drawing
   Board re-import resolves the theme *by name*) AND inline the saved CSS — which
   already carries `@import 'lattice';` — as a global `<style>` right after the
   front matter. A lattice-configured `marp-cli` run then styles correctly off
   the embedded block even though the directive name is unknown to it (Marp warns
   and falls back, the `<style>` does the work). Idempotent in both consumers.

3. **PDF / PPTX / Print need no bridge code.** They rasterize the *live iframe
   DOM* (`html-to-image` / the browser print engine), which already has the
   library theme baked in once the apply side registers it. The bridge is purely
   (a) apply-side registration + (b) the Markdown embed.

4. **Single-file `light-dark()` themes need a forced canvas `color-scheme`.**
   Built-in palettes ship paired files (`indaco.css` + `indaco-dark.css`) and the
   preview swaps the whole `@theme` for dark. Studio-derived themes are one file
   using `light-dark()` pairs (see `serializeTheme`), so the iframe must force
   `:root{color-scheme:dark|light}` for them — the same trick the Theme Studio's
   own preview uses (`theme-studio.js writeFrame`). The Drawing Board's
   `writeFrame` gains a `forceScheme` flag, set only for library themes so
   built-in rendering is untouched.

## Where the code lands

- **`docs/src/playground/drawing-board-export.js`** — `embedThemeInMarkdown()`
  (pure, unit-tested) + `exportMarkdown(source, name, theme)`.
- **`docs/src/pages/drawing-board.astro`** —
  - a small module `<script>` loads `listAssets('theme')` → `window.__dbLibraryThemes`
    + a `db-library-themes` event;
  - the inline controller merges library names into `PALETTES` + the picker
    `<select>`, registers their CSS in `ensureThemes`, and forces the canvas
    scheme in `writeFrame` for library themes;
  - the export module resolves the active library theme and passes it to
    `exportMarkdown`.

## Not in this slice

- **Components.** Vendoring a local component's CSS + class into a deck across
  the marp-cli / emulator / runtime paths is its own design pass.
- **Editor autocomplete of library theme names** (the `theme:` completion still
  offers only built-ins) — the picker is the primary surface; low value, skipped.
- **A demo `.md`** — this is a web-UI feature, not a deck-authoring one;
  verified by screenshotting the running docs site, not a static deck.
