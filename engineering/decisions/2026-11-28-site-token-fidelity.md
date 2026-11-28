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
   ink, its filled chip the mark under its on-mark. Card icon tiles take `--cat-N-mark` across all
   12 slots; aside hues map to the status family.
4. **The gate scores what ships.** `tools/check-shadcn-bridge-contrast.js` now asserts the
   destructive mapping and scores every new pairing on all 36 palette-modes (the tip aside
   included). It failed on the first aside tint below, before it shipped.

## Two numbers the gate chose

- **Card tile ground: a 6% OKLab wash of the mark, not `--cat-N-fill`.** The contract never pairs
  a mark on its own fill; measured, it falls to 1.51:1 there on the a11y palettes. A 6% wash holds
  3:1 on every slot (worst 3.06, concrete light). `main`'s `chart-catN` tiles, a 14% sRGB wash,
  fell to 2.91 (onyx dark, slot 4), so this also lifts every tile over 3:1.
- **Aside ground: a 4% wash.** The aside title is the status ink on that ground. At 12% it fell
  below 4.5:1 on 12 palette-modes (worst 4.0, concrete light); at 5% concrete light's blocked sits
  exactly on 4.50; 4% holds 4.54.

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
