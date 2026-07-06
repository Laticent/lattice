---
marp: true
theme: indaco
paginate: true
header: "Lattice · math"
---

<!-- _class: title silent -->

# math

`Evidence · Canvas · Prose`

Boardroom-quality math layouts for mathematicians, quants, ML researchers, physicists, statisticians, and economists. KaTeX-rendered equations with persona-appropriate surround.

---

<!-- _class: math -->
<!-- _footer: "Default · math" -->

`Linear regression · OLS`

## One equation, displayed; its symbols named below.

$$ \hat\beta = (X^\top X)^{-1} X^\top y $$

- $\hat\beta$ — OLS coefficient vector
- $X$ — design matrix, $n \times p$
- $y$ — response vector, length $n$
- $X^\top X$ — Gram matrix, $p \times p$, must be invertible


---

<!-- _class: math feature -->
<!-- _footer: "feature · math feature — Alias for the base layout — eyebrow, headline, hero equation, legend.…" -->

`Logistic regression · MLE`

## feature crowns the equation full-canvas.

$$ \ell(\beta) = \sum_{i=1}^{n} \left[ y_i \log \sigma(x_i^\top \beta) + (1 - y_i) \log\bigl(1 - \sigma(x_i^\top \beta)\bigr) \right] $$

- $\ell$ — log-likelihood, concave in $\beta$
- $\sigma$ — logistic link, $\sigma(z) = 1/(1+e^{-z})$
- $y_i$ — observed label, $\in \{0,1\}$
- $x_i$ — feature vector for observation $i$


---

<!-- _class: math derivation -->
<!-- _footer: "derivation · math derivation — Two-column table: derivation steps on the left, the justification for…" -->

## derivation walks the steps line by line.

| Step                                                     | Justification             |
| -------------------------------------------------------- | ------------------------- |
| $f(x+h) = f(x) + f'(x)\,h + O(h^2)$                      | Taylor expansion, $n = 2$ |
| $f(x+h) - f(x) = f'(x)\,h + O(h^2)$                      | subtract $f(x)$           |
| $\dfrac{f(x+h)-f(x)}{h} = f'(x) + O(h)$                  | divide by $h \neq 0$      |
| $\displaystyle\lim_{h\to 0} \dfrac{f(x+h)-f(x)}{h} = f'(x)$ | take the limit            |


---

<!-- _class: math theorem -->
<!-- _footer: "theorem · math theorem — Stacked color-coded blockquote cards in the formal-statement vocabul…" -->

## theorem boxes the statement and its proof.

> **Definition.** A function $f : [a,b] \to \mathbb{R}$ is *continuous* on $[a,b]$ if $\lim_{x\to c} f(x) = f(c)$ for every $c \in [a,b]$.

> **Theorem.** Let $f$ be continuous on $[a,b]$ and let $y$ lie strictly between $f(a)$ and $f(b)$. Then there exists $c \in (a,b)$ with $f(c) = y$.

> **Proof.** Set $S = \{x \in [a,b] : f(x) < y\}$. $S$ is non-empty and bounded; let $c = \sup S$. Continuity at $c$ forces $f(c) = y$. $\square$


---

<!-- _class: math compare -->
<!-- _footer: "compare · math compare — Side-by-side equation comparison. Each column has its own h3 label, d…" -->

## compare sets two formulations side by side.

### Frequentist

$$ \hat\theta_{\text{MLE}} = \arg\max_\theta\, p(y \mid \theta) $$

Maximizes the likelihood — no prior. Uncertainty quantified by the sampling distribution of $\hat\theta$ across hypothetical repeats.

### Bayesian

$$ \hat\theta_{\text{MAP}} = \arg\max_\theta\, p(\theta \mid y) $$

Maximizes the posterior — conditions on the prior $p(\theta)$. Uncertainty is the posterior itself, no repeated sampling required.


---

<!-- _class: math canvas -->
<!-- _footer: "canvas · math canvas — Pairs a hero equation with a `functionplot` graph (rendered by the fu…" -->

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


---

<!-- _class: math matrix -->
<!-- _footer: "matrix · math matrix — Hero matrix with a properties / dimensions / interpretation legend. B…" -->

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


---

<!-- _class: math stats -->
<!-- _footer: "stats · math stats — Point estimate with uncertainty (CI, $p$-value, $n$) followed by plai…" -->

## stats pairs the estimator with its variance.

$$ \hat\beta = 0.42 \pm 0.03 $$

> 95% CI: $[0.36,\; 0.48]$
> $p < 0.001 \quad\cdot\quad n = 1{,}204$

For every additional unit of exposure, the outcome rises by 0.42 SD — roughly an **8%** shift on the baseline. Effect size is the headline; the $p$-value just rules out chance.


---

<!-- _class: math matrix decompose -->
<!-- _footer: "decompose · math decompose — A compound of `matrix`: lays a factorisation out as a sequence of mat…" -->

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


---

<!-- _class: math derivation -->
<!-- stress-slide -->
<!-- _footer: "Stress test · math — Three steps — the longest chain." -->

`math · stress`

## Three displayed steps is the longest chain.

$$ \hat\beta = \arg\min_\beta \, \lVert y - X\beta \rVert_2^2 $$

$$ X^\top X \hat\beta = X^\top y $$

$$ \hat\beta = (X^\top X)^{-1} X^\top y $$

- Step one states the objective
- Step two takes the gradient to zero
- Step three is the ceiling — a fourth step means two slides


---

<!-- _class: math dark -->
<!-- _footer: "Composition: dark · math dark" -->

`Linear regression · OLS`

## One equation, displayed; its symbols named below.

$$ \hat\beta = (X^\top X)^{-1} X^\top y $$

- $\hat\beta$ — OLS coefficient vector
- $X$ — design matrix, $n \times p$
- $y$ — response vector, length $n$
- $X^\top X$ — Gram matrix, $p \times p$, must be invertible


---

<!-- _class: math compact -->
<!-- _footer: "Composition: compact · math compact" -->

`Linear regression · OLS`

## One equation, displayed; its symbols named below.

$$ \hat\beta = (X^\top X)^{-1} X^\top y $$

- $\hat\beta$ — OLS coefficient vector
- $X$ — design matrix, $n \times p$
- $y$ — response vector, length $n$
- $X^\top X$ — Gram matrix, $p \times p$, must be invertible


---

<!-- _class: math accent -->
<!-- _footer: "Composition: accent · math accent" -->

`Linear regression · OLS`

## One equation, displayed; its symbols named below.

$$ \hat\beta = (X^\top X)^{-1} X^\top y $$

- $\hat\beta$ — OLS coefficient vector
- $X$ — design matrix, $n \times p$
- $y$ — response vector, length $n$
- $X^\top X$ — Gram matrix, $p \times p$, must be invertible


---

<!-- _class: list -->
<!-- _footer: "Anti-patterns · math" -->

## When NOT to reach for math.

- **Two display equations in the base layout.** The bare math layout is built around one hero equation. For side-by-side display, use `math compare`. For a derivation chain, use `math derivation`. Stacking two `$$` blocks in the base layout breaks the visual contract.
- **Symbols without a legend.** An equation with three undefined symbols is a puzzle, not a claim. Either every non-trivial symbol gets a legend entry, or the equation is simple enough that the audience knows it cold.
- **ASCII math instead of KaTeX.** Writing `beta_hat = (X'X)^-1 X'y` as plain text bypasses the renderer. Always wrap math in `$$…$$` (display) or `$…$` (inline) — KaTeX is the entire reason this layout exists.

---

<!-- _class: closing silent -->

## See also.

`Related components`

- `code` — the implementation, not the equation, is the argument
- `diagram` — the structure of the model, not its closed form
- `stats` — a row of statistical results without a single equation focus
- `content` — one inline equation inside a paragraph of prose
