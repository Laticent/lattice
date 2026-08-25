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
| `gate.js` | The **validator** for hand-edited theme CSS. `gateThemeCss(css, { knownThemes })` → `{ ok, blocked, composes, findings }`. Composed from `lib/layout/gate.js`'s `find*` primitives, never from `gateCss` — see below. |
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
This parser carries value bytes as written — necessary, and **not sufficient**, which
this paragraph asserted until a maker-checker pass falsified it in one line:
`:root{x<\/;style>y:1;}` came back as `:root {x<\/style>y: 1;}`. Nothing was
re-escaped; a byte was **dropped**. A colon-less statement parses as a `raw` node,
the renderer omitted the `;` the source had, and the two fragments welded into a
terminator neither contained. **Removal composes just as well as escaping**, and an
argument that reasons only about the value channel does not see it. Fixed, and the
test now drives that path rather than only the string-value one that was always safe.

Worth keeping in view: **no HARD RULE #22 gate can see this file.** It is outside
`DOC_STYLE_SINK_ROOTS`, and `checkCssTreeRewrapSinks` matches `prunePlayerCss(`. A
serializer no gate watches is exactly the third-arm shape #22 exists for, so the
property is held by a test rather than by a claim. It is **not** a sanitizer — the
guard for a document that embeds theme CSS stays at the frame
(`lib/core/sanitize-style-text.mjs`).

## Gating a hand-edited theme (`gate.js`)

Reading a theme back is only half of hand-editing; the other half is that what
the author types reaches a **same-origin, un-sandboxed preview frame** holding
their BYOK OpenRouter key (HARD RULE #24). `gateThemeCss` is that rung.

**It is not `gateCss`, and it cannot be.** The component gate rejects **all 32**
shipped themes, and not for one reason. Measured:

| rung | the 19 palettes that declare color | the 13 `*-dark` wrappers |
| --- | --- | --- |
| `no-hex` (#3) | 22–194 findings each | 0 — they declare nothing |
| `scope` | 1–41 each | 1 each — their one `:root` block |
| `css-import` | 1 each | 1 each |

The first two are not near-misses to tune. A palette *is* hex literals at
`:root` — that is the one place in the system where a raw color is the correct
thing to write — and a theme is unscoped by construction, because reaching every
slide is its whole job. So the theme gate is **composed from the `find*`
primitives** and keeps only the half that transfers: the exfiltration scan.

**The `@import` allowlist is the interesting part, and it is a security
decision.** `CSS_EXFIL_RULES[0]` bans `@import` outright, which is right for a
component and impossible for a theme (32 of 32 have one; it is the entire token
content of 13). Dropping the rule for themes opens a live channel:
`resolveThemeImports` leaves an unknown name in place, and `hoistImports`
(`lib/engine/css.js`) then lifts every surviving quoted import to the **top** of
the composed sheet, specifically so it survives the "@import must come first"
rule. An unregistered target is therefore a live fetch in first position. What
makes it inert today is that theme CSS is never first in the `<style>` — an
accident of concatenation order, gated by nothing. So:

- **allowed** — a bare quoted import of a **registered** theme name, spelled
  literally, with nothing after it;
- **rejected** — `url(…)`, a quoted path or URL, an unregistered name, an
  unquoted target, a **self-import**, an **escaped** spelling (`'\61 rdesia'`),
  an **uppercase** at-keyword (`@IMPORT`), and any `layer()` / `supports()` /
  media-query **tail**.

Three of those are worth their own sentence, because each was a live bypass in
the first cut of this gate and each has the same shape:

- **Detect with browser semantics; judge with the resolver's.** The scan decodes
  CSS escapes and matches `@import` case-insensitively, because a browser does —
  otherwise `@imp\ort url(//evil)` is invisible. But the *allow* decision runs an
  anchored copy of the engine's own `THEME_NAME_IMPORT_RE` over the **raw source
  bytes**, because that is what decides whether the import resolves. Judging the
  decoded reading let `@import '\61 rdesia'` pass as the registered theme
  `ardesia` while the engine left it in place — composed sheet starting
  `@import '\61 rdesia';`, in first position, live. The test proves the subset
  relation by running the engine's actual regex object over every statement the
  gate allows.
- **A tail is not pedantry.** Both engine grammars end at the closing quote, so a
  qualified import does not resolve at all — which is exactly the case that gets
  hoisted and fetched.
- **A theme cannot import itself.** `resolveThemeImports` breaks a cycle by
  *leaving the import in place*, so a perfectly registered name reaches position 0
  as a live fetch. The gate reads the sheet's own `@theme` directive to catch it.
  A *mutual* cycle (A imports B, B imports A) is not visible to a gate that sees
  one file — pass a predicate for `knownThemes` if your host can answer that.

The registry is an **argument, not a search** (the discipline
`ThemeStore.add(name, css)` adopted), and it **fails closed**: `knownThemes`
defaults to `['lattice']`, so a caller that forgets to pass one gets the
strictest behavior rather than the loosest. It means **what the live `ThemeStore`
holds**, not the shipped catalog — a palette that has not been fetched is not
registered, and an import of it is hoisted rather than resolved. An iterable or a
`(name) => boolean` predicate; the predicate exists so a host that can answer a
harder question than set membership can say so.

Two more shapes worth knowing:

- **Conformance runs only on a self-contained theme.** A theme importing a
  palette inherits its tokens; `themes/ardesia-dark.css` declares 0 of the 107
  and is completely correct. Importing `lattice` is *not* composition — the base
  supplies no palette tokens, by the same rule that decides contract membership.
- **`ok` and `blocked` are separate.** Only the safety rung blocks (the
  `extraCss={cssBlocked ? '' : css}` pattern the component Studio already uses).
  A theme missing a contract token is wrong and still renders, so it stays
  visible while the author fixes it.

`ENGINE_DEFAULTED_TOKENS` is the one allowlist: `--on-accent-soft` and
`--accent-soft-body` are in `REQUIRED_TOKENS` because `deriveTheme` solves them
for contrast, but `lib/base/base.tokens.css` defaults both, and **no** shipped
palette declares either — so they warn instead of failing 14 files for writing
correct CSS. The test re-derives that set from the corpus, so a stale entry fails
as loudly as a missing one.

Tests: `test/unit/palette/theme-{color,contrast,cat-ink,derive,serialize,parse,gate}.test.js`
(run via `npm run test:palette`).
