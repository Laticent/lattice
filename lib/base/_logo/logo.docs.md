# logo

> Discreet author-supplied brand mark, top-right by default. One
> line for the file, one for the style, every theme.

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

Two front-matter lines: the file, and one line that styles it.

```yaml
---
marp: true
theme: indaco
logo: sample:logo-acme-mark.svg      # the file — a path, a URL, or a built-in name
logo-finish: bottom-center accent-ink lg   # optional — one word per axis, autocompleted
---
```

The logo shows on every slide whenever `logo:` is set. A slide hides it with `_class: no-logo`.

`logo-finish:` takes up to one word per axis, in any order (the register is
`lib/core/resolve-logo-finish.js`; the editor completes each word):

| Axis | Words (default first) | Behavior |
|---|---|---|
| placement | `top-right` `top-left` `top-center` `bottom-left` `bottom-center` `bottom-right` | The berth. **Naming one clears the chrome in that band**: a top berth hides the running header and the meta line, `bottom-left` and `bottom-center` hide the footer text, `bottom-right` hides the page number and the progress rail. The brand wins every collision, so there is nothing to de-collide. Writing no placement word keeps today's top-right mark beside the header; writing `top-right` explicitly clears the header too. |
| color | `auto` `accent` `ink` `muted` `canvas` `inverse` `brand` `accent-ink` `accent-canvas` `ink-canvas` | `auto` is the faint watermark that flips on a dark canvas. A palette role or a closed 50/50 blend paints the mark that color through a per-slide SVG filter (flood the color, keep the mark's own alpha), so the same word reads right in light and dark and under every finish. `brand` keeps the file's own colors with nothing behind them (use it for marks whose colors carry meaning: insignia, crests). A tinted mark is fully opaque. |
| plate | `no-plate` `plate` | `no-plate` is the default: nothing sits behind the mark, so a logo with a transparent background stays transparent. `plate` shows the file's own colors on a soft surface plate (the theme's `--bg-alt` at 70%, a light blur, a small radius and padding). Because the plate is the logo's own background, it overrides the watermark and tint filters, so it reads the same as `brand plate` on any color word. Turn it on for the deck (`logo-finish: brand plate`) or for one slide (`_class: logo-plate`), and take it back on one slide with `_class: logo-no-plate`. |
| size | `md` `sm` `lg` | `md` is the base size, `6.25cqi × 4cqi`; `sm` is 0.75× and `lg` 1.5×. |
| scope | `all` `title` | `title` shows the mark only on the deck's first slide and any slide using the `title` layout. A surface rendering ONE slide (the Studio's slice preview) must hand the engine that slide's deck position, or its lone section reads as the deck's first; see the note below. |

The words are class tokens on the section, so a slide can also change one axis for itself:
`_class: logo-ink` recolors the mark on that slide and leaves the deck's placement and size alone.
`no-logo` is the one switch most decks need.

**Migrating an old deck.** `logo-style:` (renamed `logo-finish:`, like `finish:` and `marks:`), `logo-on:`,
`logo-x:`, `logo-y:` and `logo-scale:` are retired and no longer render. `lint:deck --fix` (and the Studio's Fix all) folds them into one `logo-finish:` line and
deletes them: `logo-style: brand` becomes `logo-finish: brand plate`, `logo-on: title` becomes the `title` word, `logo-scale` becomes `sm` or `lg`, and a free
`logo-x`/`logo-y` position snaps to the nearest of the six berths (`50` / `82` is `bottom-center`).

**The `title` scope reads firstness from the DECK, not from the document.** A single-slide render
is its own document's first section, so until 2026-08-31 slicing slide 8 of a `logo-on: title` deck
painted the mark on it — the preview showed a logo the export would not (it was `logo-on: title` then; it is the `title` scope word now). `applyDeckLogoToHtml` now
takes the deck offset (the engine passes `page.offset`, the same value `svgA11yNames.applyToHtml`
already took) and only reads the document's first section as the deck's first when no offset says
otherwise. A whole-deck render supplies none and is unchanged. Found by the slice-equivalence sweep
as 25 of its 27 unattributed residuals (#1442); pinned in
`test/unit/parsing/markdown-it-plugins.test.js`.

**Which surfaces this reached** — measured on a production docs build, present mode's slide
overview: with the repair reverted every thumbnail carries the mark (5 `img.deck-logo` across the
frames); with it, one (the title thumbnail). A surface that renders ONE slide alone takes the slice route —
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
time, post-stamp; that call is gone — see below.) A change to `applyDeckLogoToHtml`'s
selection or tint injection must land in the runtime's `applyCachedDeckLogo` in the same commit
(HARD RULE #1). Both read the one `logo-finish:` register (`lib/core/resolve-logo-finish.js`).

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

Each path emits the `<img class="deck-logo">` as the section's first child. A slide whose final
class list carries a tint word (`logo-accent`, `logo-ink-canvas`, …) also gets a zero-size
`<svg class="deck-logo-tint">` holding that slide's filter, and `--deck-logo-filter` /
`--deck-logo-opacity` inline **on the `<section>`, not on the img**, so they beat the canvas flip.
Placement, size and the stand-down of header, footer and page number are pure CSS on the section's
`logo-*` classes (`base.modifiers.css`). The runtime builds the svg with DOM calls, not markup
(HARD RULE #22).

CSS lives at `lib/base/base.modifiers.css` — the `img.deck-logo` selector plus the
dark-canvas brightness flip. The flip is carried by `--deck-logo-filter` /
`--deck-logo-opacity`, set beside the `color-scheme: dark` of whichever rule makes the
canvas dark, with the light-canvas values as the `var()` fallback. A theme overrides the
inverted pair at `:root` via `--deck-logo-filter-inverse` / `--deck-logo-opacity-inverse`.

## Gotchas

- **marp-vscode preview pane shows nothing.** The extension does NOT
  run the engine's plugins, so the `logo:` directive
  is invisible there. The PDF build and the desktop preview both work.
  See `engineering/gotchas.md`.
- **The placement properties live on the SECTION, not on the img.** Custom properties
  inherit downward only, so a value in the img's own `style` attribute is invisible to
  every sibling and every section-level rule. That invisibility was a real defect once
  (#1404: the overflow/legibility marker stack could not tell a logo was in the corner,
  and a `confidential` slide's clip tab sliced the mark). Those markers are one capsule
  berthed at the slide's bottom edge now, reserving nothing for the logo (2026-09-08), so nothing reads
  these properties today except the img itself, by inheritance — but the reason to keep
  them addressable outlives the reserve that prompted it, and moving them back is a
  one-way door.
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

The sample asset `sample:logo-acme-mark.svg` in this folder is what the demo
deck points at; substitute your own SVG / PNG for production decks.
