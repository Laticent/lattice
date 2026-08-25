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
| `serialize.js` | `serializeTheme(map, {name})` → droppable `themes/<name>.css` text (the `@theme` directive, `@import 'lattice'`, grouped `:root` blocks, then an **extras block** for names outside the contract). |
| `parse.js` | The **inverse**. `parseTheme(css)` → an ordered, selector-aware declaration record; `serializeThemeRecord` writes it back. `themeRecordView` is the four-bucket read (tokens · non-token root declarations · at-rules · the non-root tail). Hand-rolled rather than css-tree — see below. |
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
// → drop css into themes/dusk.css, or PG.addThemes([{ name, css }]) for live preview
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

`--code-inline-fg` joined them on 2026-08-17, and it is worth knowing why it was
on the *other* list for so long. It was filed under "decorative extras" — but the
inline-code chip is TEXT, held to 4.5:1, and the engine default it leaned on was
`var(--accent)`, an area token held to the 3:1 graphical floor with no text
contract at all. That is the `--cat-N-ink` shape exactly: an ink degrading onto a
value repaired for a weaker purpose. It shipped a chip at 4.36:1 on a card. Being
"decorative" is a claim about the element, not about the contrast contract its ink
has to meet. See `engineering/decisions/2026-08-17-dark-surface-ink.md`.

**Still deliberately outside the contract:** the purely *decorative* extras a
hand-tuned palette adds on its own initiative — the `--on-dark-*` tiers, the Marp
chrome mappings, `--spectrum-quiet`. Each of those has a default the engine's own
CSS supplies, so a generated theme without them renders exactly as intended. Note that "a default" is not always a `:root` one:
`--spectrum-quiet` is declared on the bare `section` slide root, which is a real
default for a CSS `var()` read and *not* one for the Mermaid map, whose reader
parses `:root` blocks out of the palette text. The gate splits those cases; a
sentence here that flattened them was wrong for a week.

## Reading a theme back (`parse.js`)

The Studio's hand-edit path needs the inverse of `serializeTheme`, and the naive
inverse — CSS back into a flat token map — is a data-loss bug. `serializeTheme`
walks the fixed `REQUIRED_TOKENS` list, so it is a **projection onto 107 names,
not a bijection**: any name outside the list is never emitted, and a
parse-then-serialize round-trip deletes it. Measured across `themes/`: **48
distinct non-contract custom properties, in 19 of the 32 files.** The extras
block in `serialize.js` is the producer half of the fix; `parse.js` is the reader.

**`REQUIRED_TOKENS` is the validator, never the emitter.** Three more things a
flat map cannot hold, each a shipped theme rather than a hypothetical:

- **`color-scheme` is not a token.** It sits under a root selector in 28 of 32
  themes, and `themes/ardesia-dark.css` is nothing but `@import 'ardesia';` plus
  `:root { color-scheme: dark; }`. Swallow it into a token map and
  re-serialization writes the hard-coded `color-scheme: light` over it — opening
  a dark theme and saving it makes it light. It gets its own bucket.
- **`@import` carries inheritance.** It is in 32 of 32 themes and is the *entire*
  token content of the 13 `*-dark` wrappers. Lose it and a correct file looks
  like ~106 missing tokens. (The four `a11y-*` variants both import *and* declare
  their own status trio, so they are not in that 13.)
- **The same name at two selectors.** Only `color-scheme` still doubles up —
  #1826 retired the palette-token duplicates and `checkPackedRootReach` now fails
  them — but the record is keyed by (selector, name) so the shape is
  representable.

The record keeps each node's source slice, so `serializeThemeRecord` returns an
untouched theme **byte-identically** and rewrites only the declarations marked
`dirty`. An author's formatting, blank lines and docblocks survive an edit
elsewhere in the file. `{ canonical: true }` re-renders every node from structure
instead, which is what keeps the fidelity path honest: it is the mode the
round-trip test drives, because raw echo alone would pass a parser that recorded
nothing.

**Not css-tree, deliberately.** It drops comments (a theme is substantially
comments — the `@theme` header the registry reads, and the a11y measurement
docblocks), and it is a serializer, so it would normalize `<\/style` back into a
live terminator — the HARD RULE #22 third-arm hazard, invisible to
`checkCssTreeRewrapSinks`, which discovers sinks by matching `prunePlayerCss(`.
This parser carries value bytes as written and so cannot manufacture a terminator
the source did not contain; a test pins that. It is **not** a sanitizer — the
guard for a document that embeds theme CSS stays at the frame
(`lib/core/sanitize-style-text.mjs`).

Tests: `test/unit/palette/theme-{color,contrast,cat-ink,derive,serialize,parse}.test.js`
(run via `npm run test:palette`).
