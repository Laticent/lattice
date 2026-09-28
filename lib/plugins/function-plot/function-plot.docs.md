# function-plot

Plot y = f(x), parametric, polar and implicit curves on any slide. A ` ```functionplot ` fence
holds a [function-plot](https://mauriciopoppe.github.io/function-plot/) config as JSON; the
browser draws it as an SVG in the deck's own palette. On a `math canvas` slide the plot sits
beside its equation, but the fence works on any slide.

This is a **plugin** (`engineering/decisions/2026-09-27-plugin-system.md`), the first with a
browser half. The `math` slide class lists it as `optional`: its `canvas` variant is designed to
hold a figure, and works with an image instead.

## Authoring

````markdown
<!-- _class: math canvas -->

## The logistic curve.

$$ \sigma(x) = \frac{1}{1 + e^{-x}} $$

S-shaped, with asymptotes at 0 and 1.

```functionplot
{
  "data": [{ "fn": "1 / (1 + exp(-x))" }],
  "xAxis": { "domain": [-6, 6] },
  "yAxis": { "domain": [-0.1, 1.1] }
}
```
````

- The body is **function-plot's own config**, not a Lattice grammar: `data[].fn` in its
  calculator notation (`exp(x)`, `sin(x)`, `x^2`), `fnType: "parametric" | "polar" | "implicit"`,
  axis `domain` and `label`, `annotations`. Leave `width`, `height` and `target` out — the host
  sets them from the box the layout gives the plot.
- The first three traces take the palette's accent, then two categorical inks; more traces fall
  back to muted, so they read as context.
- `latticeplot` is a **deprecated** name for the same fence. It still draws, and the render
  reports `function-plot/deprecated-alias`; rename the fence.

## Where it draws

| Surface | What it shows |
|---|---|
| Engine HTML | a placeholder, `data-lattice-settle="pending"` |
| Studio preview, Playground | the plot — the runtime loads `function-plot.js` from beside itself, only for a deck that has a plot |
| CLI PDF / PNG / PPTX | the plot — every capture waits until no placeholder is pending |
| HTML player (`--player`) | the plot, baked to static SVG |
| `--read` article | **not carried** — the article re-hosts equations, tables and charts, not plots (this predates the plugin) |
| `--fluid`, plain `--html` | the plot, drawn by the export page's own copy of the host; its library is linked from the exporting machine's `node_modules` by a `file://` path, so a copy opened elsewhere shows the config instead |
| Export to Marp | a code block showing the config (no Marp tool runs Lattice's plugins) |

## Failure behavior

- **The config is not JSON, or function-plot rejects it:** the slide shows
  `functionplot error: <message>` in the error ink, and the placeholder settles `error`.
- **The library never arrives** (offline, blocked): the slide shows the config itself, settled
  `unavailable`. If the library turns up later, the next pass draws.
- **A capture runs out of time** — 4 s for one plot's draw (`hydrate.budgetMs`), and the CLI
  waits up to 5 s in all (the longest draw plus a second for the library): the plot is closed
  `final` with its config shown, and the CLI says so. Nothing draws over a closed plot afterwards.
- **The library is not installed** (a clone that never ran `npm install`): the CLI warns once, and
  every plot shows its config.

## What the plugin contributes

| Role file | What it holds |
|---|---|
| `function-plot.manifest.json` | the fence and its alias, the hydrate, the library payload, the tokens, the per-surface products |
| `function-plot.render.js` | the fence renderer: the placeholder, from `ctx.hydrateAttrs` |
| `function-plot.hydrate.js` | the browser half — one self-contained function every browser surface runs |
| `function-plot.styles.css` | the palette overrides for function-plot's inline strokes, and the error surface |
| `function-plot.fixtures.md` | the conformance cases |

## See also

- `lib/components/math/math/math.docs.md` — the `canvas` variant that places a plot beside its
  equation.
- `lib/plugins/README.md` — the plugin host, the settle state and the fence table.
