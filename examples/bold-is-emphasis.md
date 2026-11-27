---
theme: indaco
pagination: true
header: "Lattice · bold is emphasis"
---

<!-- @meta{layout=title, class=silent} -->

# Bold is emphasis, never structure

`Fix · bold is emphasis`

A card's title, a tag's label and a KPI's value come from the item's own first line, so a bold word only adds weight.

---

<!-- @meta{layout=decision, footer="decision · the tag is the whole first line; a bold word inside it changes nothing (a leading bold run alone was the tag before)"} -->

## We build in region and keep the vendor as a fallback.

- Build in **region**
  - Keeps customer data inside the EU boundary the contract names.
- Keep the vendor
  - Covers the three months until our own cluster is certified.
- Delay a quarter
  - Costs the launch window and buys nothing we need.

---

<!-- @meta{layout=kpi, footer="kpi · the value is the plain first line (`1. **$2.4B** total` is now a lint error; --fix makes it this)"} -->

## Revenue ran ahead of plan while margin held.

1. $2.4B
   - Revenue
   - target $2.2B, up 9%
2. 42%
   - Gross margin
   - up 2pp on the quarter
3. $1.1B
   - Cash
   - up $180M on the quarter

---

<!-- @meta{layout=cards-grid, footer="cards-grid · a bold word stays in its title (the text after it was pushed to the right edge before)"} -->

## Three fixes are live in every region.

- **Routing** is live
  - Vans take the shortest legal route between jobs.
- Parts restock **daily**
  - Each van refills from the nearest depot.
- Billing goes out same day
  - Invoices leave when the job closes.

---

<!-- @meta{layout=inventory, footer="inventory · each row is a lead with its detail nested under it (it was `- **Lead.** detail`)"} -->

`Operating model · four parts`

## Four parts carry the operating model.

- Planning
  - Sets the quarter's targets from **last year's** actuals.
- Routing
  - Assigns each job to the nearest qualified technician.
- Parts
  - Keeps every van stocked from the nearest depot.
- Billing
  - Invoices the customer the day the job closes.

> The model holds because each part has one owner.

---

<!-- @meta{layout=citation-card, footer="citation-card · the action is the last item with a nested body (it was the one led by bold)"} -->

## The statute reaches household identifiers.

`Cal. Civ. Code §1798.140(v) · CCPA/CPRA`

> "Personal information" means information that identifies, relates to, describes, or could reasonably be linked with a particular consumer or household.

- In plain English: data tied to a household or a device is in scope, not only a named person.
- What we must do
  - Treat household identifiers as personal information in notice, retention and access requests.

---

<!-- @meta{layout=math, class=theorem, footer="math theorem · each card's label is its ### heading (it was a leading **Theorem.**)"} -->

## The intermediate value theorem in three cards.

> ### Definition.
>
> A function $f : [a,b] \to \mathbb{R}$ is *continuous* on $[a,b]$ if $\lim_{x\to c} f(x) = f(c)$ for every $c \in [a,b]$.

> ### Theorem.
>
> Let $f$ be continuous on $[a,b]$ and let $y$ lie strictly between $f(a)$ and $f(b)$. Then there is a $c \in (a,b)$ with $f(c) = y$.

> ### Proof.
>
> Set $S = \{x \in [a,b] : f(x) < y\}$ and let $c = \sup S$. Continuity at $c$ forces $f(c) = y$. $\square$

---

<!-- @meta{layout=math, class=matrix, footer="math matrix · each legend row is a label with its value nested (it was `- **shape** — value`)"} -->

## The design matrix carries an intercept column.

$$
X = \begin{pmatrix}
1 & x_{11} & \cdots & x_{1p} \\
1 & x_{21} & \cdots & x_{2p} \\
\vdots & \vdots & \ddots & \vdots \\
1 & x_{n1} & \cdots & x_{np}
\end{pmatrix}
$$

- shape
  - $n \times (p+1)$
- rows
  - observations
- cols
  - intercept + $p$ features
- rank
  - full rank, so OLS has a unique solution

---

<!-- @meta{layout=glossary, footer="glossary · the term is the whole lead, bold or not (a bold term kept its own styling before)"} -->

## Glossary

- **Run-rate** revenue
  - This quarter's revenue multiplied by four.
- Gross margin
  - Revenue less the direct cost of delivering it, as a share of revenue.
- Cash
  - Cash and equivalents on hand at the quarter's close.
