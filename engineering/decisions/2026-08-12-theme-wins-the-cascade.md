---
status: shipped
summary: The export path composed `palette + lattice`, so `base.tokens.css`'s universal defaults overrode every value a palette curated — both declare tokens at plain `:root`, equal specificity, and source order alone decides. Measured in Chromium by composing the real sheet both ways and diffing every computed custom property: 36 tokens on indaco, 48 on onyx, 52 on cuoio, identical in light and dark. The engine's own `composeCss` inlines the base AT the theme's `@import` site and has always been correct, so the two render paths disagreed about the cascade (HARD RULE #1) and this one was wrong. One line in `lattice-emulator.js`. The visible half is narrower than the token count implies and that distinction is the interesting part: mermaid reads its tokens through `parsePaletteVars(layoutCSS + paletteCSS)`, already the correct order, so every palette's curated `--diagram-*` semantics were ALREADY rendering — a claim made and then retracted during this investigation. What actually changed on screen is the code panel on every palette, the status inks and inline-code chips where a palette diverged from base, and cuoio's title slide, whose own on-dark ramp had never applied.
---

# The palette wins the cascade

**2026-08-12 · branch `claude/cascade-theme-wins`**

**Area:** `lattice-emulator.js`

## The defect

One line:

```js
const css = paletteCSS + '\n' + layoutCSS;   // was
const css = layoutCSS + '\n' + paletteCSS;   // is
```

`${css}` is the single stylesheet the emulator injects into the document shell it
rasterizes. Both halves declare tokens at plain `:root` — equal specificity, (0,0,1) —
so **source order alone decides**, and the palette landing first meant the base's
universal defaults overrode everything the palette curated.

`base.tokens.css` documents the opposite as the contract: *"a palette's own `:root`
override is the identical selector at equal specificity and loads AFTER this base block
(themes `@import 'lattice'` first), so source order resolves it."* That is true of the
engine's `composeCss`, which substitutes the base **at** the theme's `@import 'lattice'`
site and therefore leaves the theme's own block last. It was false of this path.

So the two render paths disagreed about the cascade — the thing HARD RULE #1 exists to
prevent — and the emulator was the one that was wrong. It had also already got it right
in its own two other composition sites, which is what made the bug so quiet:

| site | order | status |
|---|---|---|
| mermaid token parse (`:890`, `parsePaletteVars`) | `layout + palette` | correct |
| svg-look scratch document (`:2939`) | `layout + palette` | correct |
| **the document shell (`:691`, emitted at `:1946`)** | `palette + layout` | **the bug** |

## How big, measured rather than reasoned

Composing the real sheet both ways in Chromium and diffing every custom property's
computed value on a slide section:

| palette | tokens the base was overriding |
|---|---|
| indaco | 36 |
| onyx | 48 |
| cuoio | 52 |

Identical counts in light and dark mode. The families: every palette's
`--diagram-active` / `-done` / `-critical` / `-note` / `-today` **and their `-mark`
strokes**, `--chart-state-*`, `--status-*`, `--pass` / `--warn` / `--fail` with their
`-bg` mixes, the nine-stop `--seq-*` ramp, `--code-text`, `--code-inline-fg`,
`--journey-stage-fg`, all twelve `--hljs-*`, and the four `--on-dark-*` rungs.

A first attempt measured this with a regex over CSS and **under-reported it** — it
missed `--pass` entirely because its `[^}]*` block matcher did not survive the bundle's
shape. That number was discarded rather than published. Custom-property resolution is
the browser's job; ask the browser.

## The token count is NOT the visible change, and that distinction cost a retraction

Mid-investigation this note's author told the user that every palette's curated diagram
semantics had never rendered. **That was wrong, and it is recorded here because the
reasoning error is the reusable part.** `--diagram-*` reaches Mermaid through
`parsePaletteVars(layoutCSS + '\n' + paletteCSS)` at `:890` — already the correct order
— so the gantt has always been painted in the palette's own values. Verified on a real
render: indaco's peach `--diagram-active` (`#ECC0A8`, not the base's `#F5E6D8`) and deep
red `--diagram-critical` (`#A91C2A`, not `#C20000`), and the page is **byte-identical
before and after this fix**.

The lesson: a token's computed CSS value and its rendered effect are different
questions whenever a consumer reads the token outside the cascade. Diffing computed
properties measures the first. Only a render measures the second, and the claim that
was wrong was a claim about the second made from evidence about the first.

## What actually changes on screen

Same probe deck, before vs after, pixels changed per page:

| palette | title | status / semantics | code panel | gantt |
|---|---|---|---|---|
| indaco | 0 | 6,298 | 1,892 | 0 |
| cuoio | **6,152** | 1,243 | 3,864 | 0 |
| carta | 0 | 6,308 | 2,985 | 0 |
| onyx · concrete · a11y-deuteranopia | 0 | 0 | 3,835–3,864 | 0 |

Three real effects:

- **The code panel, on every palette** — `--code-text` and the `--hljs-*` set now come
  from the palette.
- **Status inks and inline-code chips**, wherever a palette curated a value the base
  also declares (indaco's `--pass: #2F6B12` over the base's `#2D6A3F`, its
  `--code-inline-fg: #006599` over `#006FA8`).
- **Cuoio's title slide** — cuoio is the one palette on `main` that declared its own
  `--on-dark-*` ramp, so this is the first time it applies.

## Only `:root` tokens move

Three palettes carry real rules rather than only tokens, and each was checked:
`a11y-base`'s `section .chart-status[data-s=…]::before` content rules, and `onyx`'s and
`concrete`'s `section.dark:not(.print)` / `section.color-light:not(.print)` texture
blocks. Every one sits at a selector with **no equal-specificity competitor** in the
layout CSS, so they won before the change and win after it. Neither file uses a `url()`
`@import`, so the position-sensitivity of `@import` does not apply. The geometry,
orientation and marp-system blocks are appended after `${css}` in the document and keep
winning — which is what `composeCss` also intends ("Orientation CSS LAST so its
deck-wide `section { … }` wins source-order over the base token defaults").

## The gates were validating a fiction

`tools/contrast-audit.js` and the palette tests read theme **source**. They assert on
indaco's `--pass: #2F6B12` while the render used the base's `#2D6A3F`. So this change
does not merely restore intent: it makes the rendered deck match what every palette gate
in the repo already claims about it. That is also why no gate could have caught the bug
— they were all on the correct side of it.

## Consequence for the on-dark ink work

`claude/indeco-contrast-issues-yuj6px` curates all four `--on-dark-*` rungs for 19
palettes and notes that the 76 values are inert in the export path. This is the fix that
activates them. The two changes are deliberately separate branches (HARD RULE #17): this
one is a one-line cascade correction with a measured, palette-wide blast radius, and it
deserves review on its own terms rather than inside an ink change.
