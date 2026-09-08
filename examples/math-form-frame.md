---
marp: true
theme: indaco
paginate: true
header: "Lattice · Math on the Form frame"
footer: "Confidential"
meta: "Q3 Review"
acronyms:
  OLS: "ordinary least squares"
  CI: "confidence interval"
  SD: "standard deviation"
  IVT: "intermediate value theorem"
  LU: "L U"
---

<!-- _class: title silent -->

`Math · the frame it never needed`

# Eight variants, one frame

Every slide after this one is a math slide on the shared Form frame. The running header, the footer and page number, and the **Q3 REVIEW** mark in the masthead bay are what a chrome-exempt section could never render — `meta:` did nothing at all on a math slide until this change.

---

<!-- _class: math -->

`Linear regression · OLS`

## The hero equation and its legend, side by side.

$$ \hat\beta = (X^\top X)^{-1} X^\top y $$

- $\hat\beta$ — OLS coefficient vector
- $X$ — design matrix, $n \times p$
- $y$ — response vector, length $n$
- $X^\top X$ — Gram matrix, $p \times p$, must be invertible

---

<!-- _class: math derivation -->

`Chain rule · four steps`

## The proof chain no longer pins its own heading.

| $f(x+h) = f(x) + f'(x)\,h + O(h^2)$ | Taylor, $n=2$ |
| ---------------------------------- | ------------- |
| $f(x+h) - f(x) = f'(x)\,h + O(h^2)$ | subtract $f(x)$ |
| $\frac{f(x+h)-f(x)}{h} = f'(x)+O(h)$ | divide by $h \neq 0$ |
| $\lim_{h\to 0} \frac{f(x+h)-f(x)}{h} = f'(x)$ | take the limit |

---

<!-- _class: math theorem -->

`Continuity · IVT`

## Cards center in the stage, not under an absolute title.

> **Definition.** A function $f : [a,b] \to \mathbb{R}$ is *continuous* on $[a,b]$ if $\lim_{x\to c} f(x) = f(c)$ for every $c \in [a,b]$.

> **Theorem.** Let $f$ be continuous on $[a,b]$ and let $y$ lie strictly between $f(a)$ and $f(b)$. Then there exists $c \in (a,b)$ with $f(c) = y$.

> **Proof.** Set $S = \{x \in [a,b] : f(x) < y\}$. $S$ is non-empty and bounded; let $c = \sup S$. Continuity at $c$ forces $f(c) = y$.

---

<!-- _class: math compare -->

`Estimators · asymptotics`

## The columns are the stage now, so nothing spans them.

### Ordinary least squares

$$ \hat\beta_{\text{OLS}} = (X^\top X)^{-1} X^\top y $$

Unbiased under exogeneity; minimum variance among linear unbiased estimators.

### Ridge

$$ \hat\beta_{\lambda} = (X^\top X + \lambda I)^{-1} X^\top y $$

Biased, lower variance. The penalty $\lambda$ buys stability when $X^\top X$ is ill-conditioned.

---

<!-- _class: math matrix -->

`Design matrix · structure`

## A wrapped property no longer returns to the left margin.

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
- **rank** — full rank is what gives OLS a unique solution
- **column 0** — all-ones, absorbs the intercept

---

<!-- _class: math matrix decompose -->

`LU · a factorization`

## A label that is a symbol is set as a symbol.

$$
\begin{pmatrix} 2 & 1 \\ 4 & 3 \end{pmatrix} =
\begin{pmatrix} 1 & 0 \\ 2 & 1 \end{pmatrix}
\begin{pmatrix} 2 & 1 \\ 0 & 1 \end{pmatrix}
$$

- **$A$** — the original matrix being factorized
- **$L$** — lower-triangular, unit diagonal
- **$U$** — upper-triangular
- **use** — solve $Ax = b$ by forward then back substitution

---

<!-- _class: math stats -->

`Effect size · the reading`

## The title lands where every other title in the deck lands.

$$ \hat\beta = 0.42 \pm 0.03 $$

> 95% CI: $[0.36,\; 0.48]$
> $p < 0.001 \quad\cdot\quad n = 1{,}204$

For every additional unit of exposure the outcome rises by 0.42 SD — roughly an **8%** shift on the baseline. The effect size is the headline; the $p$-value only rules out chance.

---

<!-- _class: math canvas -->

`Logistic link · the shape`

## The plot is sized against its cell, not against the slide.

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
