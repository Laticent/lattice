---
kind: plugin
name: Function plots
order: 5
promise: Write the function; the slide draws its graph in your theme.
intro: A `functionplot` code block holds a small config — the function, like `1 / (1 + exp(-x))`, and the range to show — and the slide draws the curve as a crisp vector graph in the deck's palette. Put it beside its equation on a math slide, or on any slide at all.
mark: /plugin-function-plot-mark.svg
useWhen: You teach or explain a function — a logistic curve, a decay, a loss curve — and a pasted chart image would be the wrong font, the wrong colors and impossible to change.
syntax: '```functionplot'
facts:
  - { k: You write, v: 'A ```functionplot fence of JSON' }
  - { k: Draws with, v: 'function-plot 1.25 (MIT), bundled' }
  - { k: Surfaces, v: Drawn in the browser; exports wait for it }
  - { k: Loaded, v: By default; free until a deck uses one }
reference:
  - label: The plugin's reference
    href: https://github.com/Laticent/lattice/blob/main/lib/plugins/function-plot/function-plot.docs.md
    note: The config, the colors, and what each surface shows.
  - label: A sample deck
    href: https://github.com/Laticent/lattice/blob/main/examples/plugin-system-phase-b.md
    note: Plots beside their equations, including what happens when one fails.
  - label: The math slide
    href: /components/math/math/
    note: Its canvas variant puts an equation beside its plot.
  - label: function-plot's own docs
    href: https://mauriciopoppe.github.io/function-plot/
    note: Every option the config can carry.
examples:
  - key: canvas
    label: Beside its equation
    caption: The math slide's canvas variant puts the formula beside its curve.
    sample: |
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
  - key: two
    label: Two curves
    caption: Each curve takes the next color from the palette. Labels and a grid are one line each.
    sample: |
      <!-- _class: math canvas -->

      ## Two squashing functions, one chart.

      $$ \sigma(x) = \frac{1}{1 + e^{-x}} $$

      The logistic saturates faster than $x / (1 + |x|)$.

      ```functionplot
      {
        "data": [
          { "fn": "1 / (1 + exp(-x))" },
          { "fn": "x / (1 + abs(x))" }
        ],
        "xAxis": { "domain": [-6, 6], "label": "x" },
        "yAxis": { "domain": [-1.1, 1.1], "label": "f(x)" },
        "grid": true
      }
      ```
  - key: simple
    label: The simplest plot
    caption: One function is all a plot needs.
    sample: |
      ## A parabola, in one line of config.

      ```functionplot
      { "data": [{ "fn": "x^2" }] }
      ```
---

## The problem

A teacher putting the logistic curve beside its formula, or an analyst showing how a signal decays, usually exports a chart image from another tool. It arrives in the wrong font and the wrong colors, blurs when printed, and changing the range means going back to that tool.

Here the curve is a few lines of text next to the equation. Changing what it shows means editing a number.

## The idea

- **The config is the source.** A ` ```functionplot ` block holds a small JSON object: the function in `fn`, and optionally the range of each axis. The function uses everyday calculator notation: `x^2`, `sin(x)`, `exp(-x/4)`, `abs(x)`.
- **It's drawn in the deck's colors.** The first curve takes the theme's main highlight color, the next two take its chart colors, and any more are drawn muted so they read as context.
- **It sizes itself.** Leave out width and height; the slide's layout decides how big the plot is.
- **It's drawn in the browser.** The Studio (Lattice's editor) and the Playground (the try-it page on this site) draw the graph live. When the command line exports a PDF, it waits until every plot has drawn before it captures the page, and the HTML export carries the finished drawing.

The config is function-plot's own, so its documentation covers every option.

## How to use it

Function plots are on in every deck. The smallest plot is one function:

````markdown
```functionplot
{ "data": [{ "fn": "x^2" }] }
```
````

Set what's visible with each axis's `domain`:

````markdown
```functionplot
{
  "data": [{ "fn": "1 / (1 + exp(-x))" }],
  "xAxis": { "domain": [-6, 6] },
  "yAxis": { "domain": [-0.1, 1.1] }
}
```
````

To put a plot beside its equation, use the `math` slide's `canvas` variant — write the equation with the [Math](/plugins/math/learn/) plugin, then the plot:

````markdown
<!-- _class: math canvas -->

## The logistic curve.

$$ \sigma(x) = \frac{1}{1 + e^{-x}} $$

```functionplot
{ "data": [{ "fn": "1 / (1 + exp(-x))" }], "xAxis": { "domain": [-6, 6] } }
```
````

| You want | Add |
| --- | --- |
| Another curve | another `{ "fn": "…" }` in `data` |
| Axis labels | `"label": "x"` inside `xAxis` or `yAxis` |
| A grid | `"grid": true` |

## Where else it fits

function-plot is a small open-source library for drawing math functions on the web, popular in teaching material and interactive notes. As a slide plugin it suits calculus and statistics lessons, machine-learning talks (activation and loss curves), economics (supply, demand and adoption curves) and signal processing (decays and oscillations).

## How Lattice uses it

The `math` slide lists this plugin as an optional companion: its `canvas` variant is designed to hold a figure beside an equation, and a plot is the natural one. The fence also works on any slide.

## What it doesn't do

- **It needs a browser to draw.** If the library is blocked or a plot takes too long, the slide shows the config instead, and the command line says so.
- **It isn't in every format.** The text-only article export leaves plots out, and a deck exported back to Marp format shows the config as code.
- **Bad JSON shows an error on the slide**, with the parser's message, rather than breaking the deck.
- **Treat it as a figure.** It's a static graph on the slide, not an interactive one you can pan or zoom.
