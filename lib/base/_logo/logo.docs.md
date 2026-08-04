# logo

> Discreet author-supplied brand mark in the top-right corner. One
> line of front matter, every theme.

**Feature tier** base / chrome — applies to every layout that has slide chrome.

## When to use

- **Boardroom or pitch decks** where the company brand needs to be
  visible without dominating. The mark renders as a faint grayscale
  watermark, brightness-inverted on dark canvases so it stays legible
  on title / divider / closing / `.dark` slides too.
- **Multi-stakeholder briefings** where the logo signals authorship
  without per-slide repetition.

## When NOT to use

- **Single-slide quick decks** that don't need brand attribution.
- **Decks where the logo MUST be the visual focus** — this feature
  produces a watermark, not a hero. For a brand-forward title slide,
  use the `title` component with a visual treatment instead.

## Authoring

Six front-matter directives — one required, five optional:

```yaml
---
marp: true
theme: indaco
logo: ./acme-logo.svg            # required — path to the image, relative to the deck
logo-style: auto | brand         # optional, default `auto`
logo-on: all | title             # optional, default `all`
logo-x: 50                       # optional — 0–100, the mark's CENTER as a % of the slide
logo-y: 82                       # optional — 0–100, ditto, vertically
logo-scale: 1.0                  # optional — size multiplier, default 1
---
```

| Directive | Values | Behavior |
|---|---|---|
| `logo:` | image path | **Required to activate.** Path is resolved relative to the deck source. SVG and PNG both work. |
| `logo-style:` | `auto` (default), `brand` | `auto` → faint grayscale watermark, brightness-inverted on dark canvases. `brand` → original colors on a soft surface plate. Use `brand` only for marks whose colors carry meaning (government insignia, university crests). |
| `logo-on:` | `all` (default), `title` | `all` → logo on every slide. `title` → only on the title slide. |
| `logo-x:` | `0`–`100` | The mark's **center**, as a percentage of the slide width. Unset → the mark hugs the top-right corner at the frame inset. Setting either axis switches the mark from corner-hugging to centered-on-its-point. |
| `logo-y:` | `0`–`100` | The same, vertically. `logo-y: 82` puts the mark's center 82% of the way down the slide — a common placement for a title-slide watermark under the lede. |
| `logo-scale:` | multiplier, default `1` | Scales the mark. The base size is `6.25cqi × 4cqi`, so the mark stays resolution-independent at any scale. |

**These three were undocumented until 2026-08-04**, and for their whole life they did not
work on any deck carrying a `finish:` — a slide-level stacking rule dragged the mark into
the content flow, so `top`/`left` re-based onto its flow position and `logo-x`/`logo-y`
described a placement the render did not produce. Every deck in the corpus that used them
also used a finish, so no shipped deck had ever rendered them correctly. Fixed, and gated
by `test/integration/invariants/frame-chrome-out-of-flow.test.js`; see
`engineering/decisions/2026-08-04-finish-stacking-displaces-frame-chrome.md`.

## How it works

A build-stage rewriter parses the `logo:` front matter and injects
`<img class="deck-logo" src="…" alt="" aria-hidden="true">` as the
first child of every selected `<section>`. CSS positions it
absolutely top-right and applies a `grayscale + brightness` filter
chain. Brightness inverts on dark canvases via the same modifier
rules that switch text colors.

Real DOM (not `::before`) is what lets the logo compose with
`::before`-based chrome like `mark-orbit`, `mark-asterisks`, and the
`tint-*` treatments. An earlier iteration used `::before` and
collided with those treatments; the current implementation is
collision-free across every modifier.

## Implementation

Three render paths, one contract:

| Path | Parser | Location |
|---|---|---|
| engine (HTML) | `applyDeckLogoToHtml` | `lib/engine` |
| lattice-emulator | inline implementation, same shape | `lattice-emulator.js:1809` |
| browser (preview pane) | `applyDeckLogoFromFrontMatter` | `lattice-runtime.js` |

CSS lives at `lib/base/base.modifiers.css` — the `img.deck-logo` selector plus the
dark-canvas brightness flip.

## Gotchas

- **marp-vscode preview pane shows nothing.** The extension does NOT
  run the engine's plugins, so the `logo:` directive
  is invisible there. The PDF build and the desktop preview both work.
  See `engineering/gotchas.md`.
- **Don't use `mask-image` for the same effect.** Chromium blocks
  `file://` URLs as mask sources (treats them as cross-origin) even
  though the same URL works as `<img src>`. The current filter-based
  approach is renderer-portable. See gotchas.md.

## Demo deck

See [logo.gallery.light.pdf](./logo.gallery.light.pdf) for rendered
examples — title slide, layered backgrounds, mark composition, brand
vs. auto styles. Dark sibling at
[logo.gallery.dark.pdf](./logo.gallery.dark.pdf).

The sample asset `acme-logo.svg` in this folder is what the demo
deck points at; substitute your own SVG / PNG for production decks.
