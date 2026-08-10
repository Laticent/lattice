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

**Covered:** surfaces, the ink ramp, accent containers (with computed
`on-accent`), semantic signals, the dark-variant band, the 12-slot categorical
cycle (pale/deep tiers on the lightness contract, hue-spread around the accent)
*plus its on-canvas ink tier*, the containment tier, the spectrum ribbon,
structural strokes, the alarm fill, highlight.js syntax, and the chart-family
spectrums. Every pair the shipped gate asserts is repaired to AA in both modes —
see `test/unit/palette/theme-derive.test.js`.

**What decides whether a token belongs in the contract at all** is not how
contrast-critical or how visible it is — it is whether the engine gives it a
SAFE DEFAULT. `checkNoSafeDefaultTokens` computes that set from the CSS: a token
shipped palettes declare, `lib/` reads with no `var()` fallback, and nothing
declares at `:root` in the engine, must be in `REQUIRED_TOKENS`. Everything else
is optional polish, because a miss genuinely falls through.

That distinction was learned the expensive way, and this file taught the wrong
version of it until #1457. It used to call `--spectrum` and `--c-container`
"purely decorative extras… a generated theme renders today because these fall
through to `lattice.css`/`base.tokens.css` defaults." **Neither has a default
anywhere.** `--c-container` is read through the Mermaid map, whose export-path
reader substitutes a black sentinel that ships — solid black subgraph boxes on
5 of 8 slides of `examples/containment-tier.md`. `--spectrum` is read bare
inside `background:` shorthands, so a miss invalidated the whole declaration and
`section.dark` / `.divider` lost their canvas, painting near-white text on white
paper. Both are derived now, and the gate is what keeps the next one from
becoming a render bug. See
`engineering/decisions/2026-08-10-no-safe-default-token-contract.md`.

**Still deliberately outside the contract:** the purely *decorative* extras a
hand-tuned palette adds on its own initiative — `--code-inline-fg`, the
`--on-dark-*` tiers, the Marp chrome mappings, `--spectrum-quiet`. Each of those
has a default the engine's own CSS supplies, so a generated theme without them
renders exactly as intended. Note that "a default" is not always a `:root` one:
`--spectrum-quiet` is declared on the bare `section` slide root, which is a real
default for a CSS `var()` read and *not* one for the Mermaid map, whose reader
parses `:root` blocks out of the palette text. The gate splits those cases; a
sentence here that flattened them was wrong for a week.

Tests: `test/unit/palette/theme-{color,contrast,cat-ink,derive,serialize}.test.js`
(run via `npm run test:palette`).
