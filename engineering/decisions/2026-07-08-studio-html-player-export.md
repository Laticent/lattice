---
status: proposed
summary: >
  Bring the self-contained .html player to the Studio's Share sheet as a
  "Download as webpage" option — the app side of the download, distinct from the
  server-hosted lattice.style/deck/{id} track. buildPlayerHtml is Node-locked
  (fs images, jsdom sanitize, crypto sha256, subset-font wasm), so the plan
  extracts a pure lib/export/player-core.mjs with a dependency-injection seam
  (the sanitize-slide-html pattern): a Node adapter keeps the CLI byte-identical,
  a browser adapter assembles the player in the Studio from the in-browser
  PG.render output, pruning against the live preview iframe. Phased P1 (extract
  core + reroute CLI byte-identical) → P2 (Studio Share row) → P3 (notes/strip
  toggle).
---

# Studio “Download as webpage” — the HTML player, in the browser

**Follows:** `2026-07-07-html-lattice-player.md` (the player itself, shipped CLI-only across #798–#824)

## The gap

The self-contained `.html` player is exceptional — three views, full Present mode,
speaker notes with a privacy strip, ~0.4 MB pruned — but it is reachable **only from
the CLI** (`lattice-emulator deck.md out.pdf --player`). The Studio’s Share sheet
offers PDF, PPTX, Print, Markdown, Marp, `.lattice`, and a live **Present link** — but
**no “download this deck as a webpage.”** The original brief for this whole track was
two-sided — “one via export, one via the app, with synergy between Studio and Player”
— and only the export side landed. This doc plans the app side of the *download*
(distinct from the server-hosted `lattice.style/deck/{id}` track, which stays separate).

## Why it isn’t a one-line wire-up

`buildPlayerHtml` (`lib/export/html-player.js`) is **Node-locked**:

| Step | Node dependency | Browser equivalent |
|---|---|---|
| inline `file://` images | `fs.readFileSync` | already data-URI in the Studio render, or `fetch` |
| KaTeX CSS inline | `fs.readFileSync(require.resolve(...))` | fetch the shipped `katex.min.css`, or inline at build |
| sanitize slide DOM | `jsdom` + `dompurify` | the **real** `document`/`DOMParser` + DOMPurify (the docs shim already exists) |
| CSP `sha256` | `crypto.createHash` (sync) | `crypto.subtle.digest` (async) |
| font subset | `subset-font` (harfbuzz-wasm, optional) | harfbuzz **runs in-browser**, but `subset-font`’s Node deps are unproven there → treat as optional, same as the CLI |
| CSS prune | `css-tree` (has a `browser` field ✓) + Chromium `querySelector` in the emulator | `css-tree` in-browser + `querySelector` against the **live Studio preview iframe** |

Everything ELSE — the player CSS/JS templates, `minifyCss`, the lattice-doc envelope,
the component-aware prose projection, the assembly template, the keymap kernel — is
already pure and browser-safe.

## The design: one pure core, two adapters (the sanitizer seam, reused)

Extract the browser-safe assembly into **`lib/export/player-core.mjs`** — pure, DOM-
and fs-free, taking pre-rendered inputs and *injected* capabilities:

```
assemblePlayer({
  docHtml, css, fontCss, source, title, theme, config, notes,   // data
}, {
  sanitize,        // (html) => html          — DOMPurify-backed (host supplies the DOM)
  sha256,          // (str)  => Promise<b64>   — Node crypto | crypto.subtle
  inlineAssets?,   // (html) => { html, … }    — fs images (Node) | no-op (browser: already inline)
  katexCss?,       // () => string|null        — read (Node) | fetched (browser)
}) => Promise<{ html, report }>
```

This mirrors `lib/core/sanitize-slide-html.mjs` exactly: the LOGIC lives once, the
host injects the environment-specific pieces. Then:

- **`lib/export/html-player.js` (Node adapter)** — the current CLI path, rewritten to
  call `assemblePlayer` with Node capabilities. **Contract: byte-identical output** to
  today (a golden test pins it), so #811–#824 ship unchanged.
- **`docs/src/…` (browser adapter)** — a Studio module that calls `assemblePlayer` with
  browser capabilities, from the in-browser `PG.render(source)` output. Bundled for the
  Studio via a new **`tools/build-player-core.js`** (the established `build-*-core.js`
  esbuild pattern → a `.generated.js` the Studio imports).
- The **prune** (CSS + font) stays adapter-owned: the emulator prunes in Chromium; the
  Studio prunes against its **live preview iframe** (a real DOM already on the page).
  css-tree runs in both. Font subset is optional in both (graceful full-font fallback).

## Phasing (one feature = one branch → one PR each, HARD RULE #17)

- **P1 — extract `player-core`; reroute the CLI through it, byte-identical.** The
  enabling refactor. No user-visible change; a golden test asserts the CLI player is
  identical to pre-refactor for a representative deck. Maker-checker (frozen-artifact
  engine transform). *This is the risk-bearing slice — the whole point is that the CLI
  player does not move a byte.*
- **P2 — the Studio “Webpage (.html)” Share row.** Wire `assemblePlayer` + browser
  adapters into `share-export.ts`; a new Share-sheet row downloads the player from the
  live render. Prune against the preview iframe; subset if feasible, else full fonts.
  Verified on the real Studio (build docs + drive the download + open the file).
- **P3 — the notes/strip toggle in the Studio Export options.** Mirror `--strip-notes`
  as a Studio toggle (the ExportOptionsPanel already models per-export options), running
  the same `notes-core` scrub on the source before the envelope.

## Open questions (resolve during P2, not blocking P1)

1. **Font subset in-browser** — does `subset-font`/harfbuzz-wasm bundle + run in the
   Studio? If not, ship full (subset) fonts from the Studio (larger, still correct) and
   note it. *Not a P1 concern.*
2. **KaTeX CSS in the browser** — fetch the shipped `dist` copy vs. inline it into the
   player-core bundle. Lean: fetch on demand (only math decks pay).
3. **Prune cost in the Studio** — matching every selector against the live iframe is the
   same work the emulator does headlessly; measure it stays interactive (a spinner +
   the existing `onStatus` progress channel already exist in `share-export`).

## Non-goals

- The server-hosted `lattice.style/deck/{id}` player (Decision C) — its own track.
- Any change to the CLI player’s bytes (P1 is a pure refactor).
