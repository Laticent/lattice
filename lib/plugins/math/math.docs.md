# math

Typeset math on any slide. `$…$` renders inline, and a paragraph that is exactly `$$…$$`
renders as a centered display equation. [KaTeX](https://katex.org/) draws both, synchronously,
at parse time — the same call on every surface, so the CLI's PDF, the HTML player, the Studio
and the Playground agree.

This is a **plugin** (`engineering/decisions/2026-09-27-plugin-system.md`). It contributes the
`$` syntax to every slide and owns the `math` slide class
(`lib/components/math/math/math.docs.md`), whose variants arrange an equation with its legend,
its derivation, a theorem card or a figure.

## Authoring

```markdown
<!-- _class: math -->

## The energy-mass equivalence.

$$
E = mc^2
$$

- `E` — energy (joules)
- `m` — mass (kilograms)
- `c` — speed of light (m/s)
```

- **Inline:** `$\pi r^2$`. An opening `$` must not be followed by a space, and a closing `$`
  must not follow a space or precede a digit, so currency prose (`$400M, up 28%, ahead by $18M`)
  stays text.
- **Display:** a block that opens with `$$` and closes on a line ending `$$`. Its body is opaque
  to Markdown: a lone `=` line inside a matrix is TeX, never a heading or a slide break.
- **Not supported:** `\(…\)` and `\[…\]`. A new delimiter goes in `math.syntax.mjs` (the rule
  *and* `detect`), and the plugin's fixtures prove the two agree.
- The supported TeX is KaTeX's: <https://katex.org/docs/supported.html>.

## What the plugin contributes

| Role file | What it holds |
|---|---|
| `math.manifest.json` | the two syntax rules (`math_inline`, `math_block`), their `$` trigger and host anchors, and the `math` component |
| `math.syntax.mjs` | the grammar — both markdown-it rules and `detect(source)`. Pure and KaTeX-free, so the boundary parser and the docs site's pre-scan import it without KaTeX's 76 KB gzip |
| `math.render.js` | the renderers — `katex.renderToString` behind a bounded memo, and the display-equation reflow for non-16:9 decks (`lib/core/tex-linebreak.js`) |
| `math.fixtures.md` | the conformance cases the plugin harness runs |

**Options** (`createEngine`): `math: false` disables the plugin (the `$` stays text);
`mathOutput` picks KaTeX's output mode (default `htmlAndMathml` — `lib/core/relationship.js`
reads the MathML annotation to label a split page's pointer, so `html` degrades that).

## Failure behavior

A malformed formula never aborts a deck. KaTeX runs with `throwOnError: false`, so a parse error
renders KaTeX's own error markup; a missing KaTeX module, a thrown error or a non-string result
renders the escaped source text. A display reflow that KaTeX cannot parse falls back to the
author's original TeX.

## Styling

KaTeX ships its own ~720-selector layout sheet. `tools/build-css.js` vendors
`node_modules/katex/dist/katex.min.css` into `dist/lattice.css`, before the components, so
Lattice's rules win on source order; the CLI's export page also links the local copy, and the
HTML player inlines the sheet when a page contains KaTeX output. Math takes its color from the
slide: `section.math` sets `var(--text-heading)`, and outside math slides
`lib/base/base.modifiers.css` sets `color: inherit` and scales inline math to the prose around it.

## See also

- `lib/components/math/math/math.docs.md` — the `math` slide class and its variants.
- `engineering/decisions/2026-07-10-landing-perf-katex-defer.md` — why the browser loads KaTeX
  only when `detect` finds math.
