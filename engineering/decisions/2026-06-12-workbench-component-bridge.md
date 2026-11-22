---
status: shipped
summary: Bridge that carries CSS-only local Workbench components into live render and every export path on the Drawing Board
---

# Workbench component bridge — local components reach the Drawing Board (components slice)

> **Superseded in part (2026-11-16).** The Markdown export no longer embeds anything: it is the deck source, byte
> for byte (`2026-11-16-markdown-export-is-the-source.md`). Saved looks travel in the `.lattice` project file; the
> Marp bundle still carries them for Marp.


**Date:** 2026-06-12
**Status:** in progress
**Branch:** `claude/design-studio-themes-layouts-qadmgv`
**Follows:** `2026-06-11-workbench-export-bridge.md` (the themes slice — the pattern
this mirrors), `2026-06-10-design-studio-themes-layouts.md` (Faculty 2, the
`component` asset kind), `2026-06-09-drawing-board-asset-import.md` (the asset model).

## The gap this closes

The Layout Studio (`docs/src/playground/component-studio.js`) already authors a
CSS-only local **component** and persists it as a `kind:'component'` asset in the
Workbench library (`asset-store.js`; record shape from
`lib/layout/scaffold.js componentAsset`). But that asset is an *island*, exactly
as a library theme was before the themes export bridge (#193): a deck in the
Drawing Board cannot **use** a local component, and nothing it styles can
**leave the browser**. The themes slice named this the deferred follow-on —
"vendoring a local component's CSS + class across the marp-cli / emulator /
runtime paths is its own design pass." This note is that pass.

This slice carries **CSS-only components** the whole way: a saved component
renders live when a slide opts into its `_class` → the author discovers/inserts
it from the editor → every export vendors its CSS so the deck renders the
component across all three engine paths.

## What makes this *not* a copy of the themes bridge

A theme and a component differ on the axes that drive every decision:

| | Theme (#193) | Component (this slice) |
|---|---|---|
| Cardinality | **one** active per deck | **many**; any slide opts in |
| Declaration | `theme:` front matter (explicit) | `_class:` per slide (**implicit — detected**) |
| Live registration | one `@theme` via `addThemes`/themeSet | N scoped `<style>` blocks |
| Export | embed the one theme's CSS | embed **each referenced** component's CSS |
| Canvas scheme | needs `forceScheme` (single-file `light-dark()`) | none — palette-blind |
| Authoring surface | palette `<select>` | `_class` autocomplete + picker |

The load-bearing new primitive is **detection**: there is no directive that
declares "this deck uses `split-ledger`." You find it by scanning slide `_class:`
tokens against the library's component names. That one pure helper feeds **both**
live injection and export, so they cannot drift (the "share the check, never
duplicate it" discipline `lint-core.js` already follows).

## Decisions (confirmed 2026-06-12 round-trip)

1. **Injection + export are referenced-only.** Scan the source for `_class:`
   tokens that match a library component name; inject/vendor only those. Lean
   exports, deterministic, one scan drives both surfaces — and it matches how the
   engine ships only what a deck uses. (Rejected: inject-all — bloats every
   export with unused CSS and widens the collision surface.)

2. **Components ride the source as embedded `<style>`, for BOTH live and
   export.** A theme is a registered `@theme` (marp's `themeSet`), so #193 used
   `addThemes` for live and only embedded `<style>` on `.md` export. A component
   is **not** a theme — it is plain `.<name>`-scoped rules with no `@theme` block,
   so `themeSet` is the wrong mechanism. Instead the **same** pure
   `embedComponentsInMarkdown(source, components)` runs before `PG.render` in the
   live path *and* on `.md` export. Marpit hoists a markdown `<style>` into the
   packed CSS, so the block flows into `out.css` (live) and into the exported file
   (marp-cli). Consequence: **the deck source that renders live is the deck source
   that exports** — parity by construction, no Drawing-Board-only CSS path to drift
   from the engine (`CLAUDE.md` "three render paths must agree").

3. **PDF / PPTX / Print need no bridge code.** They rasterize the live iframe DOM
   (`drawing-board-export.js` `rasterizeSection`), which is already styled once the
   live path embeds the components. The bridge is purely (a) the live embed +
   (b) the `.md` embed — the same call in two places.

4. **Name collisions are blocked at save time.** The Layout Studio refuses a
   component name that collides with a shipped component class (the catalog is
   already on the page), and prompts a rename. This keeps the bridge collision-free
   by construction — no shadowing, no double-defined class on export. (Rejected:
   allow + local-wins — surprising, and export would double-define the selector.)

5. **Authoring UX is autocomplete + picker.** `_class:` completion learns local
   component names (marked *local*), and the Drawing Board's component picker gains
   a "local" group that inserts the saved skeleton (the asset carries `skeleton`).
   Local names merge into the page's `catalog` + `lintVocab` at runtime, parallel
   to how `__dbLibraryThemes` merges into `PALETTES`.

## Where the code lands

- **`lib/layout/bridge.js`** (NEW, pure, unit-tested) — `referencedComponents(source,
  names)` + `embedComponentsInMarkdown(source, components)` + `collidesWithShipped(
  name, shippedNames)`. Bundled into `layout-core.generated.js` (the same
  Node-tested core the studio runs), alongside `gate.js` / `scaffold.js` / `starters.js`.
- **`docs/src/playground/drawing-board-export.js`** — `exportMarkdown` gains a
  `components` arg; after the theme embed, it embeds the referenced components.
- **`docs/src/pages/drawing-board.astro`** —
  - a module `<script>` loads `listAssets('component')` → `window.__dbLibraryComponents`
    + a `db-library-components` event (mirrors the themes loader);
  - the live controller embeds referenced components before `PG.render` (via the
    pure helper) so `writeFrame` styles them;
  - the autocomplete catalog + `lintVocab.names` merge in local component names;
  - the export call resolves referenced library components and passes them.
- **`docs/src/playground/component-studio.js`** — `saveToLibrary` blocks a
  shipped-name collision via `collidesWithShipped`, surfacing a rename prompt.

## Not in this slice

- **Transform-bearing components.** Still graduation-only (no in-browser JS
  execution). CSS-only is the whole reason this bridge is parity-safe.
- **Lattice Pack interchange** (`.latticepack`) — its own slice (Faculty-2 phase 6).
- **Per-deck binding of a deleted local component** — degrade-visibly is inherited
  from the asset model; a missing local class simply renders unstyled (the engine's
  own default), which the author sees.
