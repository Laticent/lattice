---
status: in-progress
summary: >
  The docs site, the Playground and the Studio chrome now paint from the deck themes' own tokens.
  The generated site sheet emitted a hand-kept list of 22 tokens that stopped growing in July, so
  the site read `--text-secondary`, `--cat-N-mark`, `--spectrum-end` and `--warn-bg` and fell back
  on every one, and invented its own reds, greens and ambers where every theme already curates a
  status. The sheet now emits whole families (five-kind status triplets, the 12-slot categorical
  contract, the text tiers, the spectrum end), generates the first-paint fallback, the on-dark ramp
  and the font stacks from the theme and the engine base, and the bridge contrast gate scores every
  pairing the site paints. The site keeps the engine's faces but not its `--fs-*` sizes, which are
  slide-relative.
---

# The site paints from the deck themes' tokens

**2026-11-28 · branch `fix/site-theme-token-fidelity`**

## The defect

`tools/build-landing-tokens.js` writes `docs/src/styles/lattice-tokens.generated.css` from
`paletteCss()` in `tools/build-docs-portal.js`. It resolved every theme in full and then emitted
only `PORTAL_TOKENS`, a hand-kept list of 22 names (plus `--spectrum` and two derived tiers). It now
holds 79, built by family. The themes grew
five-kind status, status triplets, the 12-slot categorical contract and the text tiers after that
list last grew, and none of it reached the site. Three consequences, all measured on `main`:

- **Silent fallbacks.** Site code read tokens the sheet never emitted: `--text-secondary` (the
  Studio headline catalog), `--cat-2-mark` … `--cat-12-mark` (the motion and Anima tools),
  `--spectrum-end`, `--spectrum-solid`, `--spectrum-vertical` (the spectrum catalogs) and
  `--warn-bg` (two library pages). Each fell back to something else.
- **Invented colors.** The site drew its own danger ramp (`--lx-ui-destructive`, one red per mode
  for all 18 palettes), a derived `--{pass,warn,fail}-fill` tier no theme declares, a hex red in
  `IntentTag`, and the stock green/amber/red hexes in four diagnostic overlays and the print
  panel. Starlight's asides kept Starlight's fixed hues, and the header's GitHub glyph
  fell to the browser's link blue in the docs zone.
- **Stale copies.** The first-paint fallback was typed by hand, twice, as indaco when the default
  is cuoio, with an indaco `--border` the theme no longer ships. The font stacks were typed three
  times and had lost the engine's emoji fallbacks.

## What changed

1. **Whole families, not names.** `PORTAL_TOKENS` now builds each family from its contract:
   `{pass,warn,fail,info,mute}` × `{ink, -mark, -on-mark}` (2026-10-24, 2026-11-16), the three
   `-bg` row tints, `cat-1..12` × `{fill, mark, ink}` plus `cat-on-fill` / `cat-on-mark`
   (2026-07-15), `text-secondary` / `-label` / `-display` and `spectrum-end`. `spectrum-solid` and
   `spectrum-vertical` are optional: emitted where a palette declares them. All 18 palettes
   resolve every family (the a11y palettes through onyx).
2. **Generated, not typed.** The sheet also emits, on bare `:root`: the site default palette
   (`DEFAULT_PALETTE` in `docs/src/lib/site-chrome.ts`) as the first-paint fallback in both faces;
   the engine's `--on-dark-*` ramp; and the engine's font stacks with the site's metric fallback
   face after each lead face. `landing.css`, `lattice.css` and `tailwind.css` declare none of them.
3. **Each surface consumes the tier the contract names.** Destructive is `--fail` (ink),
   `--fail-mark` under `--fail-on-mark` (pill). The derived `-fill` tier is retired: its five
   readers (the Architect stop button, two verdict-chip overlays, the chrome badge) now draw the
   theme's own pill, which follows the mode as a deck's does. A rating dot is a status mark, its words the status
   ink, its filled chip the mark under its on-mark. Card icon tiles are each slot's category chip
   across all 12 slots; aside hues map to the status family, on `--bg-alt`.
4. **The gate scores what ships.** `tools/check-shadcn-bridge-contrast.js` now asserts the
   destructive mapping and scores every new pairing on all 36 palette-modes (the tip aside
   included). It failed on the first aside wash, before it shipped.

## Two grounds the renders chose

Both were first drawn as washes the gate could score, then changed after looking at the real pages
(the PR's before/after renders: cuoio, indaco, concrete and a11y-deuteranopia, both faces):

- **Card icon tile: the theme's category chip.** The first cut drew the glyph and rim in
  `--cat-N-mark` over a 6% wash. On a dark face the themes put the hue in `-fill` and make the mark
  pale (indaco slot 1: fill `#006398`, mark `#D4DFE8`), so every tile glyph went white and the cards
  lost the per-card color `main` had. The tile is now the contract's own pairing: the slot's fill as
  the ground, `--cat-on-fill` as the glyph (AA on every fill, worst 4.88, concrete dark), and the
  mark as the rim, which holds 3:1 against the canvas where a pale light fill alone can sit at 1.06:1
  (atelier slot 11). The contract never pairs a mark on its own fill (1.51:1 on the a11y palettes).
  `main`'s `chart-catN` tiles, a 14% sRGB wash, fell to 2.91 (onyx dark, slot 4).
- **Aside ground: `--bg-alt`.** The aside title is the status ink, so a status wash had to stay
  faint to hold AA: at 12% it fell below 4.5:1 on 12 palette-modes (worst 4.0, concrete light), and
  at 4% it held AA (4.54) but barely set the aside off the page. The palette's card surface does
  both, and every status ink is gated AA on it. Before this change every aside was Starlight's
  lavender or navy on every palette, and on a11y-deuteranopia dark its body text was dark on navy.

## Typography: faces yes, sizes no

The site now shares the engine's faces and its `--font-label` seam. It does not adopt the `--fs-*`
scale: every `--fs-*` token is declared in `cqi` against the slide container
(`engineering/typography.md` §1), so on page chrome it would size against the browser window.

## Cost

The generated sheet grows from 4.9 KB to 13.6 KB gzipped (26 KB to 79 KB raw). It is a
render-blocking stylesheet on every page. Not benched: this change has no performance intent, so
the size is recorded here as its cost, and the post-build route budget
(`docs/scripts/check-route-budget.mjs`) still has to pass.

## Not changed

- The Studio keeps its own palette picker (`lattice-studio-palette`), by the owner's decision. It
  already stamps `<html data-palette>`, so the Studio chrome picks up every family from the same sheet.
- `--chart-catN` stays: it is the chart family's own 8-hue contract, and the shadcn chart colors
  map onto it correctly.
- The `pages/libraries/*` and `pages/proto/*` pages declare their own local palettes; not audited.
- The ~80 `var(--accent,#006fa8)`-style inline fallbacks in `ComposeView.tsx` can no longer fire
  (the generated `:root` defines every token), so they are inert. They are not removed here.
