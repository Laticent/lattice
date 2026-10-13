---
marp: true
theme: indaco
paginate: true
header: "Lattice · math"
---

<!-- _class: title silent -->

`Feature demo · math`

# A lone equation takes the whole slide.

The `math` layout used to hold a legend column open for an equation that had no legend: a
divider and an empty half. With no legend it now centers the equation on the full stage, and
the alignment modifiers move it.

---

<!-- _class: math -->

`Default`

## With no legend, the equation is centered.

$$
\int_0^\infty e^{-x^2}\,dx = \frac{\sqrt{\pi}}{2}
$$

---

<!-- _class: math align-left align-middle -->

`align-left align-middle`

## `align-left` moves it to the left margin.

$$
\int_0^\infty e^{-x^2}\,dx = \frac{\sqrt{\pi}}{2}
$$

---

<!-- _class: math align-right align-middle -->

`align-right align-middle`

## `align-right` moves it to the right.

$$
\int_0^\infty e^{-x^2}\,dx = \frac{\sqrt{\pi}}{2}
$$

---

<!-- _class: math align-center align-bottom -->

`align-center align-bottom`

## `align-bottom` drops it to the foot of the slide.

$$
\int_0^\infty e^{-x^2}\,dx = \frac{\sqrt{\pi}}{2}
$$

---

<!-- _class: math -->

`With a legend, the split stays`

## One equation, its symbols named beside it.

$$
\hat\beta = (X^\top X)^{-1} X^\top y
$$

- $\hat\beta$ — the OLS coefficient vector
- $X$ — the design matrix
- $y$ — the response

---

<!-- _class: math align-middle -->

`A longer equation still fits`

## A longer equation still fits.

$$
\mathcal{L}(\theta) = -\frac{1}{N}\sum_{i=1}^{N}\Big[y_i \log \sigma(x_i^\top\theta) + (1-y_i)\log\big(1-\sigma(x_i^\top\theta)\big)\Big] + \lambda\lVert\theta\rVert_2^2
$$

---

<!-- _class: math feature align-right align-bottom -->

`feature behaves the same`

## `math feature` with no legend follows the same modifiers.

$$
\int_0^\infty e^{-x^2}\,dx = \frac{\sqrt{\pi}}{2}
$$
