# math

> Boardroom-quality math layouts for mathematicians, quants, ML researchers, physicists, statisticians, and economists. KaTeX-rendered equations with persona-appropriate surround.

**Function** evidence · **Form** canvas · **Substance** prose

**Tags** `formula` · `assessment` · `reference`

Use when the slide IS the equation. KaTeX renders `$$…$$` as centered display blocks and `$…$` inline. Variants surround the math with the structure each persona expects: hero + legend (feature), step + justification (derivation), Definition/Theorem/Proof cards (theorem), side-by-side comparison (compare), equation + plot (canvas), matrix + properties (matrix), estimate ± uncertainty + interpretation (stats).

## Agent contract

### Slots

| Slot | Selector | Required | Description |
|---|---|---|---|
| `eyebrow` | `p:first-child > code` | no | Optional inline-code rubric above the heading (e.g. `Linear regression · OLS`). Authored as an inline-code paragraph, not a heading, so it stays lint-safe (no heading-order violation). |
| `heading` | `h2` | yes | One-sentence framing of what the math establishes. |
| `equation` | `p` | yes | Display equation wrapped in `$$…$$`. KaTeX renders centered. |
| `legend` | `ul > li` | no | 'where:' legend. Each li introduces an `$x$` symbol followed by its definition. |

## When to use

- **The equation IS the argument.** When a single closed-form expression, identity, or estimator carries the slide. KaTeX renders it; Lattice gives it the room. For surrounding prose with one inline `$x$`, use content.
- **Pick the variant from the persona.** Quants reach for feature and stats. ML researchers reach for canvas (equation + plot). Pure mathematicians reach for theorem and derivation. Linear-algebra-heavy work reaches for matrix. The base layout works for everyone.
- **Legend, not footnotes.** The `where:` list under the equation defines every symbol introduced. The audience should never have to scroll back to remember what $\hat\beta$ or $X$ stands for.

## When NOT to use

- **Two display equations in the base layout.** The bare math layout is built around one hero equation. For side-by-side display, use `math compare`. For a derivation chain, use `math derivation`. Stacking two `$$` blocks in the base layout breaks the visual contract.
- **Symbols without a legend.** An equation with three undefined symbols is a puzzle, not a claim. Either every non-trivial symbol gets a legend entry, or the equation is simple enough that the audience knows it cold.
- **ASCII math instead of KaTeX.** Writing `beta_hat = (X'X)^-1 X'y` as plain text bypasses the renderer. Always wrap math in `$$…$$` (display) or `$…$` (inline) — KaTeX is the entire reason this layout exists.

## Authoring

```markdown
<!-- _class: math -->

`Eyebrow · context`

## One-sentence framing of what the equation establishes.

$$ y = f(x) $$

- $y$ — what we predict
- $x$ — input variable
- $f$ — the relation under study
```

## Anatomy

```text
┌─────────────────────────────────────────┐
│  header                                 │
│  Equation heading.                      │
│                                         │
│  E = m c²    │  WHERE                   │
│              │  E = energy              │
│              │  m = mass                │
│              │  c = speed of light      │
│  footer                           1/19  │
└─────────────────────────────────────────┘
```

## Variants (component-specific)

### `feature` — feature

Alias for the base layout — eyebrow, headline, hero equation, legend.…

```markdown
<!-- _class: math feature -->

`Logistic regression · MLE`

## feature crowns the equation full-canvas.

$$ \ell(\beta) = \sum_{i=1}^{n} \left[ y_i \log \sigma(x_i^\top \beta) + (1 - y_i) \log\bigl(1 - \sigma(x_i^\top \beta)\bigr) \right] $$

- $\ell$ — log-likelihood, concave in $\beta$
- $\sigma$ — logistic link, $\sigma(z) = 1/(1+e^{-z})$
- $y_i$ — observed label, $\in \{0,1\}$
- $x_i$ — feature vector for observation $i$
```

### `derivation` — derivation

Two-column table: derivation steps on the left, the justification for…

```markdown
<!-- _class: math derivation -->

## derivation walks the steps line by line.

| Step                                                     | Justification             |
| -------------------------------------------------------- | ------------------------- |
| $f(x+h) = f(x) + f'(x)\,h + O(h^2)$                      | Taylor expansion, $n = 2$ |
| $f(x+h) - f(x) = f'(x)\,h + O(h^2)$                      | subtract $f(x)$           |
| $\dfrac{f(x+h)-f(x)}{h} = f'(x) + O(h)$                  | divide by $h \neq 0$      |
| $\displaystyle\lim_{h\to 0} \dfrac{f(x+h)-f(x)}{h} = f'(x)$ | take the limit            |
```

### `theorem` — theorem

Stacked color-coded blockquote cards in the formal-statement vocabul…

```markdown
<!-- _class: math theorem -->

## theorem boxes the statement and its proof.

> **Definition.** A function $f : [a,b] \to \mathbb{R}$ is *continuous* on $[a,b]$ if $\lim_{x\to c} f(x) = f(c)$ for every $c \in [a,b]$.

> **Theorem.** Let $f$ be continuous on $[a,b]$ and let $y$ lie strictly between $f(a)$ and $f(b)$. Then there exists $c \in (a,b)$ with $f(c) = y$.

> **Proof.** Set $S = \{x \in [a,b] : f(x) < y\}$. $S$ is non-empty and bounded; let $c = \sup S$. Continuity at $c$ forces $f(c) = y$. $\square$
```

### `compare` — compare

Side-by-side equation comparison. Each column has its own h3 label, d…

```markdown
<!-- _class: math compare -->

## compare sets two formulations side by side.

### Frequentist

$$ \hat\theta_{\text{MLE}} = \arg\max_\theta\, p(y \mid \theta) $$

Maximizes the likelihood — no prior. Uncertainty quantified by the sampling distribution of $\hat\theta$ across hypothetical repeats.

### Bayesian

$$ \hat\theta_{\text{MAP}} = \arg\max_\theta\, p(\theta \mid y) $$

Maximizes the posterior — conditions on the prior $p(\theta)$. Uncertainty is the posterior itself, no repeated sampling required.
```

### `canvas` — canvas

Pairs a hero equation with a `functionplot` graph (rendered by the fu…

```markdown
<!-- _class: math canvas -->

## canvas gives a long derivation the room.

$$ \sigma(x) = \dfrac{1}{1 + e^{-x}} $$

Maps $\mathbb{R} \to (0,1)$. $S$-shaped, $\sigma(0) = 0.5$, steepest slope at the origin.

```functionplot
{
  "data": [
    { "fn": "1 / (1 + exp(-x))" },
    { "fn": "tanh(x)" }
  ],
  "xAxis": { "domain": [-6, 6], "label": "x" },
  "yAxis": { "domain": [-1.1, 1.1], "label": "f(x)" },
  "grid": true
}
```
```

### `matrix` — matrix

Hero matrix with a properties / dimensions / interpretation legend. B…

```markdown
<!-- _class: math matrix -->

## matrix typesets the block structures.

$$
X = \begin{pmatrix}
1 & x_{11} & \cdots & x_{1p} \\
1 & x_{21} & \cdots & x_{2p} \\
\vdots & \vdots & \ddots & \vdots \\
1 & x_{n1} & \cdots & x_{np}
\end{pmatrix}
$$

- **shape** — $n \times (p+1)$
- **rows** — observations
- **cols** — intercept + $p$ features
- **rank** — full-rank for OLS to have a unique solution
- **column 0** — all-ones, absorbs the intercept
```

### `stats` — stats

Point estimate with uncertainty (CI, $p$-value, $n$) followed by plai…

```markdown
<!-- _class: math stats -->

## stats pairs the estimator with its variance.

$$ \hat\beta = 0.42 \pm 0.03 $$

> 95% CI: $[0.36,\; 0.48]$
> $p < 0.001 \quad\cdot\quad n = 1{,}204$

For every additional unit of exposure, the outcome rises by 0.42 SD — roughly an **8%** shift on the baseline. Effect size is the headline; the $p$-value just rules out chance.
```

### `decompose` — decompose

A compound of `matrix`: lays a factorisation out as a sequence of mat…

```markdown
<!-- _class: math matrix decompose -->

## decompose colors the terms it names.

$$
\begin{pmatrix} 2 & 1 \\ 4 & 3 \end{pmatrix}
=
\begin{pmatrix} 1 & 0 \\ 2 & 1 \end{pmatrix}
\begin{pmatrix} 2 & 1 \\ 0 & 1 \end{pmatrix}
$$

- **$A$** — the original matrix being factorized
- **$L$** — lower-triangular, unit diagonal
- **$U$** — upper-triangular
- **use** — solve $Ax = b$ by forward then back substitution
```

## Universal modifiers

This component accepts all universal variants (`dark`, `compact`, `accent`, state markers, treatments). See [design/design-system.md §6.5](../../../../design/design-system.md#65-universal-variants--three-tiers) for the catalog.

## Related components

- [`code`](../../code/code/code.docs.md) — the implementation, not the equation, is the argument
- [`diagram`](../../diagram/diagram/diagram.docs.md) — the structure of the model, not its closed form
- [`stats`](../../evidence/stats/stats.docs.md) — a row of statistical results without a single equation focus
- [`content`](../../statement/content/content.docs.md) — one inline equation inside a paragraph of prose

## Demo deck

See [math.gallery.light.pdf](./math.gallery.light.pdf) for rendered examples of every variant.
