---
marp: true
size: portrait
theme: indaco
paginate: true
header: "Lattice · math splits on structure"
footer: "Engineering"
acronyms:
  OLS: "ordinary least squares"
  MLE: "maximum likelihood estimation"
  CI: "confidence interval"
  IVT: "intermediate value theorem"
---

<!-- _class: title silent -->

`math · #2136 · four structures, not eight variants`

# A math slide has a seam. It just is not where the variant names are.

Every math slide after this one is at `size: portrait`, where the split fires. Eight variants render **four** structures, so there are four preprocessors — and two scaffolds that keep the whole slide, because they have nothing to slice.

---

<!-- _class: content -->

## What each structure does when the box gets tall

- Equation and legend
  - The equation rides every page; the symbols page under it. A legend page without its equation is unreadable.
- Step table
  - The heading opens the run, then one proof step per page — each equation back on one line at full size.
- Card stack
  - Definition, Theorem and Proof were three cards crushed into one column. Now they are three pages.
- Columns
  - One labeled formulation per page, full measure, instead of two half-width columns stacked.

---

<!-- _class: math -->

`Linear regression · OLS`

## Equation and legend: the symbols page under the equation.

$$ \hat\beta = (X^\top X)^{-1} X^\top y $$

- $\hat\beta$ — OLS coefficient vector
- $X$ — design matrix, $n \times p$
- $y$ — response vector, length $n$
- $X^\top X$ — Gram matrix, $p \times p$, must be invertible

---

<!-- _class: math feature -->

`Logistic regression · MLE`

## The equation that was too wide for the slide, broken across lines.

$$ \ell(\beta) = \sum_{i=1}^{n} \left[ y_i \log \sigma(x_i^\top \beta) + (1 - y_i) \log\bigl(1 - \sigma(x_i^\top \beta)\bigr) \right] $$

- $\ell$ — log-likelihood, concave in $\beta$
- $\sigma$ — the logistic link
- $y_i$ — observed label, $\in \{0,1\}$
- $x_i$ — feature vector for observation $i$

---

<!-- _class: math derivation -->

`Chain rule · four steps`

## Step table: one step per page, each on a single line.

| $f(x+h) = f(x) + f'(x)\,h + O(h^2)$ | Taylor, $n=2$ |
| ---------------------------------- | ------------- |
| $f(x+h) - f(x) = f'(x)\,h + O(h^2)$ | subtract $f(x)$ |
| $\frac{f(x+h)-f(x)}{h} = f'(x)+O(h)$ | divide by $h \neq 0$ |
| $\lim_{h\to 0} \frac{f(x+h)-f(x)}{h} = f'(x)$ | take the limit |

---

<!-- _class: math theorem -->

`Continuity · IVT`

## Card stack: one card per page, so a proof is read, not skimmed.

> **Definition.** A function $f : [a,b] \to \mathbb{R}$ is *continuous* on $[a,b]$ if $\lim_{x\to c} f(x) = f(c)$ for every $c \in [a,b]$.

> **Theorem.** Let $f$ be continuous on $[a,b]$ and let $y$ lie strictly between $f(a)$ and $f(b)$. Then there exists $c \in (a,b)$ with $f(c) = y$.

> **Proof.** Set $S = \{x \in [a,b] : f(x) < y\}$. $S$ is non-empty and bounded; let $c = \sup S$. Continuity at $c$ forces $f(c) = y$.

---

<!-- _class: math compare -->

`Estimators · asymptotics`

## Columns: one formulation per page, at the full measure.

### Ordinary least squares

$$ \hat\beta_{\text{OLS}} = (X^\top X)^{-1} X^\top y $$

Unbiased under exogeneity; minimum variance among linear unbiased estimators.

### Ridge

$$ \hat\beta_{\lambda} = (X^\top X + \lambda I)^{-1} X^\top y $$

Biased, lower variance. The penalty $\lambda$ buys stability when $X^\top X$ is ill-conditioned.

---

<!-- _class: math stats -->

`Effect size · the reading`

## A fixed scaffold keeps the whole slide: there is nothing to slice.

$$ \hat\beta = 0.42 \pm 0.03 $$

> 95% CI: $[0.36,\; 0.48]$
> $p < 0.001 \quad\cdot\quad n = 1{,}204$

The estimate, its uncertainty and the reading are one statement in three parts. Cut them apart and each page says less than the whole did, so this variant is left whole and rings if it ever runs long.
