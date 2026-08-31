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
| `logo:` | image path or URL | **Required to activate.** A relative path resolves against the deck source (but see the output-directory gotcha below). An absolute `https://`, protocol-relative `//` or `data:` value is used verbatim and works cross-origin — nothing in the engine, the sanitizer or the docs site filters it. A site-relative `/mark.svg` is re-based onto the render's asset origin on the web-preview path (`resolveInlineImageSrcs`), which on the shipped Studio is the page's own origin. SVG and PNG both work. |
| `logo-style:` | `auto` (default), `brand` | `auto` → faint grayscale watermark, brightness-inverted on dark canvases. `brand` → original colors on a soft surface plate. Use `brand` only for marks whose colors carry meaning (government insignia, university crests). |
| `logo-on:` | `all` (default), `title` | `all` → logo on every slide. `title` → only on the title slide — meaning the deck's first slide, or any slide carrying the `title` class. A surface rendering ONE slide (the Studio's slice preview) must hand the engine that slide's deck position, or its lone section reads as the deck's first and the mark is painted on a slide the export does not carry it on; see the note below the table. |
| `logo-x:` | `0`–`100` | The mark's **center**, as a percentage of the slide width. Unset → the mark hugs the top-right corner at the frame inset. Setting either axis switches the mark from corner-hugging to centered-on-its-point. |
| `logo-y:` | `0`–`100` | The same, vertically. `logo-y: 82` puts the mark's center 82% of the way down the slide — a common placement for a title-slide watermark under the lede. |
| `logo-scale:` | multiplier, default `1` | Scales the mark. The base size is `6.25cqi × 4cqi`, so the mark stays resolution-independent at any scale. |

**`logo-on: title` reads firstness from the DECK, not from the document.** A single-slide render
is its own document's first section, so until 2026-08-31 slicing slide 8 of a `logo-on: title` deck
painted the mark on it — the preview showed a logo the export would not. `applyDeckLogoToHtml` now
takes the deck offset (the engine passes `page.offset`, the same value `svgA11yNames.applyToHtml`
already took) and only reads the document's first section as the deck's first when no offset says
otherwise. A whole-deck render supplies none and is unchanged. Found by the slice-equivalence sweep
as 25 of its 27 unattributed residuals (#1442); pinned in
`test/unit/parsing/markdown-it-plugins.test.js`.

**Which surfaces this reached.** A surface that renders ONE slide alone takes the slice route —
the slide-overview grid, a deck thumbnail, anything passing `slideMarkdown` to
`single-slide-render`. The Studio's MAIN preview does not: it renders the whole deck and narrows
to one section, so firstness there was always the deck's and it never showed the mark.

**The repair reaches exactly as far as the position does.** The slice route asks
`supplyablePosition`, whose fail-closed guard declines when it cannot prove which slide is
being shown — a `_focusSteps` deck, a slide count that disagrees with the render, a `---`
inside an HTML comment. There the engine receives no offset and reads firstness from the
document again, so the mark still paints. Those decks are the sweep's own tracked
`refusals`, so the gap is counted rather than silent, but it is a gap: closing it needs a
caller that can say "this is a slice" WITHOUT being able to say which one.

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
| engine (HTML) — CLI, emulator, Studio, playground | `applyDeckLogoToHtml` | `lib/integrations/markdown-it/plugins.js` |
| browser (a document the engine did not inject into) | `applyDeckLogoFromFrontMatter` | `lattice-runtime.js` |

There are **two** implementations, and the emulator is not one of them: it renders
through `lib/engine`, which runs the engine's pass, so only the runtime is a genuine
mirror and only it can drift. (The emulator used to re-run the engine's pass a second
time, post-stamp; that call is gone — see below.) A change to `deckLogoVars` or
`deckLogoInCorner` must land in the runtime's `applyLogoPlacement` in the same commit
(HARD RULE #1).

**Until 2026-08-16 the engine row of that table was a claim, not a behavior** (#1652).
`applyDeckLogoToHtml` selected slides by `data-lattice-slide` — an attribute only the
Marp/emulator re-tag writes, and one the owned `lib/engine` never emits — so on the
canonical render path the function matched nothing and returned its input unchanged.
Every export still showed a logo, which is why it went unnoticed for so long: there the
emulator re-ran the pass after stamping the attribute. On a browser surface nothing
stamps it, there is no baked front-matter block and no `.md` URL for the runtime mirror
to fetch, so both injectors no-oped — and the Studio, the playground and every live
preview showed no logo at all, for any value. It now selects slides with
`splitSections`, the shared depth-aware walker the marker berths and the
progress/watermark Tiles already use at that stage, so ONE pass inside `engine.render`
serves every render path and the emulator's second call is gone.

**The mark is the section's first child, and that is load-bearing for the injectors, not
for the CSS.** `applyDeckLogoToHtml` therefore runs LAST of the section-level chrome
injectors — after `applyImageStructure` (which would otherwise fold the mark into
`.image-text`) and after `applyBackdropToHtml` (whose finish wrapper would otherwise sit
in front of it). The first draft of this change ran it first and identified "already has
a mark" by position, which on a `finish` slide is exactly where the backdrop wrapper
lands: the emulator's second pass looked, saw a backdrop, and stacked a SECOND logo at
~0.70 composite opacity on three of the six committed decks that use `logo:`. Both
guards are position-independent now, and `test/fixtures/deck-logo.md` carries a finish
slide so the parity test counts marks instead of only looking at the front.

Exports are unchanged, measured rather than argued: all five committed logo decks
(`finish-backdrops`, `marp-export-fidelity`, `frame-chrome-and-notes`, `marker-corner`,
`logo.gallery`) render **0 changed pixels** against a fresh `main` render, page by page.

Each path emits two things: the `<img class="deck-logo">` as the section's first
child, and — **on the `<section>`, not on the img** — the `--logo-*` placement
properties plus `data-logo-corner` when the mark has not been repositioned.

CSS lives at `lib/base/base.modifiers.css` — the `img.deck-logo` selector plus the
dark-canvas brightness flip.

## Gotchas

- **marp-vscode preview pane shows nothing.** The extension does NOT
  run the engine's plugins, so the `logo:` directive
  is invisible there. The PDF build and the desktop preview both work.
  See `engineering/gotchas.md`.
- **The placement properties live on the SECTION, and moving them back would be a
  silent regression.** Custom properties inherit downward only. While `--logo-scale`
  and friends sat in the img's own `style` attribute, no sibling and no section-level
  rule could read them — so the overflow/legibility marker stack had no way to know a
  logo was in the corner, and a `confidential` slide's clip tab landed on top of the
  mark and sliced it (#1404). The tabs now reserve the logo's width through
  `--corner-logo-reserve`, which reads `--logo-scale` off the section. Putting these
  back on the img would compute the reserve as if every logo were unscaled.
- **A relative `logo:` resolves against the OUTPUT directory, not the deck** (#1406).
  Rendering `examples/x.md` to `examples/x.pdf` works; rendering it anywhere else
  silently leaves a broken `<img>` with only a stderr warning. Use an absolute path in
  any harness that renders to a scratch directory.
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
