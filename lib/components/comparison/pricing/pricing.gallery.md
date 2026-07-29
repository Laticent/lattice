---
marp: true
theme: indaco
paginate: true
header: "Lattice · pricing"
---

<!-- _class: title silent -->

# pricing

`Comparison · Grid · Structure`

Side-by-side plan tiers with prices, feature checklists, and one recommended column.

---

<!-- _class: pricing -->
<!-- _footer: "Default · pricing" -->

## Three tiers, one recommended column.

- Starter `$0`
  - [x] The checklist rows compare
  - [/] Slashed rows mean not included
  - [/] Same rows on every tier
- Growth `$49 / mo` *Most popular*
  - [x] The starred tier gets the accent
  - [x] Checks accumulate up the ladder
  - [/] One gap keeps it honest
- Enterprise `Custom`
  - [x] The top tier checks every row
  - [x] Custom replaces a number
  - [x] Nothing slashed up here


---

<!-- _class: pricing two -->
<!-- _footer: "two · pricing two — A pair of plans, head to head." -->

## two sets a pair of plans head to head.

- Self-serve `$49 / mo`
  - [x] Wider columns, more feature rows
  - [/] The gap that motivates upgrading
  - The simple path.
- Enterprise `Custom`
  - [x] Everything in self-serve
  - [x] The rows that close deals
  - The guided path.


---

<!-- _class: pricing four compact -->
<!-- _footer: "four · pricing four — The whole ladder, compact." -->

## four compact fits the whole ladder.

- Free `$0`
  - [x] One seat
  - [/] The rest
  - For trying.
- Team `$29`
  - [x] Five seats
  - [/] SSO
  - For starting.
- Growth `$49` *Most popular*
  - [x] SSO
  - [/] Support
  - For scaling.
- Enterprise `Custom`
  - [x] Everything
  - [x] Support
  - For fleets.


---

<!-- _class: pricing -->
<!-- stress-slide -->
<!-- _footer: "Stress test · pricing — Six feature rows per tier." -->

## Six lines of features per tier still hold.

- Starter `$0`
  - [x] Up to 3 seats
  - [x] Community support
  - [/] SSO
  - [/] Audit log
  - [/] Dedicated CSM
  - [/] 99.9% uptime SLA
  - For evaluating, one team.
- Growth `$49 / mo` *Most popular*
  - [x] Up to 25 seats
  - [x] Priority support
  - [x] SSO
  - [-] Audit log
  - [/] Dedicated CSM
  - [/] 99.9% uptime SLA
  - For scaling teams.
- Enterprise `Custom`
  - [x] Unlimited seats
  - [x] Dedicated support
  - [x] SSO + SCIM
  - [x] Audit log
  - [x] Dedicated CSM
  - [x] 99.9% uptime SLA
  - For procurement and compliance.


---

<!-- _class: pricing dark -->
<!-- _footer: "Composition: dark · pricing dark" -->

## Three tiers, one recommended column.

- Starter `$0`
  - [x] The checklist rows compare
  - [/] Slashed rows mean not included
  - [/] Same rows on every tier
- Growth `$49 / mo` *Most popular*
  - [x] The starred tier gets the accent
  - [x] Checks accumulate up the ladder
  - [/] One gap keeps it honest
- Enterprise `Custom`
  - [x] The top tier checks every row
  - [x] Custom replaces a number
  - [x] Nothing slashed up here


---

<!-- _class: pricing compact -->
<!-- _footer: "Composition: compact · pricing compact" -->

## Three tiers, one recommended column.

- Starter `$0`
  - [x] The checklist rows compare
  - [/] Slashed rows mean not included
  - [/] Same rows on every tier
- Growth `$49 / mo` *Most popular*
  - [x] The starred tier gets the accent
  - [x] Checks accumulate up the ladder
  - [/] One gap keeps it honest
- Enterprise `Custom`
  - [x] The top tier checks every row
  - [x] Custom replaces a number
  - [x] Nothing slashed up here


---

<!-- _class: cards-stack compact -->
<!-- _footer: "Anti-patterns · pricing" -->

## When NOT to reach for pricing.

- More than four tiers
  - Five-plus columns shrink below readability and the price comparison collapses. Curate to the tiers that matter, or use `compare-table` for a dense feature-by-plan matrix.
- Every tier marked popular
  - Elevate exactly one tier. Two ribbons cancel out and the eye has nowhere to land — the whole point of the marker is a single recommendation.
- Features that drift between tiers
  - If each tier lists a different set of features, the columns can't be compared row-for-row. Keep the feature list and order identical; toggle inclusion with `[x]` / `[/]`.
- A wall of red 'not included'
  - Use `[/]` (muted, struck through) for an absent feature, not `[ ]` (alarming empty/fail). A pricing table sells what's included; it shouldn't read as a list of denials.

---

<!-- _class: closing silent index -->

## See also.

`Related components`

- `compare-table` — a dense feature-by-plan matrix with many rows, not a few highlighted features
- `verdict-grid` — options scored on shared criteria, not priced tiers
- `cards-grid` — parallel items with no price and no shared feature checklist
- `decision` — the slide recommends one option outright rather than presenting a price ladder
- `big-number` — a single headline price, not a tiered comparison
