---
marp: true
theme: indaco
paginate: true
header: "Lattice · plugin system, phase B"
---

<!-- _class: title silent -->

# Plugins, phase B

`function-plot on the plugin host · a math fence · a tokenized KaTeX error`

---

<!-- _class: math canvas -->
<!-- _footer: "Unchanged pixels, one source: the runtime and the CLI page run the same hydrate." -->

`function-plot · one hydrate source`

## The curve comes from the same function on every surface.

$$ \sigma(x) = \dfrac{1}{1 + e^{-x}} $$

The logistic link: $S$-shaped, $\sigma(0) = 0.5$.

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

---

<!-- _class: math canvas -->
<!-- _footer: "The render reports function-plot/deprecated-alias." -->

`function-plot · the deprecated alias`

## An old latticeplot fence still draws, and says it is old.

$$ f(x) = \sin x \cdot e^{-x/4} $$

A damped oscillation, written with the old fence name.

```latticeplot
{
  "data": [{ "fn": "sin(x) * exp(-x/4)" }],
  "xAxis": { "domain": [0, 12], "label": "x" },
  "yAxis": { "domain": [-1, 1], "label": "f(x)" }
}
```

---

<!-- _class: math canvas -->
<!-- _footer: "The error settles the figure, so no capture waits on it." -->

`function-plot · a config that fails`

## A broken config says why, on the slide.

$$ g(x) = \sqrt{x} $$

The config below is missing its closing brace.

```functionplot
{ "data": [{ "fn": "sqrt(x)" }]
```

---

<!-- _class: math -->
<!-- _footer: "The spelling GitHub and GitLab use for display math." -->

`math · the fence form`

## A math fence typesets like a display block.

```math
\hat\beta = (X^\top X)^{-1} X^\top y
```

- $\hat\beta$ — the least-squares coefficients
- $X$ — the design matrix, one row per observation
- $y$ — the observed responses

---

<!-- _class: math -->
<!-- _footer: "KaTeX errorColor is var(--warn) now, not an inline #cc0000." -->

`math · a formula KaTeX cannot parse`

## A broken formula quotes itself in the theme's error ink.

$$ \frac{a}{b $$

- An unclosed group: $\left( x + y$ renders as its source
- An unknown command: $\dfracc{a}{b}$ shows the literal command
- A correct one beside them: $\frac{a}{b}$

---

<!-- _class: title silent -->

# Every figure settles before capture

`PDF · PNG · PPTX · --player · --read · the Studio export`
