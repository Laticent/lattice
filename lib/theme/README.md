# `lib/theme/` — the Theme Studio deterministic core

The pure, model-free engine behind the Studio's **Theme** faculty (Fabricate,
of `engineering/decisions/2026-06-10-design-studio-themes-layouts.md`). It turns
a small author-facing **essential set** into a complete, **contrast-clean**
Lattice palette, and proves it against the same WCAG predicate the shipped
palette gate asserts.

No `fs`, no dependencies, CommonJS — it bundles for the browser exactly like
`lib/authoring/lint-core.js`, so the same code runs in the Studio UI and in
Node tooling. **No model is required to run any of this** (the model, once
wired, only ever proposes an *essential set*; this core disposes).

## Modules

| File | What it is |
| --- | --- |
| `color.js` | Colour math. WCAG sRGB luminance + `contrastRatio` (the **exact** functions `test/unit/palette/contrast.test.js` asserts with — extracted here, shared not duplicated) **plus** OKLCH ↔ sRGB for perceptual lightness/hue control and contrast-aware repair (`ensureContrast`, `pickInk`, `mix`). |
| `contrast.js` | The contrast **meter / auditor**. Runs the gate's pair checks over an in-memory token map (`auditVars`, `auditBoth`), resolving `light-dark()`/`var()` per mode. `meter(fg, bg)` is the live reading the UI paints. |
| `derive.js` | The **derivation**. `deriveTheme(essentials)` → full token map, repaired to clear AA in both canvas modes for every gate-checked pair. Exports the essential-set + required-token contracts. |
| `serialize.js` | `serializeTheme(map, {name})` → droppable `themes/<name>.css` text (the `@theme` directive, `@import 'lattice'`, grouped `:root` blocks). |
| `starters.js` | A small seed library of essential sets ("on the floor") so the loop runs with no model. |

## The essential set

```js
{
  bg, bgAlt,                          // light surfaces
  textHeading, textBody, textMuted,   // ink trio
  accent, accentSoft,                 // brand
  pass, warn, fail,                   // semantic signals
}
```

## The loop

```js
const { deriveTheme }    = require('./derive.js');
const { serializeTheme } = require('./serialize.js');
const { auditBoth }      = require('./contrast.js');
const { getStarter }     = require('./starters.js');

const s   = getStarter('dusk');
const map = deriveTheme(s.essentials);     // full, contrast-clean token map
auditBoth(map).ok;                          // true — passes the gate's pairs, both modes
const css = serializeTheme(map, { name: s.name, label: s.label });
// → drop css into themes/dusk.css, or PG.addThemes([css]) for live preview
```

## What this covers — and what's next

**Covered (the contrast-critical + most-seen contract):** surfaces, the ink
ramp, accent containers (with computed `on-accent`), semantic signals, the
dark-variant band, the 12-slot categorical cycle (pale/deep tiers on the
lightness contract, hue-spread around the accent), `c-ink-*`, structural
strokes, the alarm fill, highlight.js syntax, and the chart-family spectrums.
Every pair the shipped gate asserts is repaired to AA in both modes — see
`test/unit/palette/theme-derive.test.js`.

**Deliberately deferred (need a render session to verify visually):**

1. **The Studio UI + live preview.** Wiring `deriveTheme` to the editing
   surface and `PG.addThemes([cssText])` so an author *sees the style in
   action*. Pure logic is done; the browser surface is the next slice and must
   be checked visually (per CLAUDE.md "when you can't see the result").
2. **The theme-asset bridge.** Emitting a `kind:'theme'` asset into the
   Drawing Board store (asset note shape) and the export/graduation paths.
3. **Full shipped-theme parity for graduation.** The purely-*decorative*
   extras a hand-tuned theme like `cuoio.css` adds on top of the contract
   (`--spectrum`, `--code-inline-fg`, `--on-dark-*` tiers, Marp chrome
   mappings, `--c-container`/`--c-subcontainer`). A generated theme renders
   today because these fall through to `lattice.css`/`base.tokens.css`
   defaults; emitting curated values is a polish pass for first-class
   graduation, to be done with a render to eyeball each.

Tests: `test/unit/palette/theme-{color,contrast,derive,serialize}.test.js`
(run via `npm run test:palette`).
