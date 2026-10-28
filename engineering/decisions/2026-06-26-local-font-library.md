---
status: shipped
summary: The library self-hosts every text + KaTeX face (zero network); the Google-Fonts @import is gone. Colour emoji, first an opt-in tier, is now self-hosted as slices too (2026-10-26-fonts-policy.md)
---

# Local font library — zero network dependency

> **Superseded in part (2026-10-26):** the emoji font is no longer an opt-in 25 MB tier. It ships in `dist/` as 11 unicode-range
> woff2 slices (about 2 MB) and exports embed only what a deck uses; `npm run fonts:emoji` and the contents of
> `dist/lattice-emoji.css` are retired. See `2026-10-26-fonts-policy.md`. The text below is the 2026-06-26 record.

**Date:** 2026-06-26
**Status:** shipped
**Branch:** `claude/fonts-local-library-jk2cn8`
**Follows:** `2026-06-12-export-font-embedding.md` (the PDF-export embedding this
generalises to the whole library).

## The gap

Lattice already embedded fonts into *exported PDFs* (the emulator base64-injects
`assets/fonts/*.woff2`; the Drawing Board web-export inlines `data:` URIs). But
the **published library still reached for a CDN at render time:**

1. The engine CSS (`lib/base/base.tokens.css` → `dist/lattice.css`) carried a
   Google-Fonts `@import`. Every browser / marp-cli / runtime render fetched the
   17 text faces (Playfair, Outfit, JetBrains Mono, Caveat, Shantell) plus Noto
   Color Emoji from `fonts.googleapis.com` / `fonts.gstatic.com`.
2. KaTeX math glyphs were rewritten at build time to a pinned **jsDelivr** CDN
   (20 woff2, 296 KB).
3. The emulator HTML template injected a Google-Fonts `<link>` of its own.

A network-blocked or air-gapped consumer therefore got fallback type (or, for
math, unstyled glyphs). "Zero network dependency" was the goal.

## The decision

Self-host **everything the engine renders**, and make the zero-network property
a gated invariant. Two tiers, because one face is a special case:

- **Minimal (default, ships in the tarball, ~1 MB of woff2):** all real type —
  the 17 text faces + 20 KaTeX faces — vendored into `dist/fonts/` and referenced
  by stylesheet-relative `@font-face` (`url('fonts/<file>.woff2')`). Colour emoji
  falls back to the installed **system** emoji font (every stack lists
  Apple/Segoe/Noto — same as offline PDF export already did). Zero network for
  every deck a consumer normally renders.
- **Full (opt-in, for air-gapped corporate):** minimal **+** self-hosted Noto
  Color Emoji. At ~25 MB the font is impractical to force on every `npm install`,
  so it is **excluded from the tarball** and fetched on demand by
  `npm run fonts:emoji` (run once while online); the tiny, committed
  `dist/lattice-emoji.css` resolves it. Until fetched, the reference is inert and
  emoji use the system font.

Why a system-font fallback for emoji rather than always bundling it: 25 MB is
~15× the rest of the font payload combined, for glyphs most boardroom decks never
use. The split keeps the common case lean without abandoning the locked-down one.

## Mechanics

- **Canonical manifest** `lib/fonts/text-faces.js` (`TEXT_FACES`) is the single
  source of truth for the text faces. The emulator (`SELF_HOSTED_FACES`), the
  build's `@font-face` emitter, and the parity gate all consume it — no more
  three-hand-edited-lists-kept-in-lockstep (the old `2026-06-12` pain).
- **`tools/build-css.js`** emits the `@font-face` block from the manifest at the
  cascade slot the `@import` held, copies `assets/fonts/*.woff2` + the KaTeX
  package woff2 into `dist/fonts/`, rewrites KaTeX's `src` lists down to the local
  woff2, and writes `dist/lattice-emoji.css`. `--check` flags any `dist/fonts/`
  drift alongside the existing CSS-staleness check.
- **`tools/check-fonts.js`** is now a SOURCE-parity gate (it runs as a build
  preflight, before `dist/` regenerates): manifest ⟺ `assets/fonts/` ⟺ the
  web-export supply, **plus a CDN regression guard** — any reappearance of a
  `fonts.googleapis.com` / `fonts.gstatic.com` URL in the engine CSS or the
  shipped bundle fails the build. `dist/` freshness stays with `css:build --check`.
- **The emulator** reads the woff2 from `dist/fonts/` (shipped) with an
  `assets/fonts/` fallback, and no longer injects a Google `<link>`.

## Verification

- `grep` confirms zero `googleapis` / `gstatic` / `jsdelivr` URLs across all
  engine source and every `dist/` artifact; the gate now keeps it that way.
- `pdffonts` on a rendered deck shows the real Playfair / Outfit / JetBrains
  faces embedded (no Times/Helvetica fallback); a rasterised slide reads 10/10.
- Full build, `build:check`, `fonts:check`, lint, and the 2547-test unit suite
  pass.

## Scope / deferred

The **docs site** (`docs/src/styles/*.css`, `astro.config.mjs`) keeps its own
Google-Fonts `@import` + preconnects — it is a separate surface from the
published library and localising it needs a served `public/fonts/` path plus the
three-width screenshot gate. Tracked as a follow-up to keep this branch to one
concern (HARD RULE #17). The library itself — the thing npm consumers and every
render path load — is now zero-network.
