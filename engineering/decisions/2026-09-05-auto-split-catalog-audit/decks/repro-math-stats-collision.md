---
size: portrait
theme: indaco
paginate: true
---

<!-- _class: math -->

## Why one threshold could not serve every tenant.

$$ P(\text{match}) = \sigma(w^\top \phi(a,b) + b_t) $$

- $\phi(a,b)$ — field-level similarity between two records
- $w$ — weights, shared across tenants
- $b_t$ — the per-tenant offset we added this quarter

---

<!-- _class: math stats -->

## Why one threshold could not serve every tenant.

$$ P(\text{match}) = \sigma(w^\top \phi(a,b) + b_t) $$

- $\phi(a,b)$ — field-level similarity between two records
- $w$ — weights, shared across tenants
- $b_t$ — the per-tenant offset we added this quarter
